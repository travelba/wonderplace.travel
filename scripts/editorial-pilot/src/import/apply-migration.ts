/**
 * Generic SQL migration applier.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/import/apply-migration.ts <path-to-migration.sql>
 *
 * Resolves the connection string in this order (mirrors push-import.ts):
 *   1. `DATABASE_URL`
 *   2. `SUPABASE_DB_POOLER_URL` (IPv4 pooler, recommended)
 *   3. `SUPABASE_DB_URL`
 *
 * Idempotent: migrations that contain `create table if not exists`
 * / `alter table … add column if not exists` re-run safely.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });
loadDotenv({ path: path.resolve(__dirname, '../../../../.env') });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sqlPathArg = args[0];
  if (sqlPathArg === undefined || sqlPathArg.length === 0) {
    console.error('Usage: tsx src/import/apply-migration.ts <path-to-migration.sql>');
    process.exit(1);
  }
  const sqlPath = path.isAbsolute(sqlPathArg)
    ? sqlPathArg
    : path.resolve(process.cwd(), sqlPathArg);

  const connectionString =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'] ??
    null;
  if (connectionString === null) {
    console.error(
      'Error: set DATABASE_URL, SUPABASE_DB_POOLER_URL, or SUPABASE_DB_URL before running.',
    );
    process.exit(1);
  }
  const which =
    process.env['DATABASE_URL'] !== undefined
      ? 'DATABASE_URL'
      : process.env['SUPABASE_DB_POOLER_URL'] !== undefined
        ? 'SUPABASE_DB_POOLER_URL'
        : 'SUPABASE_DB_URL';
  const masked = connectionString.replace(/:\/\/([^:]+):[^@]+@/u, '://$1:***@');
  console.log(`Using ${which}: ${masked}`);

  let pgModule: typeof import('pg');
  try {
    pgModule = (await import('pg')) as typeof import('pg');
  } catch {
    console.error("Error: the 'pg' package is not installed.");
    process.exit(1);
  }

  const sql = await fs.readFile(sqlPath, 'utf8');
  console.log(`Loaded ${sql.length} chars of SQL from ${path.relative(process.cwd(), sqlPath)}`);

  const cleanedConn = connectionString.replace(/[?&]sslmode=[^&]*/giu, '');
  const isLocal = cleanedConn.includes('localhost') || cleanedConn.includes('127.0.0.1');
  const client = new pgModule.Client({
    connectionString: cleanedConn,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const t0 = Date.now();
    await client.query(sql);
    const elapsed = Date.now() - t0;
    console.log(`Applied migration in ${elapsed} ms.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
