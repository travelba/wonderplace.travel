/**
 * Upserts a generated guide into the `editorial_guides` table.
 * Uses the same IPv4 pooler resolution as the rest of the
 * `scripts/editorial-pilot/src/import/*` scripts.
 *
 * Idempotent: ON CONFLICT (slug) DO UPDATE so re-runs overwrite
 * the row (the editorial workflow regenerates an existing guide
 * by re-running the same command).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

import type { DestinationGuideSeed } from './destinations-catalog.js';
import type { GeneratedGuide } from './generate-guide.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });
loadDotenv({ path: path.resolve(__dirname, '../../../../.env') });

function resolveConnectionString(): string {
  const conn =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'] ??
    null;
  if (conn === null) {
    throw new Error(
      'No Postgres connection string. Set DATABASE_URL, SUPABASE_DB_POOLER_URL, or SUPABASE_DB_URL.',
    );
  }
  return conn;
}

export async function pushGuide(
  seed: DestinationGuideSeed,
  guide: GeneratedGuide,
  options: { readonly publish: boolean } = { publish: true },
): Promise<void> {
  const pgModule = (await import('pg')) as typeof import('pg');
  const cleaned = resolveConnectionString().replace(/[?&]sslmode=[^&]*/giu, '');
  const isLocal = cleaned.includes('localhost') || cleaned.includes('127.0.0.1');
  const client = new pgModule.Client({
    connectionString: cleaned,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const heroImage = seed.heroImage ?? null;

    await client.query(
      `insert into public.editorial_guides (
        slug, name_fr, name_en, scope, country_code,
        summary_fr, summary_en, sections, faq, featured_reviews, highlights,
        practical_info, hero_image, meta_title_fr, meta_title_en,
        meta_desc_fr, meta_desc_en, reviewed_at,
        author_name, author_url, is_published
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      )
      on conflict (slug) do update set
        name_fr = excluded.name_fr,
        name_en = excluded.name_en,
        scope = excluded.scope,
        country_code = excluded.country_code,
        summary_fr = excluded.summary_fr,
        summary_en = excluded.summary_en,
        sections = excluded.sections,
        faq = excluded.faq,
        highlights = excluded.highlights,
        practical_info = excluded.practical_info,
        hero_image = excluded.hero_image,
        meta_title_fr = excluded.meta_title_fr,
        meta_title_en = excluded.meta_title_en,
        meta_desc_fr = excluded.meta_desc_fr,
        meta_desc_en = excluded.meta_desc_en,
        reviewed_at = excluded.reviewed_at,
        is_published = excluded.is_published`,
      [
        seed.slug,
        seed.nameFr,
        seed.nameEn,
        seed.scope,
        seed.countryCode,
        guide.summary_fr,
        guide.summary_en,
        JSON.stringify(guide.sections),
        JSON.stringify(guide.faq),
        JSON.stringify([]),
        JSON.stringify(guide.highlights),
        JSON.stringify(guide.practical_info),
        heroImage,
        guide.meta_title_fr,
        guide.meta_title_en,
        guide.meta_desc_fr,
        guide.meta_desc_en,
        todayIso,
        'ConciergeTravel Éditorial',
        '/equipe/editorial',
        options.publish,
      ],
    );
  } finally {
    await client.end();
  }
}
