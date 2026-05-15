/**
 * v2 push — persists a GeneratedRankingV2 to `editorial_rankings`
 * (including v2 columns from migrations 0027 + 0028) and refreshes
 * the entries in `editorial_ranking_entries`.
 *
 * Idempotent: re-runs delete-and-reinsert entries inside a single
 * transaction so ranks stay contiguous.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

import type { GeneratedRankingV2 } from './generate-ranking-v2.js';
import type { RankingSeed } from './rankings-catalog.js';
import type { RankingAxes } from './axes.js';

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

interface TocAnchor {
  readonly anchor: string;
  readonly label_fr: string;
  readonly label_en: string;
  readonly level: 2 | 3;
}

function buildTocAnchors(ranking: GeneratedRankingV2): TocAnchor[] {
  const out: TocAnchor[] = [];
  out.push({
    anchor: 'introduction',
    label_fr: 'Introduction',
    label_en: 'Introduction',
    level: 2,
  });
  if (ranking.tables.length > 0) {
    out.push({
      anchor: 'tableau-comparatif',
      label_fr: 'Tableau comparatif',
      label_en: 'Comparison table',
      level: 2,
    });
  }
  out.push({
    anchor: 'classement',
    label_fr: 'Le classement',
    label_en: 'The ranking',
    level: 2,
  });
  for (const s of ranking.editorial_sections) {
    out.push({
      anchor: s.key,
      label_fr: s.title_fr,
      label_en: s.title_en.length > 0 ? s.title_en : s.title_fr,
      level: 2,
    });
  }
  if (ranking.glossary.length > 0) {
    out.push({
      anchor: 'glossaire',
      label_fr: 'Glossaire',
      label_en: 'Glossary',
      level: 2,
    });
  }
  out.push({
    anchor: 'faq',
    label_fr: 'FAQ',
    label_en: 'FAQ',
    level: 2,
  });
  if (ranking.external_sources.length > 0) {
    out.push({
      anchor: 'sources',
      label_fr: 'Sources & références',
      label_en: 'Sources & references',
      level: 2,
    });
  }
  return out;
}

export async function pushRankingV2(
  seed: RankingSeed,
  ranking: GeneratedRankingV2,
  options: {
    readonly publish: boolean;
    /** Optional axes payload (matrice v2) — persisted to the JSONB column added by 0029. */
    readonly axes?: RankingAxes;
  } = { publish: true },
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
    const tocAnchors = buildTocAnchors(ranking);

    const axesPayload = options.axes !== undefined ? JSON.stringify(options.axes) : '{}';
    const factualSummaryFr =
      ranking.factual_summary_fr.length > 0 ? ranking.factual_summary_fr : null;
    const factualSummaryEn =
      ranking.factual_summary_en.length > 0 ? ranking.factual_summary_en : null;
    const upsert = await client.query<{ id: string }>(
      `insert into public.editorial_rankings (
        slug, title_fr, title_en, kind, intro_fr, intro_en, outro_fr, outro_en,
        faq, hero_image, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en,
        reviewed_at, author_name, author_url, is_published,
        tables, glossary, external_sources, editorial_callouts, toc_anchors,
        editorial_sections, axes, factual_summary_fr, factual_summary_en
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27
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
        is_published = excluded.is_published,
        tables = excluded.tables,
        glossary = excluded.glossary,
        external_sources = excluded.external_sources,
        editorial_callouts = excluded.editorial_callouts,
        toc_anchors = excluded.toc_anchors,
        editorial_sections = excluded.editorial_sections,
        axes = excluded.axes,
        factual_summary_fr = excluded.factual_summary_fr,
        factual_summary_en = excluded.factual_summary_en
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
        JSON.stringify(ranking.tables),
        JSON.stringify(ranking.glossary),
        JSON.stringify(ranking.external_sources),
        JSON.stringify(ranking.editorial_callouts),
        JSON.stringify(tocAnchors),
        JSON.stringify(ranking.editorial_sections),
        axesPayload,
        factualSummaryFr,
        factualSummaryEn,
      ],
    );
    const rankingRow = upsert.rows[0];
    if (rankingRow === undefined) {
      throw new Error('UPSERT did not return a row.');
    }
    const rankingId = rankingRow.id;

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
