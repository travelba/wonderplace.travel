import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getFakeHotelDetailBySlug } from '@/server/hotels/dev-fake-hotel-detail';

/** Locale alias used for slug selection (slug_en vs slug). */
export type SupportedLocale = 'fr' | 'en';

const BookingModeSchema = z.enum(['amadeus', 'little', 'email', 'display_only']);
const PrioritySchema = z.enum(['P0', 'P1', 'P2']);

const stringOrEmpty = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v : null));

const numberOrNull = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });

/** Hotel row consumed by the public detail page. */
export const HotelDetailRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  slug_en: stringOrEmpty,
  name: z.string(),
  name_en: stringOrEmpty,
  stars: z.number().int().min(1).max(5),
  is_palace: z.boolean(),
  region: z.string(),
  department: stringOrEmpty,
  city: z.string(),
  district: stringOrEmpty,
  address: stringOrEmpty,
  latitude: numberOrNull,
  longitude: numberOrNull,
  description_fr: stringOrEmpty,
  description_en: stringOrEmpty,
  highlights: z.unknown().nullable().optional(),
  amenities: z.unknown().nullable().optional(),
  faq_content: z.unknown().nullable().optional(),
  restaurant_info: z.unknown().nullable().optional(),
  spa_info: z.unknown().nullable().optional(),
  hero_image: stringOrEmpty,
  gallery_images: z.unknown().nullable().optional(),
  meta_title_fr: stringOrEmpty,
  meta_title_en: stringOrEmpty,
  meta_desc_fr: stringOrEmpty,
  meta_desc_en: stringOrEmpty,
  booking_mode: BookingModeSchema,
  /** 8-char Amadeus property code when `booking_mode = 'amadeus'` (or stored anyway for hotels with sentiment-only enrichment). */
  amadeus_hotel_id: stringOrEmpty,
  priority: PrioritySchema,
  google_rating: numberOrNull,
  google_reviews_count: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? null),
  is_published: z.boolean(),
  updated_at: stringOrEmpty,
});

export type HotelDetailRow = z.infer<typeof HotelDetailRowSchema>;

const HOTEL_COLUMNS =
  'id, slug, slug_en, name, name_en, stars, is_palace, region, department, city, district, address, latitude, longitude, description_fr, description_en, highlights, amenities, faq_content, restaurant_info, spa_info, hero_image, gallery_images, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, booking_mode, amadeus_hotel_id, priority, google_rating, google_reviews_count, is_published, updated_at';

/** A FAQ item that may appear under `hotels.faq_content`. */
export const FaqItemSchema = z.object({
  question_fr: z.string().min(1).optional(),
  question_en: z.string().min(1).optional(),
  answer_fr: z.string().min(1).optional(),
  answer_en: z.string().min(1).optional(),
});
export type FaqItem = z.infer<typeof FaqItemSchema>;

const FaqContentSchema = z.array(FaqItemSchema);

export interface LocalisedFaq {
  readonly question: string;
  readonly answer: string;
}

/** Extracts a list of strings from a jsonb field that may be a string[] or object[]. */
function readStringList(raw: unknown, locale: SupportedLocale): readonly string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      out.push(entry.trim());
      continue;
    }
    if (entry !== null && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const candidates =
        locale === 'fr'
          ? ['label_fr', 'name_fr', 'label', 'name']
          : ['label_en', 'name_en', 'label', 'name'];
      for (const k of candidates) {
        const v = e[k];
        if (typeof v === 'string' && v.trim().length > 0) {
          out.push(v.trim());
          break;
        }
      }
    }
  }
  return out;
}

export function readHighlights(row: HotelDetailRow, locale: SupportedLocale): readonly string[] {
  return readStringList(row.highlights, locale);
}

export function readAmenities(row: HotelDetailRow, locale: SupportedLocale): readonly string[] {
  return readStringList(row.amenities, locale);
}

export function readFaq(row: HotelDetailRow, locale: SupportedLocale): readonly LocalisedFaq[] {
  const parsed = FaqContentSchema.safeParse(row.faq_content);
  if (!parsed.success) return [];
  const out: LocalisedFaq[] = [];
  for (const item of parsed.data) {
    const q =
      locale === 'fr'
        ? (item.question_fr ?? item.question_en)
        : (item.question_en ?? item.question_fr);
    const a =
      locale === 'fr' ? (item.answer_fr ?? item.answer_en) : (item.answer_en ?? item.answer_fr);
    if (q !== undefined && a !== undefined) {
      out.push({ question: q, answer: a });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// restaurant_info — F&B venues (hotels.restaurant_info jsonb)
// ---------------------------------------------------------------------------

const RestaurantVenueSchema = z.object({
  name: z.string().min(1),
  type_fr: z.string().min(1).optional(),
  type_en: z.string().min(1).optional(),
  michelin_stars: z.number().int().min(0).max(3).optional(),
  chef: z.string().min(1).optional(),
  pastry_chef: z.string().min(1).optional(),
  sommelier: z.string().min(1).optional(),
  since: z.number().int().optional(),
  michelin_since: z.number().int().optional(),
  features: z.array(z.string().min(1)).optional(),
  hours_fr: z.string().min(1).optional(),
  hours_en: z.string().min(1).optional(),
});

const RestaurantInfoSchema = z.object({
  count: z.number().int().min(0).optional(),
  michelin_stars: z.number().int().min(0).optional(),
  venues: z.array(RestaurantVenueSchema).min(1),
});

export interface LocalisedRestaurantVenue {
  readonly name: string;
  readonly type: string | null;
  readonly michelinStars: number | null;
  readonly chef: string | null;
  readonly pastryChef: string | null;
  readonly sommelier: string | null;
  readonly since: number | null;
  readonly michelinSince: number | null;
  readonly features: readonly string[];
  readonly hours: string | null;
}

export interface LocalisedRestaurants {
  readonly count: number | null;
  readonly michelinStars: number | null;
  readonly venues: readonly LocalisedRestaurantVenue[];
}

export function readRestaurants(
  row: HotelDetailRow,
  locale: SupportedLocale,
): LocalisedRestaurants | null {
  const parsed = RestaurantInfoSchema.safeParse(row.restaurant_info);
  if (!parsed.success) return null;
  const venues: LocalisedRestaurantVenue[] = parsed.data.venues.map((v) => ({
    name: v.name,
    type: (locale === 'fr' ? (v.type_fr ?? v.type_en) : (v.type_en ?? v.type_fr)) ?? null,
    michelinStars: v.michelin_stars ?? null,
    chef: v.chef ?? null,
    pastryChef: v.pastry_chef ?? null,
    sommelier: v.sommelier ?? null,
    since: v.since ?? null,
    michelinSince: v.michelin_since ?? null,
    features: v.features ?? [],
    hours: (locale === 'fr' ? (v.hours_fr ?? v.hours_en) : (v.hours_en ?? v.hours_fr)) ?? null,
  }));
  return {
    count: parsed.data.count ?? null,
    michelinStars: parsed.data.michelin_stars ?? null,
    venues,
  };
}

// ---------------------------------------------------------------------------
// spa_info — Spa/wellness venue (hotels.spa_info jsonb)
// ---------------------------------------------------------------------------

const SpaInfoSchema = z.object({
  name: z.string().min(1),
  surface_sqm: z.number().int().positive().optional(),
  treatment_rooms: z.number().int().positive().optional(),
  features_fr: z.array(z.string().min(1)).optional(),
  features_en: z.array(z.string().min(1)).optional(),
});

export interface LocalisedSpa {
  readonly name: string;
  readonly surfaceSqm: number | null;
  readonly treatmentRooms: number | null;
  readonly features: readonly string[];
}

export function readSpa(row: HotelDetailRow, locale: SupportedLocale): LocalisedSpa | null {
  const parsed = SpaInfoSchema.safeParse(row.spa_info);
  if (!parsed.success) return null;
  const localizedFeatures =
    locale === 'fr'
      ? (parsed.data.features_fr ?? parsed.data.features_en ?? [])
      : (parsed.data.features_en ?? parsed.data.features_fr ?? []);
  return {
    name: parsed.data.name,
    surfaceSqm: parsed.data.surface_sqm ?? null,
    treatmentRooms: parsed.data.treatment_rooms ?? null,
    features: localizedFeatures,
  };
}

// ---------------------------------------------------------------------------
// Media — hero_image (text) + gallery_images (jsonb)
// ---------------------------------------------------------------------------

/**
 * Constraint mirrored from Cloudinary public_id grammar:
 * folder segments separated by `/`, each segment matches
 * `[A-Za-z0-9][A-Za-z0-9._-]*`. This rejects spaces, query strings,
 * absolute URLs and trickery while accepting realistic public_ids.
 */
const CloudinaryPublicIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/, {
    message: 'invalid Cloudinary public_id',
  });

const GalleryImageSchema = z.object({
  public_id: CloudinaryPublicIdSchema,
  alt_fr: z.string().min(1).optional(),
  alt_en: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
});

const GalleryImagesSchema = z.array(GalleryImageSchema);

export interface LocalisedGalleryImage {
  readonly publicId: string;
  readonly alt: string;
  readonly category: string | null;
}

export function readHeroImage(row: HotelDetailRow): string | null {
  if (row.hero_image === null) return null;
  const parsed = CloudinaryPublicIdSchema.safeParse(row.hero_image);
  return parsed.success ? parsed.data : null;
}

export function readGallery(
  row: HotelDetailRow,
  locale: SupportedLocale,
  fallbackName: string,
): readonly LocalisedGalleryImage[] {
  const parsed = GalleryImagesSchema.safeParse(row.gallery_images);
  if (!parsed.success) return [];
  return parsed.data.map((img) => ({
    publicId: img.public_id,
    alt:
      (locale === 'fr' ? (img.alt_fr ?? img.alt_en) : (img.alt_en ?? img.alt_fr)) ?? fallbackName,
    category: img.category ?? null,
  }));
}

export interface HotelRoomRow {
  readonly id: string;
  readonly room_code: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly max_occupancy: number | null;
  readonly bed_type: string | null;
  readonly size_sqm: number | null;
  readonly amenities: readonly string[];
}

const HotelRoomDbRowSchema = z.object({
  id: z.string().uuid(),
  room_code: z.string(),
  name_fr: stringOrEmpty,
  name_en: stringOrEmpty,
  description_fr: stringOrEmpty,
  description_en: stringOrEmpty,
  max_occupancy: z.number().int().nullable(),
  bed_type: stringOrEmpty,
  size_sqm: z.number().int().nullable(),
  amenities: z.unknown().nullable().optional(),
});

/** Slug shape: `^[a-z0-9]+(?:-[a-z0-9]+)*$` (matches `hotels_slug_ck`). */
export function isValidSlug(candidate: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate);
}

export interface HotelDetail {
  readonly row: HotelDetailRow;
  readonly rooms: readonly HotelRoomRow[];
}

/**
 * Public read of a hotel by slug. Anon client → RLS policy
 * `hotels_select_published` filters out unpublished rows automatically.
 *
 * Tries the locale-matching slug column first; falls back to the other.
 */
export async function getHotelBySlug(
  slug: string,
  locale: SupportedLocale,
): Promise<HotelDetail | null> {
  if (!isValidSlug(slug)) return null;

  // E2E / dev seam — short-circuit before touching Supabase. Activated
  // exclusively via `CCT_E2E_FAKE_HOTEL_ID`; see
  // `dev-fake-hotel-detail.ts` for the synthetic row.
  const fake = getFakeHotelDetailBySlug(slug, locale);
  if (fake !== null) return fake;

  try {
    const supabase = await createSupabaseServerClient();

    const primaryColumn = locale === 'en' ? 'slug_en' : 'slug';
    const fallbackColumn = locale === 'en' ? 'slug' : 'slug_en';

    let row = await supabase
      .from('hotels')
      .select(HOTEL_COLUMNS)
      .eq(primaryColumn, slug)
      .maybeSingle();

    if (!row.data) {
      row = await supabase
        .from('hotels')
        .select(HOTEL_COLUMNS)
        .eq(fallbackColumn, slug)
        .maybeSingle();
    }

    if (row.error || !row.data) return null;

    const parsed = HotelDetailRowSchema.safeParse(row.data);
    if (!parsed.success) {
      if (process.env['NODE_ENV'] !== 'production') {
        console.warn('[getHotelBySlug] parse error', parsed.error.flatten());
      }
      return null;
    }
    if (!parsed.data.is_published) return null;

    const roomsRes = await supabase
      .from('hotel_rooms')
      .select(
        'id, room_code, name_fr, name_en, description_fr, description_en, max_occupancy, bed_type, size_sqm, amenities',
      )
      .eq('hotel_id', parsed.data.id);

    const rooms: HotelRoomRow[] = [];
    if (!roomsRes.error && Array.isArray(roomsRes.data)) {
      for (const raw of roomsRes.data) {
        const r = HotelRoomDbRowSchema.safeParse(raw);
        if (!r.success) continue;
        rooms.push({
          id: r.data.id,
          room_code: r.data.room_code,
          name:
            locale === 'fr'
              ? (r.data.name_fr ?? r.data.name_en)
              : (r.data.name_en ?? r.data.name_fr),
          description:
            locale === 'fr'
              ? (r.data.description_fr ?? r.data.description_en)
              : (r.data.description_en ?? r.data.description_fr),
          max_occupancy: r.data.max_occupancy,
          bed_type: r.data.bed_type,
          size_sqm: r.data.size_sqm,
          amenities: readStringList(r.data.amenities, locale),
        });
      }
    }

    return { row: parsed.data, rooms };
  } catch (e) {
    // Degraded env (CI smoke, preview without Supabase) — render 404
    // instead of crashing the route.
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[getHotelBySlug] failed:', e);
    }
    return null;
  }
}

/** Pre-renderable list of slugs (FR + EN), for `generateStaticParams`. */
export interface PublishedHotelSlug {
  readonly slugFr: string;
  readonly slugEn: string | null;
}

/**
 * Service-role read for build-time (`generateStaticParams`) and `force-static`
 * route handlers (sitemap). No request cookies needed; we re-apply the same
 * `is_published = true` filter that the RLS policy `hotels_select_published`
 * enforces for anon reads.
 */
export async function listPublishedHotelSlugs(): Promise<readonly PublishedHotelSlug[]> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('hotels')
      .select('slug, slug_en')
      .eq('is_published', true)
      .order('priority', { ascending: true })
      .limit(500);
    if (error || !Array.isArray(data)) return [];
    const out: PublishedHotelSlug[] = [];
    for (const raw of data) {
      const slug = (raw as { slug?: unknown }).slug;
      const slugEn = (raw as { slug_en?: unknown }).slug_en;
      if (typeof slug === 'string' && isValidSlug(slug)) {
        out.push({
          slugFr: slug,
          slugEn: typeof slugEn === 'string' && isValidSlug(slugEn) ? slugEn : null,
        });
      }
    }
    return out;
  } catch {
    // No Supabase env (CI smoke, preview) — prerender no slug at build
    // time. The dynamic page still resolves at request time via the
    // seam or the regular Supabase path.
    return [];
  }
}
