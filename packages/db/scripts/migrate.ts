/**
 * Applies ordered SQL migrations from packages/db/migrations.
 * Requires SUPABASE_DB_URL (prefer direct Postgres — port 5432 — for DDL, not pooled PgBouncer).
 *
 * Usage (from repo root):
 *   pnpm --filter @cct/db migrate
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { z } from 'zod';

const Env = z.object({
  SUPABASE_DB_URL: z
    .string()
    .min(1)
    .refine(
      (s) => s.startsWith('postgresql://') || s.startsWith('postgres://'),
      'SUPABASE_DB_URL must be a Postgres connection URI',
    ),
});

const LedgerFilenameRow = z.object({
  filename: z.string(),
});

const scriptDir = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const parsedEnv = Env.safeParse(process.env);
  if (!parsedEnv.success) {
    console.error('Invalid env:', parsedEnv.error.flatten());
    process.exitCode = 1;
    return;
  }

  const sqlConnection = postgres(parsedEnv.data.SUPABASE_DB_URL, {
    max: 1,
    onnotice: () => undefined,
  });

  try {
    await sqlConnection`
      create table if not exists public._cct_sql_migrations (
        filename text primary key,
        applied_at timestamptz not null default timezone('utc', now())
      )
    `;

    const migrationsDir = join(scriptDir, '../migrations');
    const filenames = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    const ledgerRowsUnknown = await sqlConnection`
      select filename from public._cct_sql_migrations
      `;

    const ledgerDecoded = LedgerFilenameRow.array().safeParse(ledgerRowsUnknown);
    if (!ledgerDecoded.success) {
      console.error('[migrate] unreadable ledger', ledgerDecoded.error.flatten());
      process.exitCode = 1;
      return;
    }

    const applied = new Set(ledgerDecoded.data.map((row) => row.filename));

    for (const filename of filenames) {
      if (applied.has(filename)) {
        console.info(`[migrate] skip (already applied) ${filename}`);
        continue;
      }

      const fullPath = join(migrationsDir, filename);
      const body = await readFile(fullPath, 'utf8');

      await sqlConnection.begin(async (txn) => {
        await txn.unsafe(body);
        await txn`
          insert into public._cct_sql_migrations (filename) values (${filename})
          `;
      });

      console.info(`[migrate] applied ${filename}`);
    }

    console.info('[migrate] done');
  } catch (error) {
    console.error('[migrate] failed:', error);
    process.exitCode = 1;
  } finally {
    await sqlConnection.end({ timeout: 5 });
  }
}

void main().catch((error) => {
  console.error('[migrate] unhandled:', error);
  process.exit(1);
});
