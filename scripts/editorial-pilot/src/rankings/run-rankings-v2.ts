/**
 * v2 CLI runner — generates long-read editorial rankings (≥ 3500
 * words, comparison tables, glossary, callouts, sources, additional
 * editorial sections) and persists them.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/rankings/run-rankings-v2.ts --slug=meilleurs-palaces-france
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/rankings/run-rankings-v2.ts --slug=meilleurs-palaces-france,meilleurs-palaces-paris
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/rankings/run-rankings-v2.ts --all
 */

import { generateRankingV2 } from './generate-ranking-v2.js';
import { loadHotelsCatalog, type HotelCatalogRow } from './load-hotels-catalog.js';
import { pushRankingV2 } from './push-ranking-v2.js';
import { RANKINGS, type RankingSeed } from './rankings-catalog.js';

interface CliArgs {
  readonly slugs: readonly string[];
  readonly all: boolean;
  readonly publish: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let slugs: readonly string[] = [];
  let all = false;
  let publish = true;
  for (const a of args) {
    if (a === '--all') all = true;
    else if (a === '--draft') publish = false;
    else if (a.startsWith('--slug=')) {
      const v = a.slice('--slug='.length).trim();
      slugs = v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return { slugs, all, publish };
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((w) => w.length > 0).length;
}

async function runOne(
  seed: RankingSeed,
  catalog: ReadonlyArray<HotelCatalogRow>,
  publish: boolean,
): Promise<void> {
  const tag = `[${seed.slug}]`;
  const eligible = catalog.filter(seed.eligibility);
  console.log(`${tag} ${eligible.length} eligible hotel(s) (target ${seed.targetLength})`);
  if (eligible.length < 3) {
    console.log(`${tag} ⤬ skipped: not enough eligible candidates.`);
    return;
  }
  const t0 = Date.now();
  const ranking = await generateRankingV2(seed, eligible);
  const dt = Date.now() - t0;

  const wIntro = countWords(ranking.intro_fr);
  const wOutro = countWords(ranking.outro_fr);
  const wSections = ranking.editorial_sections.reduce((a, s) => a + countWords(s.body_fr), 0);
  const wEntries = ranking.entries.reduce((a, e) => a + countWords(e.justification_fr), 0);
  const wFaq = ranking.faq.reduce((a, f) => a + countWords(f.answer_fr ?? ''), 0);
  const wTotal = wIntro + wOutro + wSections + wEntries + wFaq;

  console.log(
    `${tag} ✓ generated in ${dt} ms — entries=${ranking.entries.length}, sections=${ranking.editorial_sections.length}, tables=${ranking.tables.length}, glossary=${ranking.glossary.length}, callouts=${ranking.editorial_callouts.length}, sources=${ranking.external_sources.length}, faq=${ranking.faq.length}, words_fr≈${wTotal} (intro=${wIntro}, sections=${wSections}, entries=${wEntries}, faq=${wFaq})`,
  );

  if (wTotal < 3500) {
    console.warn(`${tag} ⚠ total words ${wTotal} < 3500 target — consider re-running.`);
  }

  await pushRankingV2(seed, ranking, { publish });
  console.log(`${tag} ✓ persisted v2 (published=${publish})`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const catalog = await loadHotelsCatalog();
  console.log(`Loaded ${catalog.length} hotels from catalog.`);

  const targets: RankingSeed[] = [];
  if (args.slugs.length > 0) {
    for (const slug of args.slugs) {
      const r = RANKINGS.find((x) => x.slug === slug);
      if (r === undefined) {
        console.error(
          `No ranking with slug "${slug}". Known: ${RANKINGS.map((x) => x.slug).join(', ')}`,
        );
        process.exit(1);
      }
      targets.push(r);
    }
  } else if (args.all) {
    targets.push(...RANKINGS);
  } else {
    console.error(
      'Usage: tsx src/rankings/run-rankings-v2.ts --slug=<slug>[,<slug>...] | --all [--draft]',
    );
    process.exit(1);
  }

  console.log(`Generating v2 — ${targets.length} ranking(s)…`);
  let ok = 0;
  let fail = 0;
  for (const r of targets) {
    try {
      await runOne(r, catalog, args.publish);
      ok += 1;
      await new Promise((res) => setTimeout(res, 1500));
    } catch (err) {
      fail += 1;
      console.error(`[${r.slug}] ✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\nDone — ${ok} OK / ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
