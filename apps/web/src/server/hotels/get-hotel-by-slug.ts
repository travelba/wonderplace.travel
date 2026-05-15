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
  virtual_tour_url: stringOrEmpty,
  mice_info: z.unknown().nullable().optional(),
  // External identifiers & knowledge-graph anchors (migration 0025).
  // All optional — backfilled by `scripts/editorial-pilot/src/enrichment/enrich-wikidata-ids.ts`.
  wikidata_id: stringOrEmpty,
  wikipedia_url_fr: stringOrEmpty,
  wikipedia_url_en: stringOrEmpty,
  tripadvisor_location_id: stringOrEmpty,
  booking_com_hotel_id: stringOrEmpty,
  expedia_property_id: stringOrEmpty,
  hotels_com_hotel_id: stringOrEmpty,
  agoda_hotel_id: stringOrEmpty,
  official_url: stringOrEmpty,
  email_reservations: stringOrEmpty,
  commons_category: stringOrEmpty,
  external_sameas: z.unknown().nullable().optional(),
  is_published: z.boolean(),
  updated_at: stringOrEmpty,
});

export type HotelDetailRow = z.infer<typeof HotelDetailRowSchema>;

const HOTEL_COLUMNS =
  'id, slug, slug_en, name, name_en, stars, is_palace, region, department, city, district, address, postal_code, latitude, longitude, description_fr, description_en, highlights, amenities, faq_content, restaurant_info, spa_info, points_of_interest, transports, policies, awards, signature_experiences, featured_reviews, hero_image, gallery_images, long_description_sections, number_of_rooms, number_of_suites, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, booking_mode, amadeus_hotel_id, priority, google_rating, google_reviews_count, phone_e164, opened_at, last_renovated_at, virtual_tour_url, mice_info, wikidata_id, wikipedia_url_fr, wikipedia_url_en, tripadvisor_location_id, booking_com_hotel_id, expedia_property_id, hotels_com_hotel_id, agoda_hotel_id, official_url, email_reservations, commons_category, external_sameas, is_published, updated_at';

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
 * External identifiers + knowledge-graph anchors (migration 0025).
 *
 * Surfaces to:
 *   - the JSON-LD `sameAs[]` array (Schema.org best-practice signal that
 *     anchors the hotel in the AI/agentic knowledge graph — Wikidata,
 *     Wikipedia, official website, social handles, OTA listings),
 *   - the `subjectOf[]` array (Article schema pointing at the Wikipedia
 *     and Commons gallery pages — strong EEAT signal),
 *   - the `additionalType` URL (Schema.org `Hotel` is too coarse; we
 *     point at the Wikidata QID so AI agents disambiguate the exact
 *     property — a "Cheval Blanc" can be the chain, the Courchevel
 *     fiche, or the Saint-Tropez fiche; only the QID is unambiguous),
 *   - the booking widget (email_reservations for booking_mode=email),
 *   - the price-comparator persisted fallback (booking_com_hotel_id,
 *     expedia_property_id, hotels_com_hotel_id — never exposed on the
 *     UI per addendum v3.2: no logos, no clickable refs).
 *
 * All values are passed through narrow validators so a corrupt DB row
 * (or an editor mistake reaching production) can never poison the
 * JSON-LD with a half-typed identifier.
 */
export interface HotelExternalIds {
  /** Wikidata QID — `Q1573604` etc. Source of truth for `additionalType`. */
  readonly wikidataId: string | null;
  /** French Wikipedia article URL — `subjectOf` + `sameAs`. */
  readonly wikipediaUrlFr: string | null;
  /** English Wikipedia article URL — `subjectOf` (en locale) + `sameAs`. */
  readonly wikipediaUrlEn: string | null;
  /** Official hotel website (HTTPS). Surfaces as `url` companion + `sameAs`. */
  readonly officialUrl: string | null;
  /** Reservation email — drives the `mailto:` CTA when booking_mode=email. */
  readonly emailReservations: string | null;
  /** Wikimedia Commons category — powers the photo-import pipeline. */
  readonly commonsCategory: string | null;
  /** TripAdvisor location ID — `sameAs` target (numeric). */
  readonly tripadvisorLocationId: string | null;
  /** Booking.com hotel slug — comparator only, never UI. */
  readonly bookingComHotelId: string | null;
  /** Expedia numeric property ID — comparator only, never UI. */
  readonly expediaPropertyId: string | null;
  /** Hotels.com numeric hotel ID — comparator only, never UI. */
  readonly hotelsComHotelId: string | null;
  /** Agoda numeric hotel ID — comparator only, never UI. */
  readonly agodaHotelId: string | null;
  /** Wikipedia Commons category gallery URL — derived from `commonsCategory`. */
  readonly commonsGalleryUrl: string | null;
  /** TripAdvisor location URL — derived from `tripadvisorLocationId`. */
  readonly tripadvisorUrl: string | null;
  /**
   * Social and press links surfaced as JSON-LD `sameAs[]`. Already
   * filtered to HTTPS-only entries and limited to known platforms
   * ({@link KNOWN_SAMEAS_KEYS}). Any other key in the DB is silently
   * dropped at the reader so a typo never leaks to a public payload.
   */
  readonly sameAs: readonly string[];
  /**
   * Knowledge-graph facts extracted from Wikidata (`external_sameas`
   * blob): inception year, architect names, heritage designations,
   * Mérimée ID, Google Maps CID. Surfaces in the press kit + sidebar.
   */
  readonly knowledgeGraph: {
    readonly inceptionYear: number | null;
    readonly architects: readonly string[];
    readonly heritageDesignations: readonly string[];
    readonly merimeeId: string | null;
    readonly googleMapsCid: string | null;
  };
}

const EXT_HTTPS_URL_REGEX = /^https:\/\/[^\s<>]+$/iu;
const EXT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const QID_REGEX = /^Q[1-9][0-9]*$/u;
const NUMERIC_ID_REGEX = /^[0-9]+$/u;
const SLUG_ID_REGEX = /^[a-z0-9-]+$/u;

/** Whitelisted `sameAs` platforms (skill: security-engineering — no
 *  open redirect via arbitrary external_sameas keys). Order matters:
 *  the JSON-LD builder emits the array in this order so Wikidata /
 *  Wikipedia (the strongest authority signals) lead. */
const KNOWN_SAMEAS_KEYS = [
  'twitter',
  'instagram',
  'facebook',
  'youtube',
  'linkedin',
  'pinterest',
  'tiktok',
  'michelin',
  'tablet',
  'lhw',
  'virtuoso',
  'forbes',
  'condenast',
] as const;

function takeStringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function safeHttps(v: unknown): string | null {
  const s = takeStringOrNull(v);
  if (s === null) return null;
  return EXT_HTTPS_URL_REGEX.test(s) ? s : null;
}

export function readExternalIds(row: HotelDetailRow): HotelExternalIds {
  const wikidataRaw = takeStringOrNull(row.wikidata_id);
  const wikidataId = wikidataRaw !== null && QID_REGEX.test(wikidataRaw) ? wikidataRaw : null;

  const wikipediaUrlFr = safeHttps(row.wikipedia_url_fr);
  const wikipediaUrlEn = safeHttps(row.wikipedia_url_en);
  const officialUrl = safeHttps(row.official_url);

  const emailRaw = takeStringOrNull(row.email_reservations);
  const emailReservations = emailRaw !== null && EXT_EMAIL_REGEX.test(emailRaw) ? emailRaw : null;

  const commonsCategory = takeStringOrNull(row.commons_category);
  const commonsGalleryUrl =
    commonsCategory !== null
      ? `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(commonsCategory).replace(/%20/g, '_')}`
      : null;

  const tripadvisorRaw = takeStringOrNull(row.tripadvisor_location_id);
  const tripadvisorLocationId =
    tripadvisorRaw !== null && NUMERIC_ID_REGEX.test(tripadvisorRaw) ? tripadvisorRaw : null;
  const tripadvisorUrl =
    tripadvisorLocationId !== null
      ? `https://www.tripadvisor.com/Hotel_Review-d${tripadvisorLocationId}`
      : null;

  const bookingRaw = takeStringOrNull(row.booking_com_hotel_id);
  const bookingComHotelId =
    bookingRaw !== null && SLUG_ID_REGEX.test(bookingRaw) ? bookingRaw : null;
  const expediaRaw = takeStringOrNull(row.expedia_property_id);
  const expediaPropertyId =
    expediaRaw !== null && NUMERIC_ID_REGEX.test(expediaRaw) ? expediaRaw : null;
  const hotelsComRaw = takeStringOrNull(row.hotels_com_hotel_id);
  const hotelsComHotelId =
    hotelsComRaw !== null && NUMERIC_ID_REGEX.test(hotelsComRaw) ? hotelsComRaw : null;
  const agodaRaw = takeStringOrNull(row.agoda_hotel_id);
  const agodaHotelId = agodaRaw !== null && NUMERIC_ID_REGEX.test(agodaRaw) ? agodaRaw : null;

  // ── Knowledge-graph + sameAs blob ──────────────────────────────────────
  const sameAsList: string[] = [];
  if (wikidataId !== null) sameAsList.push(`https://www.wikidata.org/wiki/${wikidataId}`);
  if (wikipediaUrlFr !== null) sameAsList.push(wikipediaUrlFr);
  if (wikipediaUrlEn !== null) sameAsList.push(wikipediaUrlEn);
  if (officialUrl !== null) sameAsList.push(officialUrl);

  let inceptionYear: number | null = null;
  const architects: string[] = [];
  const heritageDesignations: string[] = [];
  let merimeeId: string | null = null;
  let googleMapsCid: string | null = null;

  const blob = row.external_sameas;
  if (blob !== null && blob !== undefined && typeof blob === 'object' && !Array.isArray(blob)) {
    const dict = blob as Record<string, unknown>;
    for (const key of KNOWN_SAMEAS_KEYS) {
      const u = safeHttps(dict[key]);
      if (u !== null) sameAsList.push(u);
    }
    const yr = dict['inception_year'];
    if (typeof yr === 'number' && Number.isFinite(yr) && yr >= 1500 && yr <= 2100) {
      inceptionYear = Math.trunc(yr);
    }
    const archs = dict['architects'];
    if (Array.isArray(archs)) {
      for (const a of archs) {
        const s = takeStringOrNull(a);
        if (s !== null && architects.length < 6) architects.push(s);
      }
    }
    const heritages = dict['heritage_designations'];
    if (Array.isArray(heritages)) {
      for (const h of heritages) {
        const s = takeStringOrNull(h);
        if (s !== null && heritageDesignations.length < 4) heritageDesignations.push(s);
      }
    }
    const merimee = takeStringOrNull(dict['merimee_id']);
    if (merimee !== null) merimeeId = merimee;
    const cid = takeStringOrNull(dict['google_maps_cid']);
    if (cid !== null && NUMERIC_ID_REGEX.test(cid)) googleMapsCid = cid;
  }

  if (tripadvisorUrl !== null) sameAsList.push(tripadvisorUrl);
  if (commonsGalleryUrl !== null) sameAsList.push(commonsGalleryUrl);
  if (merimeeId !== null) {
    sameAsList.push(`https://www.pop.culture.gouv.fr/notice/merimee/${merimeeId}`);
  }
  if (googleMapsCid !== null) {
    sameAsList.push(`https://maps.google.com/?cid=${googleMapsCid}`);
  }

  // De-dupe (some hotels have official_url == wikipedia_url_fr for chains)
  const sameAs = [...new Set(sameAsList)];

  return {
    wikidataId,
    wikipediaUrlFr,
    wikipediaUrlEn,
    officialUrl,
    emailReservations,
    commonsCategory,
    tripadvisorLocationId,
    bookingComHotelId,
    expediaPropertyId,
    hotelsComHotelId,
    agodaHotelId,
    commonsGalleryUrl,
    tripadvisorUrl,
    sameAs,
    knowledgeGraph: {
      inceptionYear,
      architects,
      heritageDesignations,
      merimeeId,
      googleMapsCid,
    },
  };
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
 * Virtual / 360° tour URL (Phase 11.4 — CDC §2 bloc 2 polish).
 *
 * The DB CHECK constraint in migration `0023_hotel_virtual_tour.sql`
 * already restricts the host to `my.matterport.com` or `kuula.co` and
 * enforces a 512-char ceiling. We re-validate at read time as a
 * belt-and-braces guard against:
 *
 *   - rows written before the CHECK constraint existed,
 *   - rows imported via direct UPSERTs that bypass the trigger (the
 *     constraint catches those, but defensive parsing keeps the page
 *     working even when a corrupt row sneaks past),
 *   - Cypress / E2E fixtures that intentionally inject bad data to
 *     exercise the fallback path.
 *
 * The set of allowed hosts MUST stay in lockstep with the CSP
 * `frame-src` allowlist in `apps/web/src/lib/security/csp.ts` and the
 * SQL CHECK regex — three places, one truth: "Matterport + Kuula".
 *
 * Returns `null` on any mismatch (rather than throwing) so a single
 * malformed editorial entry never tanks the route.
 */
export type VirtualTourProvider = 'matterport' | 'kuula';

export interface HotelVirtualTour {
  readonly url: string;
  readonly provider: VirtualTourProvider;
}

const ALLOWED_VIRTUAL_TOUR_HOSTS: Readonly<Record<string, VirtualTourProvider>> = {
  'my.matterport.com': 'matterport',
  'kuula.co': 'kuula',
};

export function readVirtualTour(row: HotelDetailRow): HotelVirtualTour | null {
  if (row.virtual_tour_url === null) return null;
  const raw = row.virtual_tour_url.trim();
  if (raw.length === 0 || raw.length > 512) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  // Disallow user-info or non-default ports — both can be used to
  // smuggle a malicious endpoint into an otherwise-trusted host.
  if (url.username.length > 0 || url.password.length > 0) return null;
  if (url.port.length > 0 && url.port !== '443') return null;
  const provider = ALLOWED_VIRTUAL_TOUR_HOSTS[url.hostname];
  if (provider === undefined) return null;
  return { url: url.toString(), provider };
}

// ---------------------------------------------------------------------------
// MICE — Meetings, Incentives, Conferences, Events (Phase 11.5 — CDC §2.14)
// ---------------------------------------------------------------------------

/**
 * Stable identifier grammar for a MICE space — lowercase kebab,
 * 2-48 chars. Used as React key and as anchor when a brochure
 * deep-links into a single space.
 */
const MICE_SPACE_KEY_REGEX = /^[a-z][a-z0-9-]{1,47}$/;

/**
 * Standard event-space layout terms recognised by the industry
 * (UFI / ICCA classifications). Editorial entries outside this set
 * are dropped at parse time rather than rendered as raw strings
 * because UI uses the discriminator to pick an icon / localisation.
 */
export const MICE_CONFIGURATIONS = [
  'theatre',
  'classroom',
  'u-shape',
  'boardroom',
  'banquet',
  'cocktail',
] as const;
export type MiceConfiguration = (typeof MICE_CONFIGURATIONS)[number];
const MiceConfigurationSchema = z.enum(MICE_CONFIGURATIONS);

/**
 * Event types a property hosts. The set is intentionally narrow
 * (six values) — wider taxonomies fragment the UI without giving
 * planners any extra signal, and the seeds collapse 95 % of
 * editorial intent onto these six.
 */
export const MICE_EVENT_TYPES = [
  'corporate-meeting',
  'wedding',
  'gala-dinner',
  'press-launch',
  'incentive',
  'private-screening',
] as const;
export type MiceEventType = (typeof MICE_EVENT_TYPES)[number];
const MiceEventTypeSchema = z.enum(MICE_EVENT_TYPES);

/**
 * Loose RFC-5322-ish e-mail validator. Mirrors the contract enforced
 * by the rest of the codebase (Brevo + Supabase Auth both validate
 * server-side too); we keep the regex permissive to avoid bouncing
 * editorial entries with legitimate `+aliases` or sub-domain MX.
 */
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const EmailSchema = z.string().max(254).regex(EMAIL_REGEX, { message: 'invalid e-mail' });

/**
 * HTTPS-only URL with a 2048-char ceiling — reused from the spirit
 * of the awards / featured-reviews validators below. Bounded length
 * prevents stuffed tracking garbage from leaking into the brochure
 * link.
 */
const HttpsBrochureUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith('https://'), { message: 'brochure url must be https' });

const MiceSpaceSchema = z.object({
  key: z.string().regex(MICE_SPACE_KEY_REGEX, { message: 'expected lowercase kebab key' }),
  name: z.string().min(1).max(120),
  surface_sqm: z.number().int().positive().max(50000),
  max_seated: z.number().int().positive().max(10000),
  configurations: z.array(MiceConfigurationSchema).min(1).optional(),
  has_natural_light: z.boolean().optional(),
  notes_fr: z.string().min(1).max(400).optional(),
  notes_en: z.string().min(1).max(400).optional(),
});

const MiceInfoSchema = z.object({
  summary_fr: z.string().min(1).max(400).optional(),
  summary_en: z.string().min(1).max(400).optional(),
  contact_email: EmailSchema,
  brochure_url: HttpsBrochureUrlSchema.optional(),
  total_capacity_seated: z.number().int().positive().max(10000),
  max_room_height_m: z.number().positive().max(50).optional(),
  spaces: z.array(MiceSpaceSchema).min(1).max(40),
  event_types: z.array(MiceEventTypeSchema).min(1).max(10).optional(),
});

export interface LocalisedMiceSpace {
  readonly key: string;
  readonly name: string;
  readonly surfaceSqm: number;
  readonly maxSeated: number;
  readonly configurations: readonly MiceConfiguration[];
  readonly hasNaturalLight: boolean;
  readonly notes: string | null;
}

export interface LocalisedMiceInfo {
  readonly summary: string | null;
  readonly contactEmail: string;
  readonly brochureUrl: string | null;
  readonly totalCapacitySeated: number;
  readonly maxRoomHeightM: number | null;
  readonly spaces: readonly LocalisedMiceSpace[];
  readonly eventTypes: readonly MiceEventType[];
}

/**
 * Localized MICE offer for the hotel detail page (CDC §2.14).
 *
 * Returns `null` whenever the raw payload fails the Zod schema —
 * any single malformed entry (e.g. negative `max_seated`, wrong
 * email shape) drops the whole offer rather than partially-render
 * a misleading section. Editorial errors land as a missing section
 * which the UI self-elides.
 *
 * The shape is mirrored 1:1 in the Payload admin field
 * (`apps/admin/src/collections/hotels.ts`) so the editorial JSON
 * input matches what the page expects.
 */
export function readMiceInfo(
  row: HotelDetailRow,
  locale: SupportedLocale,
): LocalisedMiceInfo | null {
  const parsed = MiceInfoSchema.safeParse(row.mice_info);
  if (!parsed.success) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[readMiceInfo] parse error', parsed.error.flatten().fieldErrors);
    }
    return null;
  }
  const p = parsed.data;

  const pickFr = (fr: string | undefined, en: string | undefined): string | null =>
    (locale === 'fr' ? (fr ?? en) : (en ?? fr)) ?? null;

  return {
    summary: pickFr(p.summary_fr, p.summary_en),
    contactEmail: p.contact_email,
    brochureUrl: p.brochure_url ?? null,
    totalCapacitySeated: p.total_capacity_seated,
    maxRoomHeightM: p.max_room_height_m ?? null,
    spaces: p.spaces.map((s) => ({
      key: s.key,
      name: s.name,
      surfaceSqm: s.surface_sqm,
      maxSeated: s.max_seated,
      configurations: s.configurations ?? [],
      hasNaturalLight: s.has_natural_light === true,
      notes: pickFr(s.notes_fr, s.notes_en),
    })),
    eventTypes: p.event_types ?? [],
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

    if (row.error || !row.data) {
      if (process.env['NODE_ENV'] !== 'production' && row.error) {
        // Surfaces PostgREST errors (missing columns, RLS denials, network
        // failures) at dev-time. Silent in production to keep logs clean.
        console.warn('[getHotelBySlug] no row', { slug, locale, error: row.error });
      }
      return null;
    }

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
 * Index-card row used by `/[locale]/hotels` (catalog landing).
 * Carries the visual + filter signals (`region`, `hero_image`, short
 * description) that `PublishedHotelSummary` deliberately omits to
 * keep the LLM corpus compact.
 */
export interface PublishedHotelIndexCard {
  readonly slugFr: string;
  readonly slugEn: string | null;
  readonly nameFr: string;
  readonly nameEn: string | null;
  readonly city: string;
  readonly region: string;
  readonly stars: number;
  readonly isPalace: boolean;
  readonly priority: 'P0' | 'P1' | 'P2';
  readonly heroPublicId: string | null;
  readonly descriptionFr: string | null;
  readonly descriptionEn: string | null;
}

const HotelIndexRowSchema = z.object({
  slug: z.string(),
  slug_en: stringOrEmpty,
  name: z.string(),
  name_en: stringOrEmpty,
  city: z.string(),
  region: z.string(),
  stars: z.number().int().min(1).max(5),
  is_palace: z.boolean(),
  priority: PrioritySchema,
  hero_image: stringOrEmpty,
  description_fr: stringOrEmpty,
  description_en: stringOrEmpty,
});

/**
 * Service-role read powering `/[locale]/hotels` and the `/categorie/*`
 * + `/destination/*` + `/marque/*` taxonomic landings. Ordered by
 * editorial `priority` then `name` so promoted properties always
 * surface above the fold.
 *
 * Capped at 200 — even the most aggressive scale plan stays under
 * that bound for the curated 5★/Palace catalogue.
 */
export async function listPublishedHotelsForIndex(
  limit = 200,
): Promise<readonly PublishedHotelIndexCard[]> {
  const safeLimit = Math.max(1, Math.min(500, limit));
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('hotels')
      .select(
        'slug, slug_en, name, name_en, city, region, stars, is_palace, priority, hero_image, description_fr, description_en',
      )
      .eq('is_published', true)
      .order('priority', { ascending: true })
      .order('name', { ascending: true })
      .limit(safeLimit);
    if (error || !Array.isArray(data)) return [];

    const out: PublishedHotelIndexCard[] = [];
    for (const raw of data) {
      const parsed = HotelIndexRowSchema.safeParse(raw);
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
        region: row.region,
        stars: row.stars,
        isPalace: row.is_palace,
        priority: row.priority,
        heroPublicId: row.hero_image,
        descriptionFr: row.description_fr,
        descriptionEn: row.description_en,
      });
    }
    return out;
  } catch {
    return [];
  }
}

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
