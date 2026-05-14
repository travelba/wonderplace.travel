/**
 * inspect-matrix.ts — print the matrix stats and a sample of seeds
 * so we can sanity-check the combinator + templates without firing
 * the LLM pipeline.
 *
 * Pass `--filter=meilleurs-palaces` to grep slugs.
 * Pass `--all` to dump every seed.
 * Pass `--include-underfilled` to keep seeds with < MIN_ELIGIBLE.
 */

import { loadRankingsV2 } from './rankings-catalog-v2.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filterArg = args.find((a) => a.startsWith('--filter='));
  const filter = filterArg ? filterArg.slice('--filter='.length) : null;
  const showAll = args.includes('--all');
  const includeUnderfilled = args.includes('--include-underfilled');

  const { matrix, catalog } = await loadRankingsV2({
    skipUnderfilled: !includeUnderfilled,
  });

  console.log(`Loaded catalog: ${catalog.length} hotels`);
  console.log('');
  console.log('━━━ Matrix stats ━━━');
  console.log(`  Total candidates :   ${matrix.stats.totalCandidates}`);
  console.log(`  Emitted seeds :      ${matrix.stats.emittedSeeds}`);
  console.log(`  Dropped (underfill): ${matrix.stats.droppedUnderfilled}`);
  console.log(`  By source :          ${JSON.stringify(matrix.stats.bySource)}`);
  console.log('  By template :');
  for (const [k, v] of Object.entries(matrix.stats.byTemplate).sort((a, b) => b[1] - a[1])) {
    console.log(`    - ${k.padEnd(35)} ${v}`);
  }
  console.log('');

  let toShow = matrix.seeds;
  if (filter) {
    const re = new RegExp(filter, 'iu');
    toShow = toShow.filter((s) => re.test(s.slug) || re.test(s.titleFr));
  }
  console.log(`━━━ Seeds (${showAll ? 'all' : 'first 30'}) ━━━`);
  const slice = showAll ? toShow : toShow.slice(0, 30);
  for (const s of slice) {
    const ready = s.hasEnoughCandidates ? '✓' : '⚠';
    console.log(
      `  ${ready} [${s.source.padEnd(6)}] ${s.slug.padEnd(60)} eligibility=${String(s.eligibleCount).padStart(2)} target=${s.targetLength}`,
    );
  }
  console.log('');
  console.log(`Showing ${slice.length} of ${toShow.length} matching seed(s).`);
}

main().catch((err) => {
  console.error('[inspect-matrix] FAILED:', err);
  process.exit(1);
});
