import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  AMENITY_CATEGORIES,
  amenityOrder,
  categorizeAmenity,
  categoryOrder,
  isPremiumAmenity,
  type AmenityCategory,
} from '@/server/hotels/amenity-taxonomy';
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
  postal_code: stringOrEmpty,
  latitude: numberOrNull,
  longitude: numberOrNull,
  description_fr: stringOrEmpty,
  description_en: stringOrEmpty,
  highlights: z.unknown().nullable().optional(),
  amenities: z.unknown().nullable().optional(),
  faq_content: z.unknown().nullable().optional(),
  restaurant_info: z.unknown().nullable().optional(),
  spa_info: z.unknown().nullable().optional(),
  points_of_interest: z.unknown().nullable().optional(),
  transports: z.unknown().nullable().optional(),
  policies: z.unknown().nullable().optional(),
  awards: z.unknown().nullable().optional(),
  signature_experiences: z.unknown().nullable().optional(),
  featured_reviews: z.unknown().nullable().optional(),
  hero_image: stringOrEmpty,
  gallery_images: z.unknown().nullable().optional(),
  long_description_sections: z.unknown().nullable().optional(),
  number_of_rooms: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((v) => v ?? null),
  number_of_suites: z
    .number()
    .int()
    .min(0)
    .nullish()
    .transform((v) => v ?? null),
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
  phone_e164: stringOrEmpty,
  opened_at: stringOrEmpty,
  last_renovated_at: stringOrEmpty,
  is_published: z.boolean(),
  updated_at: stringOrEmpty,
});

export type HotelDetailRow = z.infer<typeof HotelDetailRowSchema>;

const HOTEL_COLUMNS =
  'id, slug, slug_en, name, name_en, stars, is_palace, region, department, city, district, address, postal_code, latitude, longitude, description_fr, description_en, highlights, amenities, faq_content, restaurant_info, spa_info, points_of_interest, transports, policies, awards, signature_experiences, featured_reviews, hero_image, gallery_images, long_description_sections, number_of_rooms, number_of_suites, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, booking_mode, amadeus_hotel_id, priority, google_rating, google_reviews_count, phone_e164, opened_at, last_renovated_at, is_published, updated_at';

/**
 * E.164 phone-number format: leading `+`, country code, 4-15 digits, no
 * separators. Mirrors the DB `hotels_phone_e164_ck` constraint.
 */
const E164_PHONE_REGEX = /^\+[1-9][0-9]{3,14}$/;

/**
 * Returns the row's phone number if it parses as a valid E.164, otherwise
 * `null`. We deliberately drop loose / partial entries (e.g. `+33 1 58 12`
 * with spaces — those should be re-typed as `+33158122888` before they
 * surface in JSON-LD or click-to-call URLs). The CHECK constraint at the
 * DB level enforces the same shape, this guard is the runtime safety
 * net for legacy rows pre-migration `0020`.
 */
export function readPhoneE164(row: HotelDetailRow): string | null {
  if (row.phone_e164 === null) return null;
  const trimmed = row.phone_e164.trim();
  if (trimmed.length === 0) return null;
  return E164_PHONE_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Loose postal-code validation — accepts French 5-digit codes plus DOM-TOM
 * (97xxx / 98xxx) and the typical EU shapes for future international
 * properties. Editorial mistakes (whitespace, accents) are normalized.
 */
const POSTAL_CODE_REGEX = /^[A-Z0-9][A-Z0-9 -]{2,9}[A-Z0-9]$/i;

/**
 * Returns the row's postal code if it parses, otherwise `null`. Whitespace
 * is trimmed so editorial entries copy/pasted with trailing spaces still
 * pass.
 */
export function readPostalCode(row: HotelDetailRow): string | null {
  if (row.postal_code === null) return null;
  const trimmed = row.postal_code.trim();
  if (trimmed.length === 0) return null;
  return POSTAL_CODE_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Editorial opening / last-renovation dates (CDC §2.4 + §2.15).
 *
 * The DB stores full `date` values (CHECK-bounded between 1500-01-01 and
 * `current_date`, and `last_renovated_at >= opened_at` when both are set
 * — see migration `0022_hotel_dates_columns.sql`). The page only renders
 * the years; the JSON-LD builder maps `openedYear` to Schema.org
 * `foundingDate` as a bare `YYYY` string (which Google's hotel
 * rich-result validator accepts).
 *
 * We rely on the DB constraints rather than re-validating ranges here.
 * Defensive parsing only catches:
 *   - non-ISO inputs (string came back malformed from PostgREST),
 *   - empty strings (which `stringOrEmpty` already normalised to `null`),
 *   - years outside a sane editorial range (1500-current_year + 1) — a
 *     belt-and-braces guard for legacy rows pre-CHECK constraint.
 */
export interface HotelHistoryDates {
  readonly openedDate: string | null;
  readonly openedYear: number | null;
  readonly lastRenovatedDate: string | null;
  readonly lastRenovatedYear: number | null;
}

const EDITORIAL_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseEditorialDate(
  raw: string | null,
): { readonly iso: string; readonly year: number } | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const match = EDITORIAL_DATE_REGEX.exec(trimmed);
  if (match === null) return null;
  const yearString = match[1];
  if (yearString === undefined) return null;
  const year = Number.parseInt(yearString, 10);
  if (!Number.isFinite(year)) return null;
  // Sanity envelope — well beyond the DB CHECK but cheap.
  const currentYear = new Date().getUTCFullYear();
  if (year < 1500 || year > currentYear + 1) return null;
  return { iso: trimmed, year };
}

export function readHotelHistoryDates(row: HotelDetailRow): HotelHistoryDates {
  const opened = parseEditorialDate(row.opened_at);
  const renovated = parseEditorialDate(row.last_renovated_at);
  return {
    openedDate: opened?.iso ?? null,
    openedYear: opened?.year ?? null,
    lastRenovatedDate: renovated?.iso ?? null,
    lastRenovatedYear: renovated?.year ?? null,
  };
}

/**
 * Inventory counts (Schema.org `Hotel.numberOfRooms` + editorial suite count).
 *
 * Both fields are typed `number | null` in the row schema already — this
 * tiny indirection exists so the caller can spread `{ ...readInventoryCounts(row) }`
 * onto a JSON-LD input without rewriting the conditional. We pin
 * `totalRooms` to a positive integer (drops 0/NaN defensively even though
 * the DB CHECK forbids them) and pin `suites` to non-negative.
 */
export interface HotelInventoryCounts {
  readonly totalRooms: number | null;
  readonly suites: number | null;
}

/**
 * Long-form story section (CDC §2.4). Each entry maps 1:1 to an
 * `<h3 id="{anchor}">` + body paragraphs on the public hotel page.
 *
 *   - `anchor` is the URL-safe slug used both for the `<h3 id>` and
 *     for the table of contents link. Must be lowercase, kebab-cased.
 *   - `title_*` and `body_*` are required per locale, but we accept
 *     locale-only entries (e.g. French-only seed for legacy hotels).
 *   - `body_*` accepts CRLF or LF and is split on blank lines to
 *     render multi-paragraph bodies.
 *
 * We intentionally do NOT accept inline markdown in `body_*`; the
 * structured `title + body` already covers 95% of editorial needs
 * and we avoid shipping a markdown parser. A future migration could
 * widen the schema with a `format: 'plain' | 'markdown'` discriminator.
 */
const ANCHOR_REGEX = /^[a-z][a-z0-9-]{1,40}$/;
const LongDescriptionSectionSchema = z.object({
  anchor: z.string().regex(ANCHOR_REGEX, { message: 'expected lowercase kebab anchor' }),
  title_fr: z.string().min(1).optional(),
  title_en: z.string().min(1).optional(),
  body_fr: z.string().min(1).optional(),
  body_en: z.string().min(1).optional(),
});
const LongDescriptionSectionsSchema = z.array(LongDescriptionSectionSchema);

export interface LocalisedHotelStorySection {
  readonly anchor: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
}

/**
 * Returns the hotel's long-form story as an ordered list of localised
 * sections. Falls back to the other locale when a per-section
 * translation is missing, and drops sections that have neither a
 * title nor a body to show.
 */
export function readHotelStory(
  row: HotelDetailRow,
  locale: SupportedLocale,
): readonly LocalisedHotelStorySection[] {
  const parsed = LongDescriptionSectionsSchema.safeParse(row.long_description_sections);
  if (!parsed.success) return [];

  const out: LocalisedHotelStorySection[] = [];
  for (const section of parsed.data) {
    const title =
      locale === 'fr'
        ? (section.title_fr ?? section.title_en)
        : (section.title_en ?? section.title_fr);
    const body =
      locale === 'fr' ? (section.body_fr ?? section.body_en) : (section.body_en ?? section.body_fr);
    if (title === undefined || body === undefined) continue;
    const paragraphs = body
      .split(/\r?\n\r?\n+/u)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length === 0) continue;
    out.push({ anchor: section.anchor, title, paragraphs });
  }
  return out;
}

export function readInventoryCounts(row: HotelDetailRow): HotelInventoryCounts {
  const totalRooms =
    row.number_of_rooms !== null && Number.isInteger(row.number_of_rooms) && row.number_of_rooms > 0
      ? row.number_of_rooms
      : null;
  const suites =
    row.number_of_suites !== null &&
    Number.isInteger(row.number_of_suites) &&
    row.number_of_suites >= 0
      ? row.number_of_suites
      : null;
  return { totalRooms, suites };
}

/** A FAQ item that may appear under `hotels.faq_content`. */
/**
 * FAQ buckets for intent-based grouping on the public hotel page
 * (CDC §2.11). Mapping rationale:
 *
 *   - `before` — pre-stay logistics: address, transport from airport,
 *     pet policy, room categories, pricing range, dress code, etc.
 *     This is the bucket most travel searchers care about pre-click.
 *   - `during` — in-stay services: spa hours, breakfast service,
 *     pool, restaurant reservations, concierge desk hours.
 *   - `after` — post-stay: cancellation, modification, loyalty
 *     redemption, invoice / VAT, lost & found.
 *   - `agency` — property-level facts that are stable regardless of
 *     the booking lifecycle: palace distinction, history, official
 *     awards, ownership.
 *
 * Untagged entries fall into `before` (the historical bucket).
 */
export const FAQ_CATEGORIES = ['before', 'during', 'after', 'agency'] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];
const FaqCategorySchema = z.enum(FAQ_CATEGORIES);

export const FaqItemSchema = z.object({
  question_fr: z.string().min(1).optional(),
  question_en: z.string().min(1).optional(),
  answer_fr: z.string().min(1).optional(),
  answer_en: z.string().min(1).optional(),
  category: FaqCategorySchema.optional(),
});
export type FaqItem = z.infer<typeof FaqItemSchema>;

const FaqContentSchema = z.array(FaqItemSchema);

export interface LocalisedFaq {
  readonly question: string;
  readonly answer: string;
  readonly category: FaqCategory;
}

export interface LocalisedFaqGroup {
  readonly category: FaqCategory;
  readonly items: readonly LocalisedFaq[];
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

// ---------------------------------------------------------------------------
// amenities — typed view (CDC §2 bloc 7)
// ---------------------------------------------------------------------------

/** A single amenity preserved with its raw `key` so the UI can categorize / style it. */
export interface LocalisedAmenityEntry {
  /** Stable identifier (see `amenity-taxonomy.ts`). Falls back to a slugified label. */
  readonly key: string;
  /** Localized label shown to the guest. */
  readonly label: string;
  /** Whether this amenity should get the "premium" emphasis. */
  readonly isPremium: boolean;
}

/** Amenities grouped by category, with deterministic ordering. */
export interface LocalisedAmenityGroup {
  readonly category: AmenityCategory;
  readonly entries: readonly LocalisedAmenityEntry[];
}

/**
 * Best-effort kebab-case fallback for amenities that arrive without a `key`
 * (legacy editorial). Mirrors the slug grammar so the result is safe to
 * re-emit anywhere a key is expected.
 */
function slugifyForKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Returns amenities preserving the raw `key` (when present) so the caller
 * can apply taxonomy logic. Same input shape as `readAmenities`, but
 * lossless w.r.t. the structured `{ key, label_fr, label_en }` form.
 */
function readAmenityEntries(
  raw: unknown,
  locale: SupportedLocale,
): readonly LocalisedAmenityEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalisedAmenityEntry[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      const label = entry.trim();
      out.push({ key: slugifyForKey(label), label, isPremium: false });
      continue;
    }
    if (entry === null || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const labelCandidates =
      locale === 'fr'
        ? ['label_fr', 'name_fr', 'label', 'name']
        : ['label_en', 'name_en', 'label', 'name'];
    let label: string | null = null;
    for (const k of labelCandidates) {
      const v = e[k];
      if (typeof v === 'string' && v.trim().length > 0) {
        label = v.trim();
        break;
      }
    }
    if (label === null) continue;
    const rawKey = e['key'];
    const key = typeof rawKey === 'string' && rawKey.length > 0 ? rawKey : slugifyForKey(label);
    out.push({ key, label, isPremium: isPremiumAmenity(key) });
  }
  return out;
}

/**
 * Group amenities by canonical category. Empty groups are dropped, so the
 * UI never renders an empty `<h3>` section.
 *
 * Categories are presented in the order declared by `AMENITY_CATEGORIES`;
 * within a category, the entries are ordered by `amenityOrder(key)` then
 * by their label (stable Unicode sort).
 */
export function readAmenitiesByCategory(
  row: HotelDetailRow,
  locale: SupportedLocale,
): readonly LocalisedAmenityGroup[] {
  const entries = readAmenityEntries(row.amenities, locale);
  if (entries.length === 0) return [];

  const buckets = new Map<AmenityCategory, LocalisedAmenityEntry[]>();
  for (const entry of entries) {
    const cat = categorizeAmenity(entry.key);
    const arr = buckets.get(cat) ?? [];
    arr.push(entry);
    buckets.set(cat, arr);
  }

  const localeCmp = locale === 'fr' ? 'fr' : 'en';
  const groups: LocalisedAmenityGroup[] = [];
  for (const cat of AMENITY_CATEGORIES) {
    const arr = buckets.get(cat);
    if (arr === undefined || arr.length === 0) continue;
    const sorted = [...arr].sort((a, b) => {
      const oa = amenityOrder(a.key);
      const ob = amenityOrder(b.key);
      if (oa !== ob) return oa - ob;
      return a.label.localeCompare(b.label, localeCmp);
    });
    groups.push({ category: cat, entries: sorted });
  }

  // Defensive: `categoryOrder` is also exported so callers can re-sort if
  // they ever build groups outside this helper. We assert here that the
  // produced array is consistent with that helper to keep both code paths
  // honest (it costs ~O(n) at most).
  return groups.sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category));
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
      out.push({ question: q, answer: a, category: item.category ?? 'before' });
    }
  }
  return out;
}

/**
 * Groups the FAQ entries by intent bucket (CDC §2.11). The order of
 * the returned groups follows `FAQ_CATEGORIES` (`before`, `during`,
 * `after`, `agency`) — a deliberate pre-stay-first ranking that
 * mirrors the average traveller's mental model. Buckets with zero
 * items are omitted.
 *
 * We preserve the in-bucket order from the source (Payload editorial
 * sort, which is array-position) — alphabetising would scramble
 * questions designed to flow narratively ("Is breakfast included?"
 * before "What time is breakfast served?").
 */
export function readFaqByCategory(
  row: HotelDetailRow,
  locale: SupportedLocale,
): readonly LocalisedFaqGroup[] {
  const flat = readFaq(row, locale);
  if (flat.length === 0) return [];
  const buckets = new Map<FaqCategory, LocalisedFaq[]>();
  for (const cat of FAQ_CATEGORIES) {
    buckets.set(cat, []);
  }
  for (const item of flat) {
    buckets.get(item.category)?.push(item);
  }
  const groups: LocalisedFaqGroup[] = [];
  for (const cat of FAQ_CATEGORIES) {
    const items = buckets.get(cat);
    if (items !== undefined && items.length > 0) {
      groups.push({ category: cat, items });
    }
  }
  return groups;
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

// ---------------------------------------------------------------------------
// Location enrichment — points_of_interest (jsonb) + transports (jsonb)
// ---------------------------------------------------------------------------

const PointOfInterestSchema = z.object({
  name: z.string().min(1),
  name_en: z.string().min(1).optional(),
  type: z.string().min(1),
  category_fr: z.string().min(1).optional(),
  category_en: z.string().min(1).optional(),
  distance_meters: z.number().int().nonnegative(),
  walk_minutes: z.number().int().nonnegative().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const PointsOfInterestSchema = z.array(PointOfInterestSchema);

const TransportModeSchema = z.enum([
  'metro',
  'rer',
  'tram',
  'bus',
  'train',
  'taxi',
  'airport_shuttle',
]);

const TransportSchema = z.object({
  mode: TransportModeSchema,
  line: z.string().min(1).optional(),
  station: z.string().min(1),
  station_en: z.string().min(1).optional(),
  distance_meters: z.number().int().nonnegative(),
  walk_minutes: z.number().int().nonnegative().optional(),
  notes_fr: z.string().min(1).optional(),
  notes_en: z.string().min(1).optional(),
});

const TransportsSchema = z.array(TransportSchema);

export type TransportMode = z.infer<typeof TransportModeSchema>;

export interface LocalisedPointOfInterest {
  readonly name: string;
  readonly type: string;
  readonly category: string | null;
  readonly distanceMeters: number;
  readonly walkMinutes: number | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface LocalisedTransport {
  readonly mode: TransportMode;
  readonly line: string | null;
  readonly station: string;
  readonly distanceMeters: number;
  readonly walkMinutes: number | null;
  readonly notes: string | null;
}

export interface LocalisedLocation {
  readonly pointsOfInterest: readonly LocalisedPointOfInterest[];
  readonly transports: readonly LocalisedTransport[];
}

/**
 * Returns the localized POI + transport snapshot for the hotel.
 *
 * Caller decides whether the fiche shows the section: an empty
 * `{ pointsOfInterest: [], transports: [] }` is a valid "no enriched
 * location yet" state.
 */
export function readLocation(row: HotelDetailRow, locale: SupportedLocale): LocalisedLocation {
  const poisRaw = PointsOfInterestSchema.safeParse(row.points_of_interest);
  const transportsRaw = TransportsSchema.safeParse(row.transports);

  const pointsOfInterest: LocalisedPointOfInterest[] = poisRaw.success
    ? poisRaw.data.map((p) => ({
        name: (locale === 'fr' ? p.name : (p.name_en ?? p.name)).trim(),
        type: p.type,
        category:
          (locale === 'fr' ? (p.category_fr ?? p.category_en) : (p.category_en ?? p.category_fr)) ??
          null,
        distanceMeters: p.distance_meters,
        walkMinutes: p.walk_minutes ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
      }))
    : [];

  const transports: LocalisedTransport[] = transportsRaw.success
    ? transportsRaw.data.map((t) => ({
        mode: t.mode,
        line: t.line ?? null,
        station: (locale === 'fr' ? t.station : (t.station_en ?? t.station)).trim(),
        distanceMeters: t.distance_meters,
        walkMinutes: t.walk_minutes ?? null,
        notes: (locale === 'fr' ? (t.notes_fr ?? t.notes_en) : (t.notes_en ?? t.notes_fr)) ?? null,
      }))
    : [];

  return { pointsOfInterest, transports };
}

// ---------------------------------------------------------------------------
// policies (jsonb)
// ---------------------------------------------------------------------------

/** `HH:MM` 24-hour time string (e.g. `15:00`, `23:30`). */
const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'expected HH:MM time' });

const PaymentMethodSchema = z.enum([
  'visa',
  'mc',
  'amex',
  'diners',
  'jcb',
  'unionpay',
  'apple_pay',
  'google_pay',
  'cash',
  'bank_transfer',
]);

const CheckInPolicySchema = z.object({
  from: TimeOfDaySchema,
  until: TimeOfDaySchema.optional(),
});

const CheckOutPolicySchema = z.object({
  until: TimeOfDaySchema,
});

const CancellationPolicySchema = z.object({
  summary_fr: z.string().min(1).optional(),
  summary_en: z.string().min(1).optional(),
  free_until_hours: z.number().int().nonnegative().optional(),
  penalty_after_fr: z.string().min(1).optional(),
  penalty_after_en: z.string().min(1).optional(),
});

const PetsPolicySchema = z.object({
  allowed: z.boolean(),
  fee_eur: z.number().nonnegative().optional(),
  notes_fr: z.string().min(1).optional(),
  notes_en: z.string().min(1).optional(),
});

const ChildrenPolicySchema = z.object({
  welcome: z.boolean(),
  free_under_age: z.number().int().nonnegative().optional(),
  extra_bed_fee_eur: z.number().nonnegative().optional(),
  notes_fr: z.string().min(1).optional(),
  notes_en: z.string().min(1).optional(),
});

const PaymentPolicySchema = z.object({
  methods: z.array(PaymentMethodSchema).min(1),
  deposit_required: z.boolean().optional(),
  notes_fr: z.string().min(1).optional(),
  notes_en: z.string().min(1).optional(),
});

/**
 * City / tourist tax (taxe de séjour).
 *
 * Modeled as a per-person-per-night flat amount in the property's
 * currency because that's how French municipalities (and most EU
 * jurisdictions) publish their rates — even when the tax is
 * technically tiered by category (e.g. palace, 5★, 4★). The
 * Île-de-France 25 % regional surtax in Paris is typically rolled
 * into the displayed amount and called out in `notes_fr/en` so that
 * the public-facing copy is unambiguous.
 *
 * Editors set `free_under_age` when minors are exempt (most French
 * municipalities exempt under-18s, but some apply ages 12 or 16).
 */
const CityTaxPolicySchema = z.object({
  amount_per_person_per_night: z.number().nonnegative(),
  currency: z.enum(['EUR', 'USD', 'GBP', 'CHF']).default('EUR'),
  free_under_age: z.number().int().nonnegative().optional(),
  notes_fr: z.string().min(1).optional(),
  notes_en: z.string().min(1).optional(),
});

/**
 * Wi-Fi policy. Booking engines and OTAs penalise hotels with
 * paywalled Wi-Fi heavily — surfacing "Wi-Fi haut débit inclus
 * dans toutes les chambres" prominently is a documented conversion
 * lever, and palaces typically include it. We model it as a
 * structured node (not a free amenity flag) because the *scope*
 * matters: some properties include public-areas Wi-Fi but charge
 * for in-room access.
 */
const WifiPolicySchema = z.object({
  included: z.boolean(),
  scope: z.enum(['whole_property', 'public_areas', 'rooms']).optional(),
  notes_fr: z.string().min(1).optional(),
  notes_en: z.string().min(1).optional(),
});

const PoliciesSchema = z.object({
  check_in: CheckInPolicySchema.optional(),
  check_out: CheckOutPolicySchema.optional(),
  cancellation: CancellationPolicySchema.optional(),
  pets: PetsPolicySchema.optional(),
  children: ChildrenPolicySchema.optional(),
  payment: PaymentPolicySchema.optional(),
  city_tax: CityTaxPolicySchema.optional(),
  wifi: WifiPolicySchema.optional(),
});

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export interface LocalisedCheckInPolicy {
  readonly from: string;
  readonly until: string | null;
}
export interface LocalisedCheckOutPolicy {
  readonly until: string;
}
export interface LocalisedCancellationPolicy {
  readonly summary: string | null;
  readonly freeUntilHours: number | null;
  readonly penaltyAfter: string | null;
}
export interface LocalisedPetsPolicy {
  readonly allowed: boolean;
  readonly feeEur: number | null;
  readonly notes: string | null;
}
export interface LocalisedChildrenPolicy {
  readonly welcome: boolean;
  readonly freeUnderAge: number | null;
  readonly extraBedFeeEur: number | null;
  readonly notes: string | null;
}
export interface LocalisedPaymentPolicy {
  readonly methods: readonly PaymentMethod[];
  readonly depositRequired: boolean | null;
  readonly notes: string | null;
}
export interface LocalisedCityTaxPolicy {
  readonly amountPerPersonPerNight: number;
  readonly currency: 'EUR' | 'USD' | 'GBP' | 'CHF';
  readonly freeUnderAge: number | null;
  readonly notes: string | null;
}
export interface LocalisedWifiPolicy {
  readonly included: boolean;
  readonly scope: 'whole_property' | 'public_areas' | 'rooms' | null;
  readonly notes: string | null;
}

export interface LocalisedPolicies {
  readonly checkIn: LocalisedCheckInPolicy | null;
  readonly checkOut: LocalisedCheckOutPolicy | null;
  readonly cancellation: LocalisedCancellationPolicy | null;
  readonly pets: LocalisedPetsPolicy | null;
  readonly children: LocalisedChildrenPolicy | null;
  readonly payment: LocalisedPaymentPolicy | null;
  readonly cityTax: LocalisedCityTaxPolicy | null;
  readonly wifi: LocalisedWifiPolicy | null;
}

const EMPTY_POLICIES: LocalisedPolicies = {
  checkIn: null,
  checkOut: null,
  cancellation: null,
  pets: null,
  children: null,
  payment: null,
  cityTax: null,
  wifi: null,
};

export function readPolicies(row: HotelDetailRow, locale: SupportedLocale): LocalisedPolicies {
  const parsed = PoliciesSchema.safeParse(row.policies);
  if (!parsed.success) return EMPTY_POLICIES;
  const p = parsed.data;

  const pickFr = (fr: string | undefined, en: string | undefined): string | null =>
    (locale === 'fr' ? (fr ?? en) : (en ?? fr)) ?? null;

  return {
    checkIn:
      p.check_in !== undefined ? { from: p.check_in.from, until: p.check_in.until ?? null } : null,
    checkOut: p.check_out !== undefined ? { until: p.check_out.until } : null,
    cancellation:
      p.cancellation !== undefined
        ? {
            summary: pickFr(p.cancellation.summary_fr, p.cancellation.summary_en),
            freeUntilHours: p.cancellation.free_until_hours ?? null,
            penaltyAfter: pickFr(p.cancellation.penalty_after_fr, p.cancellation.penalty_after_en),
          }
        : null,
    pets:
      p.pets !== undefined
        ? {
            allowed: p.pets.allowed,
            feeEur: p.pets.fee_eur ?? null,
            notes: pickFr(p.pets.notes_fr, p.pets.notes_en),
          }
        : null,
    children:
      p.children !== undefined
        ? {
            welcome: p.children.welcome,
            freeUnderAge: p.children.free_under_age ?? null,
            extraBedFeeEur: p.children.extra_bed_fee_eur ?? null,
            notes: pickFr(p.children.notes_fr, p.children.notes_en),
          }
        : null,
    payment:
      p.payment !== undefined
        ? {
            methods: p.payment.methods,
            depositRequired: p.payment.deposit_required ?? null,
            notes: pickFr(p.payment.notes_fr, p.payment.notes_en),
          }
        : null,
    cityTax:
      p.city_tax !== undefined
        ? {
            amountPerPersonPerNight: p.city_tax.amount_per_person_per_night,
            currency: p.city_tax.currency,
            freeUnderAge: p.city_tax.free_under_age ?? null,
            notes: pickFr(p.city_tax.notes_fr, p.city_tax.notes_en),
          }
        : null,
    wifi:
      p.wifi !== undefined
        ? {
            included: p.wifi.included,
            scope: p.wifi.scope ?? null,
            notes: pickFr(p.wifi.notes_fr, p.wifi.notes_en),
          }
        : null,
  };
}

export function hasAnyPolicy(p: LocalisedPolicies): boolean {
  return (
    p.checkIn !== null ||
    p.checkOut !== null ||
    p.cancellation !== null ||
    p.pets !== null ||
    p.children !== null ||
    p.payment !== null ||
    p.cityTax !== null ||
    p.wifi !== null
  );
}

// ---------------------------------------------------------------------------
// awards (jsonb)
// ---------------------------------------------------------------------------

/**
 * URL whitelist: https only (no http, no javascript:, no relative).
 * Bounded length prevents stuffed seo-spam URLs from leaking into JSON-LD.
 */
const AwardUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith('https://'), { message: 'award url must be https' });

const AwardSchema = z.object({
  name_fr: z.string().min(1),
  name_en: z.string().min(1),
  issuer: z.string().min(1),
  year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1)
    .optional(),
  url: AwardUrlSchema.optional(),
  image: CloudinaryPublicIdSchema.optional(),
});

const AwardsSchema = z.array(AwardSchema);

export interface LocalisedAward {
  readonly name: string;
  readonly issuer: string;
  readonly year: number | null;
  readonly url: string | null;
  readonly image: string | null;
}

/**
 * Returns the localized awards list, sorted by year descending (most recent
 * first) with year-less awards last. Empty array is a valid "no awards
 * recorded" state — callers decide whether to hide the section.
 */
export function readAwards(
  row: HotelDetailRow,
  locale: SupportedLocale,
): readonly LocalisedAward[] {
  const parsed = AwardsSchema.safeParse(row.awards);
  if (!parsed.success) return [];

  const localized: LocalisedAward[] = parsed.data.map((a) => ({
    name: (locale === 'fr' ? a.name_fr : a.name_en).trim(),
    issuer: a.issuer.trim(),
    year: a.year ?? null,
    url: a.url ?? null,
    image: a.image ?? null,
  }));

  // Recent-first; entries without a year fall to the bottom while keeping a
  // stable order amongst themselves (Array#sort is stable since ES2019).
  return localized.sort((left, right) => {
    if (left.year === null && right.year === null) return 0;
    if (left.year === null) return 1;
    if (right.year === null) return -1;
    return right.year - left.year;
  });
}

// ---------------------------------------------------------------------------
// signature_experiences (jsonb) — CDC §2.12
// ---------------------------------------------------------------------------

/**
 * Stable identifier grammar for a signature experience: lowercase
 * kebab-case, 2-48 chars. Used both as React key and as URL anchor
 * if the editorial team links to a specific card.
 */
const EXPERIENCE_KEY_REGEX = /^[a-z][a-z0-9-]{1,47}$/;

const SignatureExperienceSchema = z.object({
  key: z.string().regex(EXPERIENCE_KEY_REGEX, {
    message: 'expected lowercase kebab key (2-48 chars)',
  }),
  title_fr: z.string().min(1),
  title_en: z.string().min(1),
  description_fr: z.string().min(1).max(500),
  description_en: z.string().min(1).max(500),
  badge_fr: z.string().min(1).max(48).optional(),
  badge_en: z.string().min(1).max(48).optional(),
  /**
   * Whether the experience requires an explicit booking on top of the
   * stay. Drives the wording of the CTA / footer line ("Sur réservation"
   * vs "Inclus dans le séjour").
   */
  booking_required: z.boolean(),
  image_public_id: CloudinaryPublicIdSchema.optional(),
});

const SignatureExperiencesSchema = z.array(SignatureExperienceSchema);

export interface LocalisedSignatureExperience {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly badge: string | null;
  readonly bookingRequired: boolean;
  readonly imagePublicId: string | null;
}

/**
 * Returns the property's signature experiences, localized. Falls back
 * to the other locale per-field when one side is missing — but since
 * `title_*` and `description_*` are both required by the schema, the
 * fallback only matters if editorial inserts an under-typed payload
 * via a future Payload migration.
 *
 * Empty array is a valid "no signature experiences declared" state;
 * the UI component self-elides in that case.
 */
export function readSignatureExperiences(
  row: HotelDetailRow,
  locale: SupportedLocale,
): readonly LocalisedSignatureExperience[] {
  const parsed = SignatureExperiencesSchema.safeParse(row.signature_experiences);
  if (!parsed.success) return [];

  return parsed.data.map((e) => ({
    key: e.key,
    title: locale === 'fr' ? e.title_fr : e.title_en,
    description: locale === 'fr' ? e.description_fr : e.description_en,
    badge: (locale === 'fr' ? (e.badge_fr ?? e.badge_en) : (e.badge_en ?? e.badge_fr)) ?? null,
    bookingRequired: e.booking_required,
    imagePublicId: e.image_public_id ?? null,
  }));
}

// ---------------------------------------------------------------------------
// featured_reviews (jsonb) — CDC §2.10 (editorial pull-quotes)
// ---------------------------------------------------------------------------

/**
 * Publication-date guard: ISO-8601 `YYYY-MM-DD`, leap years not
 * validated at this level (Zod's `z.string().date()` would refuse
 * `2024-02-30` but is a Zod 3.23+ feature; we ship a self-contained
 * regex to keep the runtime predictable across Zod versions).
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * HTTPS-only URL guard reused from the awards schema spirit. We
 * accept up to 2048 chars to fit real-world long URLs (Forbes
 * Travel Guide query-stringed canonical links can exceed 200).
 */
const HttpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith('https://'), { message: 'review url must be https' });

const FeaturedReviewSchema = z
  .object({
    source: z.string().min(1).max(120),
    source_url: HttpsUrlSchema.optional(),
    author: z.string().min(1).max(160).optional(),
    quote_fr: z.string().min(1).max(500).optional(),
    quote_en: z.string().min(1).max(500).optional(),
    rating: z.number().min(0).max(100).optional(),
    max_rating: z.number().int().min(1).max(100).optional(),
    date_iso: z.string().regex(ISO_DATE_REGEX).optional(),
  })
  .refine((r) => r.quote_fr !== undefined || r.quote_en !== undefined, {
    message: 'at least one of quote_fr/quote_en is required',
  })
  .refine((r) => (r.rating !== undefined ? r.max_rating !== undefined : true), {
    message: 'rating requires max_rating',
  })
  .refine(
    (r) => (r.rating !== undefined && r.max_rating !== undefined ? r.rating <= r.max_rating : true),
    { message: 'rating must be ≤ max_rating' },
  );

const FeaturedReviewsSchema = z.array(FeaturedReviewSchema);

export interface LocalisedFeaturedReview {
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly author: string | null;
  readonly quote: string;
  readonly rating: number | null;
  readonly maxRating: number | null;
  readonly dateIso: string | null;
}

/**
 * Returns the editorial featured review quotes for the hotel,
 * localized. Empty array is a valid "no curated quotes yet" state.
 *
 * Sort order: by `date_iso` descending (most recent first), with
 * date-less entries appended at the end in source order. This
 * matches the editorial expectation that the freshest accolade
 * lands at the top of the block — and it's the order LLM
 * ingestion will prefer for `Hotel.review[]`.
 *
 * Cap: callers decide how many to render; the JSON-LD builder caps
 * at 5 (Google's Rich Results sweet spot) and the UI component
 * caps at 3 (visual density). We intentionally do NOT cap here.
 */
export function readFeaturedReviews(
  row: HotelDetailRow,
  locale: SupportedLocale,
): readonly LocalisedFeaturedReview[] {
  const parsed = FeaturedReviewsSchema.safeParse(row.featured_reviews);
  if (!parsed.success) return [];

  const localized: LocalisedFeaturedReview[] = [];
  for (const r of parsed.data) {
    const quote = locale === 'fr' ? (r.quote_fr ?? r.quote_en) : (r.quote_en ?? r.quote_fr);
    // The schema refinement guarantees at least one quote is present;
    // narrow defensively for TypeScript without an assertion.
    if (quote === undefined) continue;
    localized.push({
      source: r.source,
      sourceUrl: r.source_url ?? null,
      author: r.author ?? null,
      quote,
      rating: r.rating ?? null,
      maxRating: r.max_rating ?? null,
      dateIso: r.date_iso ?? null,
    });
  }

  return localized.sort((left, right) => {
    if (left.dateIso === null && right.dateIso === null) return 0;
    if (left.dateIso === null) return 1;
    if (right.dateIso === null) return -1;
    return right.dateIso.localeCompare(left.dateIso);
  });
}

/**
 * Editorial indicative price range for a room category.
 *
 * Stored in jsonb to keep the shape one-sided ("from 1 200 €", no
 * upper bound) and to carry a currency code per row (later useful when
 * we wire a multi-currency selector, cf. Phase 11+).
 *
 * Amounts are in the currency's **minor unit** (cents for EUR/USD,
 * pence for GBP) — matches the existing Amadeus offer pricing
 * convention in `packages/integrations/amadeus`, so the codebase
 * keeps a single mental model for money.
 *
 * Optional `to` — when omitted, the UI renders "À partir de {from}"
 * rather than a closed range.
 */
const IndicativePriceMinorSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative().optional(),
    currency: z.enum(['EUR', 'USD', 'GBP', 'CHF']),
  })
  .refine((p) => p.to === undefined || p.to >= p.from, {
    message: 'indicative_price_minor.to must be >= from',
  });

export interface LocalisedIndicativePrice {
  readonly fromMinor: number;
  readonly toMinor: number | null;
  readonly currency: 'EUR' | 'USD' | 'GBP' | 'CHF';
}

export interface HotelRoomRow {
  readonly id: string;
  readonly slug: string;
  readonly room_code: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly max_occupancy: number | null;
  readonly bed_type: string | null;
  readonly size_sqm: number | null;
  readonly amenities: readonly string[];
  readonly isSignature: boolean;
  readonly indicativePrice: LocalisedIndicativePrice | null;
  readonly displayOrder: number | null;
}

const HotelRoomDbRowSchema = z.object({
  id: z.string().uuid(),
  slug: stringOrEmpty,
  room_code: z.string(),
  name_fr: stringOrEmpty,
  name_en: stringOrEmpty,
  description_fr: stringOrEmpty,
  description_en: stringOrEmpty,
  max_occupancy: z.number().int().nullable(),
  bed_type: stringOrEmpty,
  size_sqm: z.number().int().nullable(),
  amenities: z.unknown().nullable().optional(),
  is_signature: z.boolean().nullable().optional(),
  indicative_price_minor: z.unknown().nullable().optional(),
  display_order: z.number().int().nullable().optional(),
});

const ROOM_LIST_COLUMNS =
  'id, slug, room_code, name_fr, name_en, description_fr, description_en, max_occupancy, bed_type, size_sqm, amenities, is_signature, indicative_price_minor, display_order';

function readIndicativePrice(raw: unknown): LocalisedIndicativePrice | null {
  const parsed = IndicativePriceMinorSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    fromMinor: parsed.data.from,
    toMinor: parsed.data.to ?? null,
    currency: parsed.data.currency,
  };
}

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

    // Order rooms by:
    //   1. `display_order` (NULLS LAST) — editorial override,
    //   2. `is_signature DESC` — signature suite always above the
    //      generic categories when the editor hasn't set an explicit
    //      order,
    //   3. `id` — stable tie-breaker so the SSR/ISR output is
    //      deterministic across renders.
    const roomsRes = await supabase
      .from('hotel_rooms')
      .select(ROOM_LIST_COLUMNS)
      .eq('hotel_id', parsed.data.id)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('is_signature', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true });

    const rooms: HotelRoomRow[] = [];
    if (!roomsRes.error && Array.isArray(roomsRes.data)) {
      for (const raw of roomsRes.data) {
        const r = HotelRoomDbRowSchema.safeParse(raw);
        if (!r.success) continue;
        rooms.push({
          id: r.data.id,
          slug: r.data.slug ?? r.data.room_code,
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
          isSignature: r.data.is_signature === true,
          indicativePrice: readIndicativePrice(r.data.indicative_price_minor),
          displayOrder: r.data.display_order ?? null,
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
 * Catalog summary used by GEO/LLM surfaces (llms.txt, llms-full.txt). Carries
 * only the strict minimum to build a one-line description per hotel — keeps
 * the LLM corpus compact (no descriptions, no awards).
 */
export interface PublishedHotelSummary {
  readonly slugFr: string;
  readonly slugEn: string | null;
  readonly nameFr: string;
  readonly nameEn: string | null;
  readonly city: string;
  readonly stars: number;
  readonly isPalace: boolean;
  readonly priority: 'P0' | 'P1' | 'P2';
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

const HotelSummaryRowSchema = z.object({
  slug: z.string(),
  slug_en: stringOrEmpty,
  name: z.string(),
  name_en: stringOrEmpty,
  city: z.string(),
  stars: z.number().int().min(1).max(5),
  is_palace: z.boolean(),
  priority: PrioritySchema,
});

/**
 * Service-role catalog read for GEO/LLM surfaces (`llms.txt`,
 * `llms-full.txt`). Returns up to `limit` published hotels ordered by
 * editorial priority then name. Mirrors `hotels_select_published` (anon RLS
 * filters `is_published = true`).
 */
export async function listPublishedHotelSummaries(
  limit = 50,
): Promise<readonly PublishedHotelSummary[]> {
  // Guard against accidental fan-out — Supabase silently caps very large
  // limits, but an explicit bound documents intent.
  const safeLimit = Math.max(1, Math.min(500, limit));
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('hotels')
      .select('slug, slug_en, name, name_en, city, stars, is_palace, priority')
      .eq('is_published', true)
      .order('priority', { ascending: true })
      .order('name', { ascending: true })
      .limit(safeLimit);
    if (error || !Array.isArray(data)) return [];

    const out: PublishedHotelSummary[] = [];
    for (const raw of data) {
      const parsed = HotelSummaryRowSchema.safeParse(raw);
      if (!parsed.success) continue;
      const row = parsed.data;
      if (!isValidSlug(row.slug)) continue;
      out.push({
        slugFr: row.slug,
        slugEn:
          row.slug_en !== null && row.slug_en.length > 0 && isValidSlug(row.slug_en)
            ? row.slug_en
            : null,
        nameFr: row.name,
        nameEn: row.name_en !== null && row.name_en.length > 0 ? row.name_en : null,
        city: row.city,
        stars: row.stars,
        isPalace: row.is_palace,
        priority: row.priority,
      });
    }
    return out;
  } catch {
    return [];
  }
}
