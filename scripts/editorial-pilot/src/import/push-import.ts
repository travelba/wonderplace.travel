/**
 * Pushes `out/seed-palaces.sql` to Supabase using a direct Postgres
 * connection.
 *
 * Resolves the connection string in this order:
 *   1. `DATABASE_URL`                — explicit override
 *   2. `SUPABASE_DB_POOLER_URL`      — IPv4 connection pooler (recommended;
 *                                     the direct `db.<ref>.supabase.co` host
 *                                     is IPv6-only and ENOENTs on many
 *                                     Windows/corporate networks)
 *   3. `SUPABASE_DB_URL`             — legacy direct host (IPv6)
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx src/import/push-import.ts
 *
 * Idempotent: every upsert statement uses `ON CONFLICT (slug) DO UPDATE`
 * so the script can be re-run safely after any brief regeneration.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the monorepo root .env.local so the operator does not have to
// export DATABASE_URL manually before running the script.
loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });
loadDotenv({ path: path.resolve(__dirname, '../../../../.env') });

const ROOT = path.resolve(__dirname, '../../');
const SQL_FILE = path.join(ROOT, 'out/seed-palaces.sql');

async function main(): Promise<void> {
  const connectionString =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'] ??
    null;
  if (connectionString === null) {
    console.error(
      'Error: set DATABASE_URL, SUPABASE_DB_POOLER_URL, or SUPABASE_DB_URL before running.\n' +
        'Pooler (IPv4, recommended): postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres\n' +
        'Direct (IPv6, may ENOENT):  postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres',
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

  // Lazy import so the script does not crash on a missing optional dep at
  // module load — the error message above stays readable for users who
  // simply forgot to install `pg`.
  let pgModule: typeof import('pg');
  try {
    pgModule = (await import('pg')) as typeof import('pg');
  } catch {
    console.error(
      "Error: the 'pg' package is not installed. Run:\n" +
        '  pnpm --filter @cct/editorial-pilot add -D pg @types/pg',
    );
    process.exit(1);
  }

  const sql = await fs.readFile(SQL_FILE, 'utf8');
  console.log(`Loaded ${sql.length} chars of SQL from ${path.relative(process.cwd(), SQL_FILE)}`);

  // Supabase serves a self-signed cert chain. We strip any `sslmode=…`
  // query param so `pg` does not enable `verify-full`, then pass our own
  // `ssl: { rejectUnauthorized: false }` to allow the handshake while
  // still keeping the channel encrypted.
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
    console.log(`Applied seed-palaces.sql in ${elapsed} ms.`);

    // Quick verification.
    const result = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM hotels WHERE is_published = TRUE;',
    );
    const count = result.rows[0]?.count ?? '?';
    console.log(`Published hotels in DB: ${count}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
