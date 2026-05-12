import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { lintReport } from './linter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('Usage: tsx src/lint-files.ts <path1> [path2 ...]');
    process.exit(1);
  }

  for (const p of paths) {
    const full = resolve(__dirname, '..', p);
    const text = await readFile(full, 'utf-8');
    const report = lintReport(text);
    console.log(`\n━━━ ${p} ━━━`);
    console.log(
      `  Total: ${report.counts.total} | Blocker: ${report.counts.blocker} | High: ${report.counts.high} | Medium: ${report.counts.medium} | Low: ${report.counts.low}`,
    );
    console.log(`  Clean (blocker+high=0): ${report.clean ? 'YES' : 'NO'}`);
    console.log('');
    if (report.violations.length > 0) {
      console.log('  Top violations:');
      for (const v of report.violations.slice(0, 30)) {
        console.log(
          `    L${v.line} [${v.severity.toUpperCase()}] ${v.term} (${v.category}) → ${v.snippet}`,
        );
      }
      if (report.violations.length > 30) {
        console.log(`    ... and ${report.violations.length - 30} more.`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
