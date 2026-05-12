import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type SupportedLocale = 'fr' | 'en';

/**
 * Slugify a French city/region name into a URL-safe ASCII slug.
 *
 * - lowercase
 * - decompose diacritics (NFD) then strip the combining marks
 * - replace any run of non-alphanumeric with a single `-`
 * - trim leading/trailing `-`
 *
 * Examples:
 *   `Paris`             → `paris`
 *   `Antibes`           → `antibes`
 *   `Aix-en-Provence`   → `aix-en-provence`
 *   `Saint-Tropez`      → `saint-tropez`
 *   `Île-Rousse`        → `ile-rousse`
 */
export function citySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const stringOrNull = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v : null));

const HotelGroupRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  slug_en: stringOrNull,
  name: z.string(),
  name_en: stringOrNull,
  city: z.string(),
  district: stringOrNull,
  region: z.string(),
  is_palace: z.boolean(),
  stars: z.number().int(),
  priority: z.enum(['P0', 'P1', 'P2']),
  description_fr: stringOrNull,
  description_en: stringOrNull,
  /** 8-char Amadeus property code — populated by the back-office for hotels eligible to sentiment enrichment. */
  amadeus_hotel_id: stringOrNull,
});

export type HotelGroupRow = z.infer<typeof HotelGroupRowSchema>;

const HOTELS_FOR_GROUPING_COLUMNS =
  'id, slug, slug_en, name, name_en, city, district, region, is_palace, stars, priority, description_fr, description_en, amadeus_hotel_id';

const PRIORITY_RANK: Record<HotelGroupRow['priority'], number> = { P0: 0, P1: 1, P2: 2 };

async function fetchAllPublished(): Promise<readonly HotelGroupRow[]> {
  // Both env-construction (build without secrets) and the network call may
  // throw; the destination pages tolerate an empty catalog so we coerce all
  // failure modes to `[]` here rather than scattering try/catch at every
  // call site.
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('hotels')
      .select(HOTELS_FOR_GROUPING_COLUMNS)
      .eq('is_published', true)
      .limit(2000);
    if (error || !Array.isArray(data)) return [];
    const out: HotelGroupRow[] = [];
    for (const raw of data) {
      const parsed = HotelGroupRowSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  } catch (e) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[destinations.cities] fetchAllPublished failed:', e);
    }
    return [];
  }
}

export interface CitySummary {
  readonly slug: string;
  readonly name: string;
  readonly region: string;
  readonly count: number;
  readonly hasPalace: boolean;
}

/**
 * Aggregates the published catalog into city groups. One row per distinct
 * `city` value (case-sensitive — the catalog is editor-curated so casing is
 * stable). Region is taken from the **first** hotel found, since a city
 * never spans regions in the French administrative division we use.
 */
export async function listPublishedCities(): Promise<readonly CitySummary[]> {
  const all = await fetchAllPublished();
  const map = new Map<
    string,
    { name: string; region: string; count: number; hasPalace: boolean }
  >();
  for (const h of all) {
    const slug = citySlug(h.city);
    if (slug.length === 0) continue;
    const existing = map.get(slug);
    if (existing === undefined) {
      map.set(slug, { name: h.city, region: h.region, count: 1, hasPalace: h.is_palace });
    } else {
      existing.count += 1;
      if (h.is_palace) existing.hasPalace = true;
    }
  }
  const out: CitySummary[] = [];
  for (const [slug, value] of map) {
    out.push({
      slug,
      name: value.name,
      region: value.region,
      count: value.count,
      hasPalace: value.hasPalace,
    });
  }
  out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
  return out;
}

export interface DestinationHotel {
  readonly id: string;
  readonly slug: string;
  readonly slugEn: string;
  readonly name: string;
  readonly district: string | null;
  readonly isPalace: boolean;
  readonly stars: number;
  readonly priority: HotelGroupRow['priority'];
  readonly excerpt: string;
  /** Surfaced by the destination hub so the page can batch-fetch sentiment ratings. */
  readonly amadeusHotelId: string | null;
}

export interface DestinationDetail {
  readonly slug: string;
  readonly name: string;
  readonly region: string;
  readonly hotels: readonly DestinationHotel[];
}

function pickName(row: HotelGroupRow, locale: SupportedLocale): string {
  if (locale === 'en') {
    const en = row.name_en;
    if (en !== null && en.length > 0) return en;
  }
  return row.name;
}

function pickSlugEn(row: HotelGroupRow): string {
  const en = row.slug_en;
  return en !== null && en.length > 0 ? en : row.slug;
}

function pickDescription(row: HotelGroupRow, locale: SupportedLocale): string {
  const primary = locale === 'fr' ? row.description_fr : row.description_en;
  const fallback = locale === 'fr' ? row.description_en : row.description_fr;
  const raw = (primary ?? fallback ?? '').trim();
  if (raw.length === 0) return '';
  const max = 180;
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).replace(/[\s,;.:!?-]+$/u, '')}…`;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidCitySlug(candidate: string): boolean {
  return SLUG_RE.test(candidate);
}

export async function getDestinationBySlug(
  slug: string,
  locale: SupportedLocale,
): Promise<DestinationDetail | null> {
  if (!isValidCitySlug(slug)) return null;

  const all = await fetchAllPublished();
  if (all.length === 0) return null;

  const matching = all.filter((h) => citySlug(h.city) === slug);
  const [first] = matching;
  if (first === undefined) return null;

  const cityName = first.city;
  const region = first.region;

  const sorted = [...matching].sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    if (a.is_palace !== b.is_palace) return a.is_palace ? -1 : 1;
    return pickName(a, locale).localeCompare(pickName(b, locale), locale);
  });

  const hotels: DestinationHotel[] = sorted.map((row) => ({
    id: row.id,
    slug: row.slug,
    slugEn: pickSlugEn(row),
    name: pickName(row, locale),
    district: row.district,
    isPalace: row.is_palace,
    stars: row.stars,
    priority: row.priority,
    excerpt: pickDescription(row, locale),
    amadeusHotelId: row.amadeus_hotel_id,
  }));

  return { slug, name: cityName, region, hotels };
}
