/**
 * Dumps the published hotel catalog into a compact JSON file used by
 * the rankings pipeline to:
 *   1. Decide which hotels are eligible for each ranking (filters).
 *   2. Feed the LLM the EXACT names + slugs + cities → zero risk of
 *      hallucinated hotel references in the generated rankings.
 *
 * Output: `out/hotels-catalog.json` (one row per hotel).
 *
 * Run: `pnpm --filter @cct/editorial-pilot exec tsx src/guides/list-hotels-for-rankings.ts`
 */

import fs from 'node:fs/promises';
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
    const r = await client.query(
      `select id, slug, slug_en, name, name_en, stars, is_palace, city, region,
              description_fr, address, postal_code, latitude, longitude
       from public.hotels
       where is_published = true
       order by is_palace desc, stars desc, name asc`,
    );
    const out = r.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      slug_en: row.slug_en,
      name: row.name,
      name_en: row.name_en,
      stars: row.stars,
      is_palace: row.is_palace,
      city: row.city,
      region: row.region,
      description_fr: row.description_fr,
      address: row.address,
      postal_code: row.postal_code,
      latitude: row.latitude,
      longitude: row.longitude,
    }));
    const outPath = path.join(__dirname, '../../out/hotels-catalog.json');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(`Wrote ${out.length} hotels to ${path.relative(process.cwd(), outPath)}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
