import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const SectionSchema = z.object({
  key: z.string().optional().default(''),
  type: z.string(),
  title_fr: z.string(),
  title_en: z.string().optional().default(''),
  body_fr: z.string(),
  body_en: z.string().optional().default(''),
});
export type GuideSection = z.infer<typeof SectionSchema>;

const FaqSchema = z.object({
  question_fr: z.string().optional().default(''),
  question_en: z.string().optional().default(''),
  answer_fr: z.string().optional().default(''),
  answer_en: z.string().optional().default(''),
  category: z.string().optional().default('practical'),
  /** Anchor of the section this FAQ enriches (v2). null = global. */
  section_anchor: z.string().nullish(),
});
export type GuideFaq = z.infer<typeof FaqSchema>;

// v2: structured comparison tables, glossary, callouts, sources, toc.
const TableHeaderSchema = z.object({
  key: z.string(),
  label_fr: z.string(),
  label_en: z.string().optional().default(''),
  align: z.enum(['left', 'right', 'center']).optional(),
});
const TableCellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ text: z.string(), href: z.string().nullish() }),
]);
const TableSchema = z.object({
  key: z.string(),
  kind: z.string(),
  title_fr: z.string(),
  title_en: z.string().optional().default(''),
  note_fr: z.string().optional().default(''),
  note_en: z.string().optional().default(''),
  headers: z.array(TableHeaderSchema).default([]),
  rows: z.array(z.record(z.string(), TableCellSchema)).default([]),
});
export type GuideTable = z.infer<typeof TableSchema>;

const GlossaryEntrySchema = z.object({
  term_fr: z.string(),
  term_en: z.string().optional().default(''),
  definition_fr: z.string(),
  definition_en: z.string().optional().default(''),
});
export type GuideGlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

const CalloutSchema = z.object({
  kind: z.string(),
  title_fr: z.string(),
  title_en: z.string().optional().default(''),
  body_fr: z.string(),
  body_en: z.string().optional().default(''),
});
export type GuideCallout = z.infer<typeof CalloutSchema>;

const ExternalSourceSchema = z.object({
  url: z.string(),
  label_fr: z.string(),
  label_en: z.string().optional().default(''),
  type: z.string(),
});
export type GuideExternalSource = z.infer<typeof ExternalSourceSchema>;

const TocAnchorSchema = z.object({
  anchor: z.string(),
  label_fr: z.string(),
  label_en: z.string().optional().default(''),
  level: z.union([z.literal(2), z.literal(3)]).optional(),
});
export type GuideTocAnchor = z.infer<typeof TocAnchorSchema>;

const HighlightSchema = z.object({
  name_fr: z.string(),
  name_en: z.string().optional().default(''),
  type: z.string(),
  description_fr: z.string(),
  description_en: z.string().optional().default(''),
  url: z.string().url().nullish(),
});
export type GuideHighlight = z.infer<typeof HighlightSchema>;

const PracticalAirportSchema = z.object({
  code: z.string().nullish(),
  name: z.string(),
  distance_fr: z.string().optional().default(''),
  distance_en: z.string().optional().default(''),
});
const PracticalStationSchema = z.object({
  name: z.string(),
  notes_fr: z.string().optional().default(''),
  notes_en: z.string().optional().default(''),
});
const PracticalInfoSchema = z
  .object({
    best_time_fr: z.string().optional().default(''),
    best_time_en: z.string().optional().default(''),
    currency: z.string().optional().default('EUR'),
    languages_fr: z.string().optional().default('Français, anglais'),
    languages_en: z.string().optional().default('French, English'),
    airports: z.array(PracticalAirportSchema).optional().default([]),
    train_stations: z.array(PracticalStationSchema).optional().default([]),
  })
  .nullish();
export type GuidePracticalInfo = z.infer<typeof PracticalInfoSchema>;

export const GuideRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name_fr: z.string(),
  name_en: z.string().nullable(),
  scope: z.enum(['city', 'region', 'cluster', 'country']),
  country_code: z.string(),
  summary_fr: z.string(),
  summary_en: z.string().nullable(),
  sections: z.array(SectionSchema).default([]),
  faq: z.array(FaqSchema).default([]),
  featured_reviews: z.array(z.unknown()).default([]),
  highlights: z.array(HighlightSchema).default([]),
  practical_info: PracticalInfoSchema,
  hero_image: z.string().nullable(),
  gallery_images: z.array(z.string()).nullable().optional(),
  reviewed_at: z.string().nullable(),
  author_name: z.string().nullable(),
  author_url: z.string().nullable(),
  meta_title_fr: z.string().nullable(),
  meta_title_en: z.string().nullable(),
  meta_desc_fr: z.string().nullable(),
  meta_desc_en: z.string().nullable(),
  is_published: z.boolean(),
  updated_at: z.string().nullable(),
  // v2 (migration 0027) — empty defaults keep v1 rows compatible.
  tables: z.array(TableSchema).default([]),
  glossary: z.array(GlossaryEntrySchema).default([]),
  external_sources: z.array(ExternalSourceSchema).default([]),
  editorial_callouts: z.array(CalloutSchema).default([]),
  toc_anchors: z.array(TocAnchorSchema).default([]),
});
export type GuideRow = z.infer<typeof GuideRowSchema>;

const GUIDE_COLUMNS =
  'id, slug, name_fr, name_en, scope, country_code, summary_fr, summary_en, ' +
  'sections, faq, featured_reviews, highlights, practical_info, hero_image, ' +
  'gallery_images, reviewed_at, author_name, author_url, meta_title_fr, ' +
  'meta_title_en, meta_desc_fr, meta_desc_en, is_published, updated_at, ' +
  'tables, glossary, external_sources, editorial_callouts, toc_anchors';

/**
 * Fetches a single published destination guide by slug. Returns `null`
 * if the row is missing, unpublished or fails schema validation —
 * never throws (the caller renders `notFound()` instead).
 */
export async function getGuideBySlug(slug: string): Promise<GuideRow | null> {
  if (typeof slug !== 'string' || slug.length === 0) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('editorial_guides')
    .select(GUIDE_COLUMNS)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error !== null || data === null) return null;
  const parsed = GuideRowSchema.safeParse(data);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.warn(
      `[get-guide-by-slug] schema-fail for "${slug}": ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
    return null;
  }
  return parsed.data;
}

/** Lightweight summary card for index pages. */
export interface PublishedGuideCard {
  readonly slug: string;
  readonly nameFr: string;
  readonly nameEn: string | null;
  readonly scope: 'city' | 'region' | 'cluster' | 'country';
  readonly summaryFr: string;
  readonly summaryEn: string | null;
  readonly heroImage: string | null;
  readonly reviewedAt: string | null;
}

export async function listPublishedGuides(): Promise<readonly PublishedGuideCard[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('editorial_guides')
    .select('slug, name_fr, name_en, scope, summary_fr, summary_en, hero_image, reviewed_at')
    .eq('is_published', true)
    .order('name_fr', { ascending: true });
  if (error !== null || data === null) return [];
  const rowSchema = z.object({
    slug: z.string(),
    name_fr: z.string(),
    name_en: z.string().nullable(),
    scope: z.enum(['city', 'region', 'cluster', 'country']),
    summary_fr: z.string(),
    summary_en: z.string().nullable(),
    hero_image: z.string().nullable(),
    reviewed_at: z.string().nullable(),
  });
  const cards: PublishedGuideCard[] = [];
  for (const row of data as unknown[]) {
    const parsed = rowSchema.safeParse(row);
    if (parsed.success) {
      cards.push({
        slug: parsed.data.slug,
        nameFr: parsed.data.name_fr,
        nameEn: parsed.data.name_en,
        scope: parsed.data.scope,
        summaryFr: parsed.data.summary_fr,
        summaryEn: parsed.data.summary_en,
        heroImage: parsed.data.hero_image,
        reviewedAt: parsed.data.reviewed_at,
      });
    }
  }
  return cards;
}
