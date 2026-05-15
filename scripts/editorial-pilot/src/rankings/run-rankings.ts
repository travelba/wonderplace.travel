/**
 * CLI runner — generates editorial rankings via the LLM pipeline and
 * persists them to `editorial_rankings` + `editorial_ranking_entries`.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/rankings/run-rankings.ts --slug=meilleurs-palaces-france
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/rankings/run-rankings.ts --all
 *
 * Prereq: `out/hotels-catalog.json` must exist (run list-hotels-for-rankings.ts).
 */

import { generateRanking } from './generate-ranking.js';
import { loadHotelsCatalog } from './load-hotels-catalog.js';
import { pushRanking } from './push-ranking.js';
import { RANKINGS, type RankingSeed } from './rankings-catalog.js';

interface CliArgs {
  readonly slug: string | null;
  readonly all: boolean;
  readonly publish: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let slug: string | null = null;
  let all = false;
  let publish = true;
  for (const a of args) {
    if (a === '--all') all = true;
    else if (a === '--draft') publish = false;
    else if (a.startsWith('--slug=')) slug = a.slice('--slug='.length).trim();
  }
  return { slug, all, publish };
}

async function runOne(
  seed: RankingSeed,
  catalog: readonly Awaited<ReturnType<typeof loadHotelsCatalog>>[number][],
  publish: boolean,
): Promise<void> {
  const tag = `[${seed.slug}]`;
  const eligible = catalog.filter(seed.eligibility);
  console.log(
    `${tag} ${eligible.length} eligible hotel(s) for ranking (target ${seed.targetLength})`,
  );
  if (eligible.length < 3) {
    console.log(`${tag} ⤬ skipped: not enough eligible candidates.`);
    return;
  }
  const t0 = Date.now();
  const ranking = await generateRanking(seed, eligible);
  const dt = Date.now() - t0;
  console.log(
    `${tag} ✓ generated in ${dt} ms — entries=${ranking.entries.length}, faq=${ranking.faq.length}, intro_words≈${ranking.intro_fr.split(/\s+/u).length}`,
  );
  await pushRanking(seed, ranking, { publish });
  console.log(`${tag} ✓ persisted (published=${publish})`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const catalog = await loadHotelsCatalog();
  console.log(`Loaded ${catalog.length} hotels from catalog.`);

  const targets: RankingSeed[] = [];
  if (args.slug !== null) {
    const r = RANKINGS.find((x) => x.slug === args.slug);
    if (r === undefined) {
      console.error(
        `No ranking with slug "${args.slug}". Known: ${RANKINGS.map((x) => x.slug).join(', ')}`,
      );
      process.exit(1);
    }
    targets.push(r);
  } else if (args.all) {
    targets.push(...RANKINGS);
  } else {
    console.error('Usage: tsx src/rankings/run-rankings.ts --slug=<slug> | --all [--draft]');
    process.exit(1);
  }

  console.log(`Generating ${targets.length} ranking(s)…`);
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
  console.log(`Done — ${ok} OK / ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
