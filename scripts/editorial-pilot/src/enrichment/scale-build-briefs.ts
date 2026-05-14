/**
 * scale-build-briefs.ts — orchestrate brief generation for every Palace
 * in `briefs-auto/_palaces-discovered.json` (created by list-all-palaces.ts).
 *
 * For each entry not yet present in briefs-auto/, spawns build-brief
 * sequentially. Logs progress and a final summary.
 *
 * Usage:
 *   pnpm exec tsx src/enrichment/scale-build-briefs.ts
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

interface PalaceEntry {
  readonly uuid: string;
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly department: string;
}

async function main(): Promise<void> {
  const palacesPath = resolve(process.cwd(), 'briefs-auto', '_palaces-discovered.json');
  if (!existsSync(palacesPath)) {
    throw new Error(`Missing ${palacesPath} — run list-all-palaces.ts first.`);
  }
  const entries = JSON.parse(await readFile(palacesPath, 'utf-8')) as PalaceEntry[];
  console.log(`[scale] ${entries.length} palaces in discovery list\n`);

  const briefsDir = resolve(process.cwd(), 'briefs-auto');
  const todo: PalaceEntry[] = [];
  for (const e of entries) {
    const briefPath = resolve(briefsDir, `${e.slug}.json`);
    if (existsSync(briefPath)) {
      console.log(`[skip] ${e.slug} — brief already exists`);
      continue;
    }
    todo.push(e);
  }
  console.log(`\n[scale] ${todo.length} palaces to build\n`);

  const results: Array<{ slug: string; ok: boolean; elapsed_ms: number; error?: string }> = [];
  for (let i = 0; i < todo.length; i++) {
    const e = todo[i];
    if (!e) continue;
    const start = Date.now();
    console.log(`\n[${i + 1}/${todo.length}] ${e.slug} — ${e.name} (${e.city})`);
    try {
      await runBuildBrief(e);
      results.push({ slug: e.slug, ok: true, elapsed_ms: Date.now() - start });
      console.log(`  ✓ ${e.slug} brief built in ${Date.now() - start}ms`);
    } catch (err) {
      const msg = (err as Error).message;
      results.push({ slug: e.slug, ok: false, elapsed_ms: Date.now() - start, error: msg });
      console.error(`  ✗ ${e.slug} FAILED — ${msg}`);
    }
  }

  console.log(`\n━━━ scale summary ━━━`);
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗';
    console.log(
      `  ${tag} ${r.slug} — ${(r.elapsed_ms / 1000).toFixed(1)}s${r.error ? ` — ${r.error}` : ''}`,
    );
  }
  const failures = results.filter((r) => !r.ok).length;
  if (failures > 0) process.exit(1);
}

function runBuildBrief(entry: PalaceEntry): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const args = ['exec', 'tsx', 'src/enrichment/build-brief.ts', entry.slug, '--uuid', entry.uuid];
    const child = spawn('pnpm', args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
    });
    child.on('error', rejectP);
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`build-brief exited with code ${code}`));
    });
  });
}

main().catch((err) => {
  console.error(`[scale-build-briefs] FATAL:`, err);
  process.exit(1);
});
