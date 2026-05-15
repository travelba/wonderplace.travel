/**
 * scale-non-paris-palaces.ts — build briefs for every Atout France Palace
 * located outside Paris.
 *
 * Source of truth: Atout France official Palace registry, list published
 * 2025-09-11 (https://palace.atout-france.fr). These hotels are NOT flagged
 * `LabelRating_Palace` in DATAtourisme so we cannot auto-discover them via
 * the catalog crawl (see list-all-palaces.ts).
 *
 * Strategy: hardcode the 14 entries (slug, search query, INSEE department)
 * and call build-brief with `--force-palace` to override the missing flag.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

interface PalaceEntry {
  readonly slug: string;
  /** DATAtourisme search query — must hit the exact hotel name. */
  readonly query: string;
  /** French INSEE department code (75 = Paris, 06 = Alpes-Maritimes, …). */
  readonly dept: string;
  /** Free-form region label for logs. */
  readonly region: string;
}

const NON_PARIS_PALACES: readonly PalaceEntry[] = [
  // ─── Alpes (6) ──────────────────────────────────────────────────────────
  {
    slug: 'cheval-blanc-courchevel',
    query: 'Cheval Blanc Courchevel',
    dept: '73',
    region: 'Alpes/Courchevel',
  },
  {
    slug: 'fouquets-courchevel',
    query: "Fouquet's Courchevel",
    dept: '73',
    region: 'Alpes/Courchevel',
  },
  {
    slug: 'lapogee-courchevel',
    query: "L'Apogée Courchevel",
    dept: '73',
    region: 'Alpes/Courchevel',
  },
  { slug: 'le-k2-palace', query: 'Le K2 Palace', dept: '73', region: 'Alpes/Courchevel' },
  {
    slug: 'les-airelles-courchevel',
    query: 'Les Airelles Courchevel',
    dept: '73',
    region: 'Alpes/Courchevel',
  },
  { slug: 'hotel-royal-evian', query: 'Hôtel Royal Évian', dept: '74', region: 'Alpes/Évian' },
  // ─── Côte d'Azur & Sud-Est (6 hors Eden-Roc / Cheval Blanc ST déjà faits manuellement) ──
  {
    slug: 'les-airelles-saint-tropez',
    query: 'Château de la Messardière',
    dept: '83',
    region: "Côte d'Azur/Saint-Tropez",
  },
  {
    slug: 'chateau-saint-martin-vence',
    query: 'Château Saint-Martin Vence',
    dept: '06',
    region: "Côte d'Azur/Vence",
  },
  {
    slug: 'grand-hotel-cap-ferrat',
    query: 'Grand-Hôtel du Cap-Ferrat',
    dept: '06',
    region: "Côte d'Azur/Cap-Ferrat",
  },
  {
    slug: 'les-airelles-gordes',
    query: 'Airelles Gordes La Bastide',
    dept: '84',
    region: 'Provence/Gordes',
  },
  {
    slug: 'la-reserve-ramatuelle',
    query: 'La Réserve Ramatuelle',
    dept: '83',
    region: "Côte d'Azur/Ramatuelle",
  },
  {
    slug: 'villa-la-coste',
    query: 'Villa La Coste',
    dept: '13',
    region: 'Provence/Le Puy-Sainte-Réparade',
  },
  // ─── Sud-Ouest (1 hors Caudalie déjà fait) ──────────────────────────────
  {
    slug: 'les-pres-deugenie',
    query: "Les Prés d'Eugénie",
    dept: '40',
    region: 'Landes/Eugénie-les-Bains',
  },
  // ─── Caraïbes (1) ───────────────────────────────────────────────────────
  // Cheval Blanc St-Barth: French overseas department, DATAtourisme coverage
  // is unreliable. Attempted anyway; if it fails the brief stays absent and
  // we'll handle it via a manual brief later.
  {
    slug: 'cheval-blanc-st-barth',
    query: 'Cheval Blanc St-Barth',
    dept: '977',
    region: 'Caraïbes/Saint-Barthélemy',
  },
];

async function main(): Promise<void> {
  const briefsDir = resolve(process.cwd(), 'briefs-auto');
  const todo: PalaceEntry[] = [];
  for (const e of NON_PARIS_PALACES) {
    const briefPath = resolve(briefsDir, `${e.slug}.json`);
    if (existsSync(briefPath)) {
      console.log(`[skip] ${e.slug} — brief already exists`);
      continue;
    }
    todo.push(e);
  }

  console.log(`\n[scale-non-paris] ${todo.length} palaces to build\n`);

  const results: Array<{ slug: string; ok: boolean; elapsed_ms: number; error?: string }> = [];
  for (let i = 0; i < todo.length; i++) {
    const e = todo[i];
    if (!e) continue;
    const start = Date.now();
    console.log(`\n[${i + 1}/${todo.length}] ${e.slug} — ${e.query} (${e.region}, dept ${e.dept})`);
    try {
      await runBuildBrief(e);
      results.push({ slug: e.slug, ok: true, elapsed_ms: Date.now() - start });
      console.log(`  ✓ ${e.slug} built in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (err) {
      const msg = (err as Error).message;
      results.push({ slug: e.slug, ok: false, elapsed_ms: Date.now() - start, error: msg });
      console.error(`  ✗ ${e.slug} FAILED — ${msg}`);
    }
  }

  console.log(`\n━━━ scale-non-paris summary ━━━`);
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗';
    console.log(
      `  ${tag} ${r.slug} — ${(r.elapsed_ms / 1000).toFixed(1)}s${r.error ? ` — ${r.error}` : ''}`,
    );
  }
  const successes = results.filter((r) => r.ok).map((r) => r.slug);
  console.log(`\n[scale-non-paris] ${successes.length}/${results.length} successful`);
  if (successes.length > 0) {
    console.log(`\nNext step — run pipeline on built briefs:`);
    console.log(`  $env:EDITORIAL_PILOT_BRIEFS_DIR="briefs-auto"`);
    console.log(`  pnpm --filter ./scripts/editorial-pilot exec tsx src/run.ts \\`);
    console.log(`    ${successes.join(' ')}`);
  }
}

function runBuildBrief(entry: PalaceEntry): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    // CRITICAL: `shell: true` on Windows joins args with spaces and drops
    // unquoted boundaries, so `--query "Cheval Blanc Courchevel"` collapses
    // to just `Cheval`. We must (a) wrap multi-word values in shell-safe
    // quotes ourselves, AND (b) use `windowsVerbatimArguments: true` so the
    // CMD layer keeps our quoting intact.
    const isWin = process.platform === 'win32';
    const safeQuery = isWin ? `"${entry.query.replace(/"/g, '\\"')}"` : entry.query;
    const args = [
      'exec',
      'tsx',
      'src/enrichment/build-brief.ts',
      entry.slug,
      '--query',
      safeQuery,
      '--dept',
      entry.dept,
      '--force-palace',
    ];
    const child = spawn('pnpm', args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: isWin,
      windowsVerbatimArguments: isWin,
    });
    child.on('error', rejectP);
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`build-brief exited with code ${code}`));
    });
  });
}

main().catch((err) => {
  console.error(`[scale-non-paris-palaces] FATAL:`, err);
  process.exit(1);
});
