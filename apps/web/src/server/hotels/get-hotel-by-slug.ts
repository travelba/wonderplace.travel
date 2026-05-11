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
  'id, slug, slug_en, name, name_en, stars, is_palace, region, department, city, district, address, postal_code, latitude, longitude, description_fr, description_en, highlights, amenities, faq_content, restaurant_info, spa_info, points_of_interest, transports, policies, awards, hero_image, gallery_images, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, booking_mode, amadeus_hotel_id, priority, google_rating, google_reviews_count, is_published, updated_at';

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

const PoliciesSchema = z.object({
  check_in: CheckInPolicySchema.optional(),
  check_out: CheckOutPolicySchema.optional(),
  cancellation: CancellationPolicySchema.optional(),
  pets: PetsPolicySchema.optional(),
  children: ChildrenPolicySchema.optional(),
  payment: PaymentPolicySchema.optional(),
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

export interface LocalisedPolicies {
  readonly checkIn: LocalisedCheckInPolicy | null;
  readonly checkOut: LocalisedCheckOutPolicy | null;
  readonly cancellation: LocalisedCancellationPolicy | null;
  readonly pets: LocalisedPetsPolicy | null;
  readonly children: LocalisedChildrenPolicy | null;
  readonly payment: LocalisedPaymentPolicy | null;
}

const EMPTY_POLICIES: LocalisedPolicies = {
  checkIn: null,
  checkOut: null,
  cancellation: null,
  pets: null,
  children: null,
  payment: null,
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
  };
}

export function hasAnyPolicy(p: LocalisedPolicies): boolean {
  return (
    p.checkIn !== null ||
    p.checkOut !== null ||
    p.cancellation !== null ||
    p.pets !== null ||
    p.children !== null ||
    p.payment !== null
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
});

const ROOM_LIST_COLUMNS =
  'id, slug, room_code, name_fr, name_en, description_fr, description_en, max_occupancy, bed_type, size_sqm, amenities';

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
      .select(ROOM_LIST_COLUMNS)
      .eq('hotel_id', parsed.data.id);

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
