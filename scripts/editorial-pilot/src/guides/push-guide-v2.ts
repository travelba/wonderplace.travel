/**
 * v2 push — persists a GeneratedGuideV2 to `editorial_guides`,
 * including the new v2 columns added in migration 0027
 * (tables, glossary, external_sources, editorial_callouts, toc_anchors).
 *
 * Also auto-computes `toc_anchors` from sections + tables + glossary +
 * external_sources so the front-end's sticky TOC can render without
 * additional client logic.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

import type { DestinationGuideSeed } from './destinations-catalog.js';
import type { GeneratedGuideV2 } from './generate-guide-v2.js';

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

interface TocAnchor {
  readonly anchor: string;
  readonly label_fr: string;
  readonly label_en: string;
  readonly level: 2 | 3;
}

function buildTocAnchors(guide: GeneratedGuideV2): TocAnchor[] {
  const out: TocAnchor[] = [];

  // Sections (h2)
  for (const s of guide.sections) {
    const anchor = s.key.length > 0 ? s.key : s.type;
    out.push({
      anchor,
      label_fr: s.title_fr,
      label_en: s.title_en.length > 0 ? s.title_en : s.title_fr,
      level: 2,
    });
  }

  // Anchor group for tables, glossary, sources (one entry each, h2)
  if (guide.tables.length > 0) {
    out.push({
      anchor: 'tableaux',
      label_fr: 'Tableaux comparatifs',
      label_en: 'Comparison tables',
      level: 2,
    });
  }
  if (guide.glossary.length > 0) {
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
  if (guide.external_sources.length > 0) {
    out.push({
      anchor: 'sources',
      label_fr: 'Sources & références',
      label_en: 'Sources & references',
      level: 2,
    });
  }
  return out;
}

export async function pushGuideV2(
  seed: DestinationGuideSeed,
  guide: GeneratedGuideV2,
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
    const tocAnchors = buildTocAnchors(guide);

    await client.query(
      `insert into public.editorial_guides (
        slug, name_fr, name_en, scope, country_code,
        summary_fr, summary_en, sections, faq, featured_reviews, highlights,
        practical_info, hero_image, meta_title_fr, meta_title_en,
        meta_desc_fr, meta_desc_en, reviewed_at,
        author_name, author_url, is_published,
        tables, glossary, external_sources, editorial_callouts, toc_anchors
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        $22,$23,$24,$25,$26
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
        is_published = excluded.is_published,
        tables = excluded.tables,
        glossary = excluded.glossary,
        external_sources = excluded.external_sources,
        editorial_callouts = excluded.editorial_callouts,
        toc_anchors = excluded.toc_anchors`,
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
        JSON.stringify(guide.tables),
        JSON.stringify(guide.glossary),
        JSON.stringify(guide.external_sources),
        JSON.stringify(guide.editorial_callouts),
        JSON.stringify(tocAnchors),
      ],
    );
  } finally {
    await client.end();
  }
}
