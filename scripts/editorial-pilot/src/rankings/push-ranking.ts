/**
 * Upserts a generated ranking into `editorial_rankings` +
 * `editorial_ranking_entries`. Idempotent — re-runs overwrite both the
 * head row and all its entries (delete-then-insert pattern inside one
 * transaction to keep ranks contiguous).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

import type { GeneratedRanking } from './generate-ranking.js';
import type { RankingSeed } from './rankings-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });

function resolveConnectionString(): string {
  const conn =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'] ??
    null;
  if (conn === null) throw new Error('No DB connection string.');
  return conn;
}

export async function pushRanking(
  seed: RankingSeed,
  ranking: GeneratedRanking,
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
    await client.query('BEGIN');
    const todayIso = new Date().toISOString().slice(0, 10);
    const upsert = await client.query<{ id: string }>(
      `insert into public.editorial_rankings (
        slug, title_fr, title_en, kind, intro_fr, intro_en, outro_fr, outro_en,
        faq, hero_image, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en,
        reviewed_at, author_name, author_url, is_published
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )
      on conflict (slug) do update set
        title_fr = excluded.title_fr,
        title_en = excluded.title_en,
        kind = excluded.kind,
        intro_fr = excluded.intro_fr,
        intro_en = excluded.intro_en,
        outro_fr = excluded.outro_fr,
        outro_en = excluded.outro_en,
        faq = excluded.faq,
        hero_image = excluded.hero_image,
        meta_title_fr = excluded.meta_title_fr,
        meta_title_en = excluded.meta_title_en,
        meta_desc_fr = excluded.meta_desc_fr,
        meta_desc_en = excluded.meta_desc_en,
        reviewed_at = excluded.reviewed_at,
        is_published = excluded.is_published
      returning id`,
      [
        seed.slug,
        seed.titleFr,
        seed.titleEn,
        seed.kind,
        ranking.intro_fr,
        ranking.intro_en,
        ranking.outro_fr,
        ranking.outro_en,
        JSON.stringify(ranking.faq),
        seed.heroImage ?? null,
        ranking.meta_title_fr,
        ranking.meta_title_en,
        ranking.meta_desc_fr,
        ranking.meta_desc_en,
        todayIso,
        'ConciergeTravel Éditorial',
        '/equipe/editorial',
        options.publish,
      ],
    );
    const rankingRow = upsert.rows[0];
    if (rankingRow === undefined) {
      throw new Error('UPSERT did not return a row.');
    }
    const rankingId = rankingRow.id;

    // Wipe existing entries so the upsert is fully idempotent.
    await client.query('delete from public.editorial_ranking_entries where ranking_id = $1', [
      rankingId,
    ]);

    for (const e of ranking.entries) {
      await client.query(
        `insert into public.editorial_ranking_entries (
          ranking_id, hotel_id, rank, justification_fr, justification_en,
          badge_fr, badge_en
        ) values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          rankingId,
          e.hotel_id,
          e.rank,
          e.justification_fr,
          e.justification_en === '' ? null : e.justification_en,
          e.badge_fr ?? null,
          e.badge_en ?? null,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}
