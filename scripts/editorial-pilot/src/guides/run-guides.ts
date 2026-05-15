/**
 * CLI runner — generates editorial destination guides via the LLM
 * pipeline and persists them to `editorial_guides`.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/guides/run-guides.ts --slug=paris
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/guides/run-guides.ts --all
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/guides/run-guides.ts --all --draft     # generate without publishing
 *
 * Idempotent. Re-runs overwrite the row.
 */

import {
  DESTINATIONS,
  findDestinationBySlug,
  type DestinationGuideSeed,
} from './destinations-catalog.js';
import { generateGuide } from './generate-guide.js';
import { pushGuide } from './push-guide.js';

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

async function runOne(dest: DestinationGuideSeed, publish: boolean): Promise<void> {
  const tag = `[${dest.slug}]`;
  console.log(`${tag} generating…`);
  const t0 = Date.now();
  const guide = await generateGuide(dest);
  const dt = Date.now() - t0;
  console.log(
    `${tag} ✓ generated in ${dt} ms — sections=${guide.sections.length}, faq=${guide.faq.length}, highlights=${guide.highlights.length}, words_fr≈${guide.sections.reduce((acc, s) => acc + s.body_fr.split(/\s+/u).length, 0)}`,
  );
  await pushGuide(dest, guide, { publish });
  console.log(`${tag} ✓ persisted to editorial_guides (published=${publish})`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const targets: DestinationGuideSeed[] = [];
  if (args.slug !== null) {
    const d = findDestinationBySlug(args.slug);
    if (d === null) {
      console.error(
        `No destination with slug "${args.slug}". Known slugs: ${DESTINATIONS.map((x) => x.slug).join(', ')}`,
      );
      process.exit(1);
    }
    targets.push(d);
  } else if (args.all) {
    targets.push(...DESTINATIONS);
  } else {
    console.error('Usage: tsx src/guides/run-guides.ts --slug=<slug> | --all [--draft]');
    process.exit(1);
  }

  console.log(`Generating ${targets.length} guide(s)…`);
  let ok = 0;
  let fail = 0;
  for (const d of targets) {
    try {
      await runOne(d, args.publish);
      ok += 1;
      // throttle between calls (OpenAI 4o has ~10 RPM on tier 1, comfortable here)
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      fail += 1;
      console.error(`[${d.slug}] ✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`Done — ${ok} OK / ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
