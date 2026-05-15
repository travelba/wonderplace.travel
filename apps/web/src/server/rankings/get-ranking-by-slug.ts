import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const FaqSchema = z.object({
  question_fr: z.string().optional().default(''),
  question_en: z.string().optional().default(''),
  answer_fr: z.string().optional().default(''),
  answer_en: z.string().optional().default(''),
  section_anchor: z.string().nullish(),
});
export type RankingFaq = z.infer<typeof FaqSchema>;

// v2 schemas — keep mirror of guides' shape.
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
export type RankingTable = z.infer<typeof TableSchema>;

const GlossaryEntrySchema = z.object({
  term_fr: z.string(),
  term_en: z.string().optional().default(''),
  definition_fr: z.string(),
  definition_en: z.string().optional().default(''),
});
export type RankingGlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

const CalloutSchema = z.object({
  kind: z.string(),
  title_fr: z.string(),
  title_en: z.string().optional().default(''),
  body_fr: z.string(),
  body_en: z.string().optional().default(''),
});
export type RankingCallout = z.infer<typeof CalloutSchema>;

const ExternalSourceSchema = z.object({
  url: z.string(),
  label_fr: z.string(),
  label_en: z.string().optional().default(''),
  type: z.string(),
});
export type RankingExternalSource = z.infer<typeof ExternalSourceSchema>;

const TocAnchorSchema = z.object({
  anchor: z.string(),
  label_fr: z.string(),
  label_en: z.string().optional().default(''),
  level: z.union([z.literal(2), z.literal(3)]).optional(),
});
export type RankingTocAnchor = z.infer<typeof TocAnchorSchema>;

const EditorialSectionSchema = z.object({
  key: z.string(),
  type: z.string(),
  title_fr: z.string(),
  title_en: z.string().optional().default(''),
  body_fr: z.string(),
  body_en: z.string().optional().default(''),
});
export type RankingEditorialSection = z.infer<typeof EditorialSectionSchema>;

// Axes payload (mirror of `RankingAxesSchema` in
// scripts/editorial-pilot/src/rankings/axes.ts). Kept loose at the
// front-end boundary — the source of truth is the editorial pipeline.
const AxesLieuSchema = z.object({
  scope: z.string(),
  slug: z.string(),
  label: z.string(),
});
const AxesSchema = z.object({
  types: z.array(z.string()).default([]),
  lieu: AxesLieuSchema.optional(),
  themes: z.array(z.string()).default([]),
  occasions: z.array(z.string()).default([]),
  saison: z.string().optional(),
});
export type RankingAxesPayload = z.infer<typeof AxesSchema>;

export const RankingRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title_fr: z.string(),
  title_en: z.string().nullable(),
  kind: z.enum(['best_of', 'awarded', 'thematic', 'geographic']),
  intro_fr: z.string(),
  intro_en: z.string().nullable(),
  outro_fr: z.string().nullable(),
  outro_en: z.string().nullable(),
  faq: z.array(FaqSchema).default([]),
  hero_image: z.string().nullable(),
  meta_title_fr: z.string().nullable(),
  meta_title_en: z.string().nullable(),
  meta_desc_fr: z.string().nullable(),
  meta_desc_en: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  author_name: z.string().nullable(),
  author_url: z.string().nullable(),
  is_published: z.boolean(),
  updated_at: z.string().nullable(),
  // v2 columns (0027 + 0028).
  tables: z.array(TableSchema).default([]),
  glossary: z.array(GlossaryEntrySchema).default([]),
  external_sources: z.array(ExternalSourceSchema).default([]),
  editorial_callouts: z.array(CalloutSchema).default([]),
  toc_anchors: z.array(TocAnchorSchema).default([]),
  editorial_sections: z.array(EditorialSectionSchema).default([]),
  // 0029 — facetting axes (always present; `{}` when not yet classified).
  axes: AxesSchema.default({ types: [], themes: [], occasions: [] }),
  // 0030 — AEO factual summary (CDC §2.3).
  factual_summary_fr: z.string().nullable().optional(),
  factual_summary_en: z.string().nullable().optional(),
});
export type RankingRow = z.infer<typeof RankingRowSchema>;

export const RankingEntrySchema = z.object({
  rank: z.number().int(),
  justification_fr: z.string(),
  justification_en: z.string().nullable(),
  badge_fr: z.string().nullable(),
  badge_en: z.string().nullable(),
  hotel_slug: z.string(),
  hotel_slug_en: z.string().nullable(),
  hotel_name: z.string(),
  hotel_name_en: z.string().nullable(),
  hotel_stars: z.number().int(),
  hotel_is_palace: z.boolean(),
  hotel_city: z.string(),
  hotel_region: z.string(),
  hotel_hero_image: z.string().nullable(),
  hotel_description_fr: z.string().nullable(),
  hotel_description_en: z.string().nullable(),
});
export type RankingEntry = z.infer<typeof RankingEntrySchema>;

const RANKING_COLUMNS =
  'id, slug, title_fr, title_en, kind, intro_fr, intro_en, outro_fr, outro_en, ' +
  'faq, hero_image, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, ' +
  'reviewed_at, author_name, author_url, is_published, updated_at, ' +
  'tables, glossary, external_sources, editorial_callouts, toc_anchors, editorial_sections, ' +
  'axes, factual_summary_fr, factual_summary_en';

export async function getRankingBySlug(slug: string): Promise<RankingRow | null> {
  if (typeof slug !== 'string' || slug.length === 0) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('editorial_rankings')
    .select(RANKING_COLUMNS)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error !== null || data === null) return null;
  const parsed = RankingRowSchema.safeParse(data);
  if (!parsed.success) return null;
  return parsed.data;
}

export async function getRankingEntries(rankingId: string): Promise<readonly RankingEntry[]> {
  const supabase = getSupabaseAdminClient();
  // Two-step query: entries → hotels (RLS keeps the join read-only).
  const { data: entries, error: entriesErr } = await supabase
    .from('editorial_ranking_entries')
    .select('hotel_id, rank, justification_fr, justification_en, badge_fr, badge_en')
    .eq('ranking_id', rankingId)
    .order('rank', { ascending: true });
  if (entriesErr !== null || entries === null) return [];
  const hotelIds = entries.map((e) => e.hotel_id as string);
  if (hotelIds.length === 0) return [];
  const { data: hotels, error: hotelsErr } = await supabase
    .from('hotels')
    .select(
      'id, slug, slug_en, name, name_en, stars, is_palace, city, region, hero_image, description_fr, description_en',
    )
    .in('id', hotelIds);
  if (hotelsErr !== null || hotels === null) return [];
  const byId = new Map<string, (typeof hotels)[0]>();
  for (const h of hotels) byId.set(h.id as string, h);
  const out: RankingEntry[] = [];
  for (const e of entries) {
    const h = byId.get(e.hotel_id as string);
    if (h === undefined) continue;
    const parsed = RankingEntrySchema.safeParse({
      rank: e.rank,
      justification_fr: e.justification_fr,
      justification_en: e.justification_en,
      badge_fr: e.badge_fr,
      badge_en: e.badge_en,
      hotel_slug: h.slug,
      hotel_slug_en: h.slug_en,
      hotel_name: h.name,
      hotel_name_en: h.name_en,
      hotel_stars: h.stars,
      hotel_is_palace: h.is_palace,
      hotel_city: h.city,
      hotel_region: h.region,
      hotel_hero_image: h.hero_image,
      hotel_description_fr: h.description_fr,
      hotel_description_en: h.description_en,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export interface PublishedRankingCard {
  readonly slug: string;
  readonly titleFr: string;
  readonly titleEn: string | null;
  readonly kind: 'best_of' | 'awarded' | 'thematic' | 'geographic';
  readonly entryCount: number;
  readonly heroImage: string | null;
  readonly factualSummaryFr: string | null;
  readonly factualSummaryEn: string | null;
  readonly axes: RankingAxesPayload;
  readonly updatedAt: string | null;
}

export async function listPublishedRankings(): Promise<readonly PublishedRankingCard[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('editorial_rankings')
    .select(
      'id, slug, title_fr, title_en, kind, hero_image, factual_summary_fr, factual_summary_en, axes, updated_at',
    )
    .eq('is_published', true)
    .order('kind', { ascending: true })
    .order('title_fr', { ascending: true });
  if (error !== null || data === null) return [];
  const ids = data.map((r) => r.id as string);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: entries } = await supabase
      .from('editorial_ranking_entries')
      .select('ranking_id')
      .in('ranking_id', ids);
    if (entries !== null) {
      for (const e of entries) {
        const k = e.ranking_id as string;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  return data.map((r) => {
    const axesParsed = AxesSchema.safeParse(r.axes ?? {});
    return {
      slug: r.slug as string,
      titleFr: r.title_fr as string,
      titleEn: (r.title_en as string | null) ?? null,
      kind: r.kind as 'best_of' | 'awarded' | 'thematic' | 'geographic',
      entryCount: counts.get(r.id as string) ?? 0,
      heroImage: (r.hero_image as string | null) ?? null,
      factualSummaryFr: (r.factual_summary_fr as string | null) ?? null,
      factualSummaryEn: (r.factual_summary_en as string | null) ?? null,
      axes: axesParsed.success ? axesParsed.data : { types: [], themes: [], occasions: [] },
      updatedAt: (r.updated_at as string | null) ?? null,
    };
  });
}
