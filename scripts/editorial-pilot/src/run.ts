import { loadEnv, resolveProvider } from './env.js';
import { buildLlmClient } from './llm.js';
import { listAvailableBriefs, runPipelineForHotel } from './pipeline.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all') || args.length === 0;
  const explicitSlugs = args.filter((a) => !a.startsWith('--'));

  const env = loadEnv();
  const provider = resolveProvider(env);
  const llm = buildLlmClient(env, provider);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ConciergeTravel.fr — Sprint 1B editorial pilot');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Provider:      ${llm.provider}`);
  console.log(`  Model:         ${llm.model}`);

  const available = await listAvailableBriefs();
  const slugs = runAll ? available : explicitSlugs;
  const missing = slugs.filter((s) => !available.includes(s));
  if (missing.length > 0) {
    throw new Error(`Unknown brief(s): ${missing.join(', ')}. Available: ${available.join(', ')}`);
  }

  console.log(`  Hotels:        ${slugs.join(', ')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const results = [];
  for (const slug of slugs) {
    try {
      const result = await runPipelineForHotel(slug, llm);
      results.push({ slug, status: 'ok' as const, result });
    } catch (err) {
      console.error(`\n✗ ${slug} — FAILED:`, (err as Error).message);
      results.push({ slug, status: 'error' as const, error: (err as Error).message });
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const r of results) {
    if (r.status === 'ok') {
      const tokens = r.result.totalTokens;
      const lint = r.result.finalLintReport.counts;
      const initialLint = r.result.initialLintReport.counts;
      const cleanTag = r.result.finalLintReport.clean ? '✓ CLEAN' : '⚠ DIRTY';
      console.log(
        `  ✓ ${r.slug} — ${r.result.factCheckReport.final_recommendation} — ${tokens.input + tokens.output} tokens — linter ${initialLint.total}→${lint.total} (blocker ${initialLint.blocker}→${lint.blocker}, high ${initialLint.high}→${lint.high}) ${cleanTag}`,
      );
    } else {
      console.log(`  ✗ ${r.slug} — ${r.error}`);
    }
  }

  const anyError = results.some((r) => r.status === 'error');
  if (anyError) process.exit(1);
}

main().catch((err) => {
  console.error('\n[editorial-pilot] FATAL:', err);
  process.exit(1);
});
