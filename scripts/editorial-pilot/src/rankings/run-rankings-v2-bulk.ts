/**
 * Bulk runner v2 — drives the full RANKINGS_V2 matrix at scale.
 *
 * Features (per WS2.5 v3 of rankings-parity-yonder plan):
 *   - Concurrent batches (`--concurrency=N`, default 3 to stay below
 *     OpenAI tier-2 rate limits while keeping wall-clock low).
 *   - Per-slug intermediate cache in `data/rankings-cache/<slug>/`.
 *     A successful generation drops `generated.json`; the next run
 *     skips that slug unless `--force` is passed.
 *   - Resume-on-error: failures are logged but never crash the bulk
 *     run — they're collected at the end and printed as a sortable
 *     report.
 *   - Structured logs in `data/rankings-cache/_runlog.jsonl` (one
 *     JSON per attempt) for observability.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/rankings/run-rankings-v2-bulk.ts \
 *     [--concurrency=3] \
 *     [--limit=50] \
 *     [--source=manual,yonder,auto] \
 *     [--force] \
 *     [--dry-run] \
 *     [--draft] \
 *     [--no-push] \
 *     [--only=slug-a,slug-b]
 */

import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateRankingV2, type GeneratedRankingV2 } from './generate-ranking-v2.js';
import { GeneratedRankingV2Schema } from './generate-ranking-v2.js';
import { loadRankingsV2, matrixSeedToRankingSeed } from './rankings-catalog-v2.js';
import { pushRankingV2 } from './push-ranking-v2.js';
import type { MatrixSeed, MatrixSource } from './combinator.js';

// ─── Paths ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PILOT_ROOT = path.resolve(__dirname, '../..');
const CACHE_DIR = path.resolve(PILOT_ROOT, 'data/rankings-cache');
const RUNLOG_PATH = path.resolve(CACHE_DIR, '_runlog.jsonl');

// ─── CLI parsing ─────────────────────────────────────────────────────────

interface CliArgs {
  readonly concurrency: number;
  readonly limit: number | null;
  readonly sources: ReadonlySet<MatrixSource>;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly publish: boolean;
  readonly noPush: boolean;
  readonly only: ReadonlySet<string> | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let concurrency = 3;
  let limit: number | null = null;
  let sources: Set<MatrixSource> = new Set(['manual', 'yonder', 'auto']);
  let force = false;
  let dryRun = false;
  let publish = true;
  let noPush = false;
  let only: Set<string> | null = null;
  for (const a of args) {
    if (a === '--force') force = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--draft') publish = false;
    else if (a === '--no-push') noPush = true;
    else if (a.startsWith('--concurrency=')) {
      const v = Number(a.slice('--concurrency='.length));
      if (Number.isFinite(v) && v > 0 && v <= 10) concurrency = Math.floor(v);
    } else if (a.startsWith('--limit=')) {
      const v = Number(a.slice('--limit='.length));
      if (Number.isFinite(v) && v > 0) limit = Math.floor(v);
    } else if (a.startsWith('--source=')) {
      const v = a.slice('--source='.length).trim();
      const allowed: MatrixSource[] = ['manual', 'yonder', 'auto'];
      sources = new Set(
        v
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is MatrixSource => allowed.includes(s as MatrixSource)),
      );
    } else if (a.startsWith('--only=')) {
      const v = a.slice('--only='.length).trim();
      only = new Set(
        v
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      );
    }
  }
  return { concurrency, limit, sources, force, dryRun, publish, noPush, only };
}

// ─── Cache helpers ───────────────────────────────────────────────────────

async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cacheDirFor(slug: string): string {
  return path.resolve(CACHE_DIR, slug);
}

async function readCachedGeneration(slug: string): Promise<GeneratedRankingV2 | null> {
  try {
    const raw = await readFile(path.join(cacheDirFor(slug), 'generated.json'), 'utf-8');
    const parsed = GeneratedRankingV2Schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeCachedGeneration(slug: string, ranking: GeneratedRankingV2): Promise<void> {
  const dir = cacheDirFor(slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'generated.json'), JSON.stringify(ranking, null, 2), 'utf-8');
}

interface RunLogEntry {
  readonly ts: string;
  readonly slug: string;
  readonly source: MatrixSource;
  readonly templateKey: string;
  readonly status: 'cached' | 'generated' | 'pushed' | 'skipped' | 'failed';
  readonly eligibleCount: number;
  readonly targetLength: number;
  readonly durationMs: number;
  readonly wordsTotal?: number;
  readonly entriesCount?: number;
  readonly faqCount?: number;
  readonly error?: string;
}

async function appendRunLog(entry: RunLogEntry): Promise<void> {
  await appendFile(RUNLOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
}

// ─── Concurrency primitive ───────────────────────────────────────────────

async function runWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const total = items.length;
  const worker = async (): Promise<void> => {
    while (cursor < total) {
      const i = cursor;
      cursor += 1;
      out[i] = await fn(items[i] as T, i);
    }
  };
  const workers: Promise<void>[] = [];
  const n = Math.min(limit, total);
  for (let w = 0; w < n; w += 1) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((w) => w.length > 0).length;
}

function summarizeWords(r: GeneratedRankingV2): {
  total: number;
  intro: number;
  sections: number;
  entries: number;
  faq: number;
} {
  const intro = countWords(r.intro_fr) + countWords(r.outro_fr);
  const sections = r.editorial_sections.reduce((a, s) => a + countWords(s.body_fr), 0);
  const entries = r.entries.reduce((a, e) => a + countWords(e.justification_fr), 0);
  const faq = r.faq.reduce((a, f) => a + countWords(f.answer_fr ?? ''), 0);
  return { total: intro + sections + entries + faq, intro, sections, entries, faq };
}

// ─── Single-seed driver ──────────────────────────────────────────────────

interface SeedResult {
  readonly slug: string;
  readonly ok: boolean;
  readonly status: RunLogEntry['status'];
  readonly error?: string;
  readonly wordsTotal?: number;
}

async function processSeed(
  seed: MatrixSeed,
  args: CliArgs,
  index: number,
  total: number,
): Promise<SeedResult> {
  const tag = `[${index + 1}/${total} ${seed.slug}]`;
  const t0 = Date.now();

  if (!seed.hasEnoughCandidates) {
    console.log(
      `${tag} ⤬ skipped: only ${seed.eligibleCount} eligible (target ${seed.targetLength}).`,
    );
    await appendRunLog({
      ts: new Date().toISOString(),
      slug: seed.slug,
      source: seed.source,
      templateKey: seed.templateKey,
      status: 'skipped',
      eligibleCount: seed.eligibleCount,
      targetLength: seed.targetLength,
      durationMs: 0,
    });
    return { slug: seed.slug, ok: true, status: 'skipped' };
  }

  let ranking: GeneratedRankingV2 | null = null;
  let cached = false;

  if (!args.force) {
    ranking = await readCachedGeneration(seed.slug);
    if (ranking !== null) {
      cached = true;
      console.log(`${tag} ↻ cached (skipping LLM)`);
    }
  }

  if (ranking === null) {
    if (args.dryRun) {
      console.log(`${tag} (dry-run) would generate (${seed.eligibleCount} eligible)`);
      return { slug: seed.slug, ok: true, status: 'skipped' };
    }
    try {
      const rs = matrixSeedToRankingSeed(seed);
      const eligible = seed.eligibleHotelIds; // ids only — we still need full HotelCatalogRow
      // The generator needs the catalog rows. We pull them from the
      // outer scope via the closure injected by `main()`.
      const catalog = catalogRef!;
      const eligibleRows = catalog.filter((h) => eligible.includes(h.id));
      ranking = await generateRankingV2(rs, eligibleRows);
      await writeCachedGeneration(seed.slug, ranking);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} ✗ generation failed: ${msg}`);
      await appendRunLog({
        ts: new Date().toISOString(),
        slug: seed.slug,
        source: seed.source,
        templateKey: seed.templateKey,
        status: 'failed',
        eligibleCount: seed.eligibleCount,
        targetLength: seed.targetLength,
        durationMs: Date.now() - t0,
        error: msg,
      });
      return { slug: seed.slug, ok: false, status: 'failed', error: msg };
    }
  }

  const words = summarizeWords(ranking);
  if (words.total < 3500) {
    console.warn(`${tag} ⚠ words=${words.total} < 3500 target`);
  }

  if (!args.noPush) {
    try {
      const rs = matrixSeedToRankingSeed(seed);
      await pushRankingV2(rs, ranking, { publish: args.publish, axes: seed.axes });
      console.log(
        `${tag} ✓ ${cached ? 'cached + ' : ''}pushed (entries=${ranking.entries.length}, faq=${ranking.faq.length}, words=${words.total})`,
      );
      await appendRunLog({
        ts: new Date().toISOString(),
        slug: seed.slug,
        source: seed.source,
        templateKey: seed.templateKey,
        status: 'pushed',
        eligibleCount: seed.eligibleCount,
        targetLength: seed.targetLength,
        durationMs: Date.now() - t0,
        wordsTotal: words.total,
        entriesCount: ranking.entries.length,
        faqCount: ranking.faq.length,
      });
      return { slug: seed.slug, ok: true, status: 'pushed', wordsTotal: words.total };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} ✗ push failed: ${msg}`);
      await appendRunLog({
        ts: new Date().toISOString(),
        slug: seed.slug,
        source: seed.source,
        templateKey: seed.templateKey,
        status: 'failed',
        eligibleCount: seed.eligibleCount,
        targetLength: seed.targetLength,
        durationMs: Date.now() - t0,
        wordsTotal: words.total,
        entriesCount: ranking.entries.length,
        faqCount: ranking.faq.length,
        error: msg,
      });
      return { slug: seed.slug, ok: false, status: 'failed', error: msg };
    }
  }

  console.log(
    `${tag} ✓ ${cached ? 'cached' : 'generated'} (no-push) (entries=${ranking.entries.length}, faq=${ranking.faq.length}, words=${words.total})`,
  );
  await appendRunLog({
    ts: new Date().toISOString(),
    slug: seed.slug,
    source: seed.source,
    templateKey: seed.templateKey,
    status: cached ? 'cached' : 'generated',
    eligibleCount: seed.eligibleCount,
    targetLength: seed.targetLength,
    durationMs: Date.now() - t0,
    wordsTotal: words.total,
    entriesCount: ranking.entries.length,
    faqCount: ranking.faq.length,
  });
  return {
    slug: seed.slug,
    ok: true,
    status: cached ? 'cached' : 'generated',
    wordsTotal: words.total,
  };
}

// Catalog reference shared with the worker pool. We keep it module-
// scoped so `processSeed` can close over it without prop-drilling.
let catalogRef: import('./load-hotels-catalog.js').HotelCatalogRow[] | null = null;

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  await ensureCacheDir();

  console.log('Loading rankings v2 matrix…');
  const loaded = await loadRankingsV2({ skipUnderfilled: false });
  catalogRef = [...loaded.catalog];

  console.log(
    `Catalog: ${loaded.catalog.length} hotels — Matrix: ${loaded.matrix.stats.emittedSeeds} seeds (manual=${loaded.matrix.stats.bySource.manual}, yonder=${loaded.matrix.stats.bySource.yonder}, auto=${loaded.matrix.stats.bySource.auto})`,
  );

  let targets: MatrixSeed[] = [...loaded.matrix.seeds];

  if (args.only !== null) {
    const wanted = args.only;
    targets = targets.filter((s) => wanted.has(s.slug));
  }
  targets = targets.filter((s) => args.sources.has(s.source));
  targets = targets.filter((s) => s.hasEnoughCandidates);

  // Generation order — manual first (highest priority), then yonder
  // mirrors, then auto. Within each tier, larger eligible counts go
  // first (they're the strongest pages SEO-wise).
  const sourceOrder: Record<MatrixSource, number> = { manual: 0, yonder: 1, auto: 2 };
  targets.sort((a, b) => {
    const so = sourceOrder[a.source] - sourceOrder[b.source];
    if (so !== 0) return so;
    const ec = b.eligibleCount - a.eligibleCount;
    if (ec !== 0) return ec;
    return a.slug.localeCompare(b.slug);
  });

  if (args.limit !== null) targets = targets.slice(0, args.limit);

  console.log(
    `\n→ Will process ${targets.length} ranking(s) — concurrency=${args.concurrency}, force=${args.force}, dry-run=${args.dryRun}, publish=${args.publish}, push=${!args.noPush}`,
  );
  console.log('');

  const t0 = Date.now();
  const results = await runWithConcurrency(targets, args.concurrency, (seed, idx) =>
    processSeed(seed, args, idx, targets.length),
  );
  const dt = Date.now() - t0;

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const cached = results.filter((r) => r.status === 'cached').length;
  const generated = results.filter((r) => r.status === 'generated').length;
  const pushed = results.filter((r) => r.status === 'pushed').length;

  console.log('\n━━━ Summary ━━━');
  console.log(`Wall-clock: ${(dt / 1000).toFixed(1)} s (concurrency=${args.concurrency})`);
  console.log(
    `OK: ${ok} (pushed=${pushed}, generated-only=${generated}, cached=${cached}, skipped=${skipped})`,
  );
  console.log(`FAIL: ${fail}`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.slug}: ${r.error ?? 'unknown error'}`);
    }
    process.exitCode = 1;
  }
  console.log(`\nRun log: ${RUNLOG_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
