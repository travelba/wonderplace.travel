import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getFakeRoomBySlug } from '@/server/hotels/dev-fake-room-detail';
import {
  getHotelBySlug,
  isValidSlug,
  type HotelDetail,
  type SupportedLocale,
} from '@/server/hotels/get-hotel-by-slug';

/**
 * Detailed room row consumed by `/hotel/[slug]/chambres/[roomSlug]` —
 * a strict superset of the list-card `HotelRoomRow`.
 *
 * Layered on top of `getHotelBySlug` so the parent hotel context (slug,
 * id, name, locale) is always available without a second round-trip and
 * the RLS contract is identical (anon SELECT → `is_published = true`).
 */

const stringOrEmpty = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v : null));

/**
 * Mirrors the Cloudinary public_id grammar in `get-hotel-by-slug.ts`.
 * Keeps the value safely embeddable in URLs without escaping.
 */
const CloudinaryPublicIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/, {
    message: 'invalid Cloudinary public_id',
  });

const RoomImageSchema = z.object({
  public_id: CloudinaryPublicIdSchema,
  alt_fr: z.string().min(1).optional(),
  alt_en: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
});

const RoomImagesSchema = z.array(RoomImageSchema);

const IndicativePriceMinorDetailSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative().optional(),
    currency: z.enum(['EUR', 'USD', 'GBP', 'CHF']),
  })
  .refine((p) => p.to === undefined || p.to >= p.from, {
    message: 'indicative_price_minor.to must be >= from',
  });

const HotelRoomDetailDbRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  room_code: z.string(),
  name_fr: stringOrEmpty,
  name_en: stringOrEmpty,
  description_fr: stringOrEmpty,
  description_en: stringOrEmpty,
  long_description_fr: stringOrEmpty,
  long_description_en: stringOrEmpty,
  max_occupancy: z.number().int().nullable(),
  bed_type: stringOrEmpty,
  size_sqm: z.number().int().nullable(),
  amenities: z.unknown().nullable().optional(),
  images: z.unknown().nullable().optional(),
  hero_image: stringOrEmpty,
  is_signature: z.boolean().nullable().optional(),
  indicative_price_minor: z.unknown().nullable().optional(),
});

const ROOM_DETAIL_COLUMNS =
  'id, slug, room_code, name_fr, name_en, description_fr, description_en, long_description_fr, long_description_en, max_occupancy, bed_type, size_sqm, amenities, images, hero_image, is_signature, indicative_price_minor';

export interface LocalisedRoomImage {
  readonly publicId: string;
  readonly alt: string;
  readonly category: string | null;
}

export interface RoomDetailIndicativePrice {
  readonly fromMinor: number;
  readonly toMinor: number | null;
  readonly currency: 'EUR' | 'USD' | 'GBP' | 'CHF';
}

export interface HotelRoomDetailRow {
  readonly id: string;
  readonly slug: string;
  readonly roomCode: string;
  readonly name: string;
  readonly shortDescription: string | null;
  readonly longDescription: string | null;
  readonly maxOccupancy: number | null;
  readonly bedType: string | null;
  readonly sizeSqm: number | null;
  readonly amenities: readonly string[];
  readonly heroImage: string | null;
  readonly images: readonly LocalisedRoomImage[];
  readonly isSignature: boolean;
  readonly indicativePrice: RoomDetailIndicativePrice | null;
}

export interface HotelRoomDetail {
  readonly hotel: HotelDetail;
  readonly room: HotelRoomDetailRow;
}

/** Localized list of amenity strings — accepts string[] or `{label_fr,label_en}[]`. */
function readAmenityList(raw: unknown, locale: SupportedLocale): readonly string[] {
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

function localizeImages(
  raw: unknown,
  locale: SupportedLocale,
  fallbackAlt: string,
): readonly LocalisedRoomImage[] {
  const parsed = RoomImagesSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.map((img) => ({
    publicId: img.public_id,
    alt: (locale === 'fr' ? (img.alt_fr ?? img.alt_en) : (img.alt_en ?? img.alt_fr)) ?? fallbackAlt,
    category: img.category ?? null,
  }));
}

function pickName(
  row: z.infer<typeof HotelRoomDetailDbRowSchema>,
  locale: SupportedLocale,
): string {
  if (locale === 'fr') {
    return row.name_fr ?? row.name_en ?? row.room_code;
  }
  return row.name_en ?? row.name_fr ?? row.room_code;
}

function pickShortDescription(
  row: z.infer<typeof HotelRoomDetailDbRowSchema>,
  locale: SupportedLocale,
): string | null {
  return locale === 'fr'
    ? (row.description_fr ?? row.description_en)
    : (row.description_en ?? row.description_fr);
}

function pickLongDescription(
  row: z.infer<typeof HotelRoomDetailDbRowSchema>,
  locale: SupportedLocale,
): string | null {
  return locale === 'fr'
    ? (row.long_description_fr ?? row.long_description_en)
    : (row.long_description_en ?? row.long_description_fr);
}

function readIndicativePriceDetail(raw: unknown): RoomDetailIndicativePrice | null {
  const parsed = IndicativePriceMinorDetailSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    fromMinor: parsed.data.from,
    toMinor: parsed.data.to ?? null,
    currency: parsed.data.currency,
  };
}

function rowToDetail(
  raw: z.infer<typeof HotelRoomDetailDbRowSchema>,
  locale: SupportedLocale,
): HotelRoomDetailRow {
  const name = pickName(raw, locale);
  return {
    id: raw.id,
    slug: raw.slug,
    roomCode: raw.room_code,
    name,
    shortDescription: pickShortDescription(raw, locale),
    longDescription: pickLongDescription(raw, locale),
    maxOccupancy: raw.max_occupancy,
    bedType: raw.bed_type,
    sizeSqm: raw.size_sqm,
    amenities: readAmenityList(raw.amenities, locale),
    heroImage: raw.hero_image,
    images: localizeImages(raw.images, locale, name),
    isSignature: raw.is_signature === true,
    indicativePrice: readIndicativePriceDetail(raw.indicative_price_minor),
  };
}

/**
 * Public read of a single room for `/hotel/[slug]/chambres/[roomSlug]`.
 *
 * Looks up the hotel first (anon RLS handles `is_published`), then the
 * room by `(hotel_id, slug)`. Returns `null` for invalid slugs, missing
 * hotels, missing rooms, or RLS-rejected rows.
 */
export async function getRoomBySlug(
  hotelSlug: string,
  roomSlug: string,
  locale: SupportedLocale,
): Promise<HotelRoomDetail | null> {
  if (!isValidSlug(hotelSlug) || !isValidSlug(roomSlug)) return null;

  // Dev/E2E seam — short-circuits when `CCT_E2E_FAKE_HOTEL_ID` is set and
  // the slug pair maps to a fixture. Keeps the room sub-page testable
  // without seeding `hotel_rooms` in Supabase.
  const fake = getFakeRoomBySlug(hotelSlug, roomSlug, locale);
  if (fake !== null) return fake;

  const hotel = await getHotelBySlug(hotelSlug, locale);
  if (!hotel) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('hotel_rooms')
      .select(ROOM_DETAIL_COLUMNS)
      .eq('hotel_id', hotel.row.id)
      .eq('slug', roomSlug)
      .maybeSingle();

    if (error || data === null) return null;

    const parsed = HotelRoomDetailDbRowSchema.safeParse(data);
    if (!parsed.success) {
      if (process.env['NODE_ENV'] !== 'production') {
        console.warn('[getRoomBySlug] parse error', parsed.error.flatten());
      }
      return null;
    }
    return { hotel, room: rowToDetail(parsed.data, locale) };
  } catch (e) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[getRoomBySlug] failed:', e);
    }
    return null;
  }
}

/** `(hotelSlug, roomSlug)` couple for `generateStaticParams`. */
export interface PublishedRoomSlug {
  readonly hotelSlugFr: string;
  readonly hotelSlugEn: string | null;
  readonly roomSlug: string;
}

/**
 * Service-role read for build-time static-params generation.
 * Pre-renders every room of every published hotel, in FR + EN.
 */
export async function listPublishedRoomSlugs(): Promise<readonly PublishedRoomSlug[]> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('hotel_rooms')
      .select('slug, hotel:hotels!inner(slug, slug_en, is_published)')
      .eq('hotel.is_published', true)
      .limit(2000);
    if (error || !Array.isArray(data)) return [];

    const out: PublishedRoomSlug[] = [];
    for (const raw of data) {
      const rec = raw as { slug?: unknown; hotel?: unknown };
      const roomSlug = rec.slug;
      const hotel = rec.hotel as
        | { slug?: unknown; slug_en?: unknown }
        | { slug?: unknown; slug_en?: unknown }[]
        | undefined;
      const hotelRow = Array.isArray(hotel) ? hotel[0] : hotel;
      if (typeof roomSlug !== 'string' || !isValidSlug(roomSlug)) continue;
      if (hotelRow === undefined) continue;
      const hotelSlug = hotelRow.slug;
      const hotelSlugEn = hotelRow.slug_en;
      if (typeof hotelSlug !== 'string' || !isValidSlug(hotelSlug)) continue;
      out.push({
        hotelSlugFr: hotelSlug,
        hotelSlugEn:
          typeof hotelSlugEn === 'string' && isValidSlug(hotelSlugEn) ? hotelSlugEn : null,
        roomSlug,
      });
    }
    return out;
  } catch {
    return [];
  }
}
