import 'server-only';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Editorial brand families surfaced as cross-link clusters. Detection
 * runs against the hotel name (case-insensitive). The order matters:
 * narrower needles win (e.g. `Cheval Blanc` before `Maison`).
 *
 * Each family produces a stable slug that powers `/marque/[slug]`.
 */
const BRAND_FAMILIES: readonly { slug: string; label: string; pattern: RegExp }[] = [
  { slug: 'cheval-blanc', label: 'Cheval Blanc', pattern: /cheval\s*blanc/iu },
  { slug: 'airelles', label: 'Airelles', pattern: /\bairelles\b/iu },
  { slug: 'four-seasons', label: 'Four Seasons', pattern: /four\s*seasons/iu },
  { slug: 'rosewood', label: 'Rosewood', pattern: /\brosewood\b/iu },
  { slug: 'raffles', label: 'Raffles', pattern: /\braffles\b/iu },
  { slug: 'peninsula', label: 'The Peninsula', pattern: /\bpeninsula\b/iu },
  { slug: 'mandarin-oriental', label: 'Mandarin Oriental', pattern: /mandarin\s*oriental/iu },
  { slug: 'shangri-la', label: 'Shangri-La', pattern: /shangri-?\s*la/iu },
  { slug: 'park-hyatt', label: 'Park Hyatt', pattern: /park\s*hyatt/iu },
  {
    slug: 'oetker-collection',
    label: 'Oetker Collection',
    pattern: /(le\s*bristol|hôtel\s*du\s*cap|fouquet's|lapog[ée]e|l'apog[ée]e)/iu,
  },
  {
    slug: 'dorchester-collection',
    label: 'Dorchester Collection',
    pattern: /(le\s*meurice|plaza\s*ath[ée]n[ée]e)/iu,
  },
  { slug: 'les-k2', label: 'Les K2 Collections', pattern: /\bk2\b/iu },
  { slug: 'caudalie', label: 'Caudalie', pattern: /caudalie/iu },
];

/**
 * Detects the editorial brand family for a hotel from its name.
 * Returns `null` when no family matches — independent properties
 * (Negresco, Lutetia, Crillon, Villa La Coste, etc.) stay un-clustered.
 */
export function detectBrand(name: string): { slug: string; label: string } | null {
  for (const f of BRAND_FAMILIES) {
    if (f.pattern.test(name)) return { slug: f.slug, label: f.label };
  }
  return null;
}

/** All known brand families — surfaced by the `/marque/[slug]` index. */
export const KNOWN_BRANDS = BRAND_FAMILIES.map((f) => ({ slug: f.slug, label: f.label }));

const RelatedHotelRowSchema = z.object({
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

export type RelatedHotelRow = z.infer<typeof RelatedHotelRowSchema>;

export interface RelatedHotelsBundle {
  /** Other Palaces in the same city, capped to 6. */
  readonly sameCity: readonly RelatedHotelRow[];
  /** Other Palaces of the same brand family (across cities), capped to 6. */
  readonly sameBrand: readonly RelatedHotelRow[];
  /** Brand label + slug when the family was detected. */
  readonly brand: { readonly slug: string; readonly label: string } | null;
  /** Other Palaces in the same region (excluding `sameCity`), capped to 6. */
  readonly sameRegion: readonly RelatedHotelRow[];
}

const RELATED_COLUMNS =
  'slug, slug_en, name, name_en, city, region, stars, is_palace, hero_image, description_fr, description_en';

/**
 * Fetches the related-hotels bundle for the maillage interne (skill:
 * seo-technical §Maillage). One query per cluster (city, region) plus
 * one in-memory brand filter — at most three Supabase round-trips,
 * cached implicitly by Next.js because the helper is called from a
 * Server Component on an ISR route.
 *
 * Self is always excluded.
 */
export async function getRelatedHotels(args: {
  readonly currentSlug: string;
  readonly city: string;
  readonly region: string;
  readonly name: string;
}): Promise<RelatedHotelsBundle> {
  const supabase = getSupabaseAdminClient();
  const brand = detectBrand(args.name);

  // 1. Same city — ordered by `priority` then `name` for stable output.
  const cityRes = await supabase
    .from('hotels')
    .select(RELATED_COLUMNS)
    .eq('is_published', true)
    .eq('city', args.city)
    .neq('slug', args.currentSlug)
    .order('priority', { ascending: true })
    .order('name', { ascending: true })
    .limit(6);

  // 2. Same region (excluding the current city to keep clusters distinct).
  const regionRes = await supabase
    .from('hotels')
    .select(RELATED_COLUMNS)
    .eq('is_published', true)
    .eq('region', args.region)
    .neq('city', args.city)
    .neq('slug', args.currentSlug)
    .order('priority', { ascending: true })
    .order('name', { ascending: true })
    .limit(6);

  // 3. Same brand — we don't have a `brand` column yet, so we widen the
  //    query to the published catalog and filter in memory. With 30
  //    rows this is fine; once we cross ~500 properties we'll add a
  //    `brand_slug` column + index.
  const sameBrand: RelatedHotelRow[] = [];
  if (brand !== null) {
    const brandRes = await supabase
      .from('hotels')
      .select(RELATED_COLUMNS)
      .eq('is_published', true)
      .neq('slug', args.currentSlug)
      .order('priority', { ascending: true })
      .order('name', { ascending: true })
      .limit(100);
    const data = brandRes.data ?? [];
    for (const row of data) {
      const parsed = RelatedHotelRowSchema.safeParse(row);
      if (!parsed.success) continue;
      const detected = detectBrand(parsed.data.name);
      if (detected !== null && detected.slug === brand.slug) {
        sameBrand.push(parsed.data);
        if (sameBrand.length >= 6) break;
      }
    }
  }

  const parseList = (raw: unknown): RelatedHotelRow[] => {
    if (!Array.isArray(raw)) return [];
    const out: RelatedHotelRow[] = [];
    for (const r of raw) {
      const p = RelatedHotelRowSchema.safeParse(r);
      if (p.success) out.push(p.data);
    }
    return out;
  };

  return {
    sameCity: parseList(cityRes.data),
    sameBrand,
    brand,
    sameRegion: parseList(regionRes.data),
  };
}
