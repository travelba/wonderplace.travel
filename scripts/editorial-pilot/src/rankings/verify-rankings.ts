import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });

async function main(): Promise<void> {
  const pgMod = (await import('pg')) as typeof import('pg');
  const conn = process.env['SUPABASE_DB_POOLER_URL'] ?? process.env['SUPABASE_DB_URL'] ?? '';
  const client = new pgMod.Client({
    connectionString: conn.replace(/[?&]sslmode=[^&]*/giu, ''),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query<{ slug: string; n: string }>(
      `select r.slug, count(e.*)::text as n
       from public.editorial_rankings r
       left join public.editorial_ranking_entries e on e.ranking_id = r.id
       group by r.slug
       order by r.slug`,
    );
    for (const row of r.rows) {
      console.log(`${row.slug.padEnd(35)} | entries=${row.n.padStart(2)}`);
    }
    console.log(`Total: ${r.rows.length} rankings.`);
  } finally {
    await client.end();
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
