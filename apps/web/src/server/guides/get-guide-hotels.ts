import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const HotelCardSchema = z.object({
  slug: z.string(),
  slug_en: z.string().nullable(),
  name: z.string(),
  name_en: z.string().nullable(),
  city: z.string(),
  region: z.string(),
  stars: z.number().int(),
  is_palace: z.boolean(),
  hero_image: z.string().nullable(),
  description_fr: z.string().nullable(),
  description_en: z.string().nullable(),
});
export type GuideHotelCard = z.infer<typeof HotelCardSchema>;

const HOTEL_COLUMNS =
  'slug, slug_en, name, name_en, city, region, stars, is_palace, hero_image, description_fr, description_en';

/**
 * Fetches published hotels whose `city` matches any of the provided
 * keys (case-insensitive). Used by `/guide/[slug]` to cross-link the
 * destination guide back to the Palaces in our catalog — which closes
 * the editorial loop and drives the internal maillage that ranks well
 * for ["palace + city"] keywords.
 *
 * The match is performed by `ILIKE` on `city`, then refined in-memory
 * to support multiple keys per destination (e.g. Côte d'Azur covers
 * Cannes, Nice, Antibes, Cap-Ferrat, Saint-Tropez, Monaco…).
 *
 * Capped at 18 results to keep the page weight bounded.
 */
export async function getHotelsForDestination(
  cityKeys: readonly string[],
): Promise<readonly GuideHotelCard[]> {
  if (cityKeys.length === 0) return [];
  const supabase = getSupabaseAdminClient();
  // Build the ILIKE filters with explicit casing — Supabase v2 uses
  // PostgREST `or` filter syntax: `city.ilike.paris,city.ilike.cannes…`
  const ilikeClauses = cityKeys.map((k) => `city.ilike.${k.replace(/[%_,]/gu, '')}`).join(',');
  const { data, error } = await supabase
    .from('hotels')
    .select(HOTEL_COLUMNS)
    .eq('is_published', true)
    .or(ilikeClauses)
    .order('is_palace', { ascending: false })
    .order('stars', { ascending: false })
    .order('name', { ascending: true })
    .limit(18);
  if (error !== null || data === null) return [];
  const out: GuideHotelCard[] = [];
  const lowerKeys = cityKeys.map((k) => k.toLowerCase());
  for (const row of data as unknown[]) {
    const parsed = HotelCardSchema.safeParse(row);
    if (!parsed.success) continue;
    // Second-pass guard — Supabase `ilike` against a comma-joined `or`
    // filter is forgiving; we want strict membership.
    const cityLc = parsed.data.city.toLowerCase();
    if (lowerKeys.some((k) => cityLc === k || cityLc.startsWith(`${k}-`) || cityLc.includes(k))) {
      out.push(parsed.data);
    }
  }
  return out;
}
