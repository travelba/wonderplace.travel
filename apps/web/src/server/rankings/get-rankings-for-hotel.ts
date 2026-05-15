import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Returns the published editorial rankings that feature `hotelId` as
 * a ranked entry — used for the "Cet hôtel apparaît dans…" internal-
 * linking block on the hotel detail page (skill seo-technical
 * §Maillage interne, plan rankings-parity-yonder WS2.5 v4).
 *
 * Limited to N entries to keep the page light. Sorted by the entry's
 * rank (lowest = best position first across rankings).
 */

export interface HotelRankingMention {
  readonly slug: string;
  readonly titleFr: string;
  readonly titleEn: string | null;
  readonly kind: 'best_of' | 'awarded' | 'thematic' | 'geographic';
  readonly rank: number;
  readonly badgeFr: string | null;
  readonly badgeEn: string | null;
}

const RowSchema = z.object({
  rank: z.number().int(),
  badge_fr: z.string().nullable(),
  badge_en: z.string().nullable(),
  ranking_id: z.string().uuid(),
});

const RankingMetaSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title_fr: z.string(),
  title_en: z.string().nullable(),
  kind: z.enum(['best_of', 'awarded', 'thematic', 'geographic']),
});

export async function getRankingsForHotel(
  hotelId: string,
  options: { limit?: number } = {},
): Promise<readonly HotelRankingMention[]> {
  if (typeof hotelId !== 'string' || hotelId.length === 0) return [];
  const limit = options.limit ?? 6;
  const supabase = getSupabaseAdminClient();
  const { data: entries, error: entriesErr } = await supabase
    .from('editorial_ranking_entries')
    .select('rank, badge_fr, badge_en, ranking_id')
    .eq('hotel_id', hotelId);
  if (entriesErr !== null || entries === null || entries.length === 0) return [];
  const parsedEntries: z.infer<typeof RowSchema>[] = [];
  for (const e of entries) {
    const r = RowSchema.safeParse(e);
    if (r.success) parsedEntries.push(r.data);
  }
  if (parsedEntries.length === 0) return [];
  const rankingIds = [...new Set(parsedEntries.map((e) => e.ranking_id))];
  const { data: rankings, error: rankingsErr } = await supabase
    .from('editorial_rankings')
    .select('id, slug, title_fr, title_en, kind')
    .eq('is_published', true)
    .in('id', rankingIds);
  if (rankingsErr !== null || rankings === null) return [];
  const byId = new Map<string, z.infer<typeof RankingMetaSchema>>();
  for (const r of rankings) {
    const parsed = RankingMetaSchema.safeParse(r);
    if (parsed.success) byId.set(parsed.data.id, parsed.data);
  }
  const out: HotelRankingMention[] = [];
  for (const e of parsedEntries) {
    const meta = byId.get(e.ranking_id);
    if (meta === undefined) continue;
    out.push({
      slug: meta.slug,
      titleFr: meta.title_fr,
      titleEn: meta.title_en,
      kind: meta.kind,
      rank: e.rank,
      badgeFr: e.badge_fr,
      badgeEn: e.badge_en,
    });
  }
  out.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.titleFr.localeCompare(b.titleFr);
  });
  return out.slice(0, limit);
}
