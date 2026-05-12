import 'server-only';

import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

const stringOrNull = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v : null));

const HotelMiniSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  slug_en: stringOrNull,
  name: z.string(),
  name_en: stringOrNull,
  city: z.string(),
  region: z.string(),
  is_palace: z.boolean(),
  stars: z.number().int(),
  hero_image: stringOrNull,
  description_fr: stringOrNull,
  description_en: stringOrNull,
});

const FavoriteRowSchema = z.object({
  hotel_id: z.string().uuid(),
  created_at: z.string(),
  hotels: HotelMiniSchema,
});

export type FavoriteListItem = z.infer<typeof FavoriteRowSchema>;

const SELECT_COLUMNS =
  'hotel_id, created_at, hotels (id, slug, slug_en, name, name_en, city, region, is_palace, stars, hero_image, description_fr, description_en)';

/**
 * Reads the signed-in user's favorites, newest first, with a per-row
 * hotel join for display. Anon-key + RLS (`user_favorites_select_own`)
 * automatically scopes to `user_id = auth.uid()`.
 *
 * Returns `[]` when:
 *   - no session,
 *   - the user has no favorites,
 *   - Supabase is unreachable / env is partial (preview, smoke build),
 *   - row parsing fails (defensive — surfaces in dev logs only).
 *
 * The DB index `user_favorites_user_id_created_at_idx` makes this
 * query O(log n) on the user's favorite count; the join with
 * `public.hotels` is bounded by the 200-row limit below.
 */
export async function listUserFavorites(): Promise<readonly FavoriteListItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('user_favorites')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error || !Array.isArray(data)) return [];

    const out: FavoriteListItem[] = [];
    for (const row of data) {
      const parsed = FavoriteRowSchema.safeParse(row);
      if (parsed.success) {
        out.push(parsed.data);
      } else if (process.env['NODE_ENV'] !== 'production') {
        console.warn('[listUserFavorites] parse error', parsed.error.flatten());
      }
    }
    return out;
  } catch {
    return [];
  }
}
