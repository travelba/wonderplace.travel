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
    const r = await client.query<{
      slug: string;
      name_fr: string;
      ns: string;
      nf: string;
      nh: string;
      is_published: boolean;
    }>(
      `select slug, name_fr,
              jsonb_array_length(sections)::text as ns,
              jsonb_array_length(faq)::text as nf,
              jsonb_array_length(highlights)::text as nh,
              is_published
       from public.editorial_guides
       order by slug`,
    );
    for (const row of r.rows) {
      console.log(
        `${row.slug.padEnd(22)} | sections=${row.ns.padStart(2)} | faq=${row.nf.padStart(2)} | highlights=${row.nh.padStart(2)} | published=${row.is_published}`,
      );
    }
    console.log(`Total: ${r.rows.length} rows.`);
  } finally {
    await client.end();
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
