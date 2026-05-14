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
      n_long: string;
      n_sig: string;
      n_faq: string;
    }>(
      `select slug,
              coalesce(jsonb_array_length(long_description_sections), 0)::text as n_long,
              coalesce(jsonb_array_length(signature_experiences), 0)::text as n_sig,
              coalesce(jsonb_array_length(faq_content), 0)::text as n_faq
       from public.hotels
       where is_published = true
       order by slug`,
    );
    for (const row of r.rows) {
      console.log(
        `${row.slug.padEnd(40)} | long=${row.n_long.padStart(2)} | sig=${row.n_sig.padStart(2)} | faq=${row.n_faq.padStart(2)}`,
      );
    }
    console.log(`Total: ${r.rows.length}`);
  } finally {
    await client.end();
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
