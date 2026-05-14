/**
 * DATAtourisme API client.
 *
 * Public REST API at https://api.datatourisme.fr/v1 with JSON-LD payloads.
 * Quotas: ~10 req/s, 1000 req/h, 20-30 concurrent.
 * Doc: https://api.datatourisme.fr/v1/docs
 *
 * Exposes three high-level functions:
 *   - findHotelByName(query)       : fuzzy text search, hotel-typed only
 *   - fetchHotelByUuid(uuid)       : full structured hotel record
 *   - fetchPOIsAround(lat, lon, …) : nearby relevant tourist POIs
 *
 * All responses are validated through Zod and returned as plain TS types.
 */

import { z } from 'zod';
import { loadEnv } from '../env.js';

// ─── Public types ──────────────────────────────────────────────────────────

export interface DtClassification {
  readonly isPalace: boolean;
  readonly stars: number | null;
}

export interface DtContact {
  readonly website: string | null;
  readonly phone: string | null;
  readonly email: string | null;
}

export interface DtLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly streetAddress: string;
  readonly postalCode: string;
  readonly city: string;
  readonly department: string;
  readonly region: string;
  readonly country: string;
}

export interface DtHotel {
  readonly uuid: string;
  readonly uri: string;
  readonly name: string;
  readonly types: readonly string[];
  readonly location: DtLocation;
  readonly contact: DtContact;
  readonly descriptionShort: string | null;
  readonly descriptionLong: string | null;
  readonly classification: DtClassification;
  readonly lastUpdate: string;
}

export interface DtPoi {
  readonly uuid: string;
  readonly name: string;
  readonly types: readonly string[];
  readonly category:
    | 'museum'
    | 'cultural'
    | 'park'
    | 'building'
    | 'restaurant'
    | 'religious'
    | 'theater'
    | 'other';
  readonly distanceMeters: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly descriptionShort: string | null;
}

// ─── Zod schemas (lenient — DATAtourisme returns variable shapes) ──────────

const Multilingual = z.union([
  z.string(),
  z.record(z.string(), z.union([z.string(), z.array(z.string())])),
]);

const StringOrStringArray = z.union([z.string(), z.array(z.string())]);

const AddressSchema = z
  .object({
    streetAddress: StringOrStringArray.optional(),
    postalCode: z.string().optional(),
    addressLocality: z.string().optional(),
    hasAddressCity: z
      .object({
        label: Multilingual.optional(),
        isPartOfDepartment: z
          .object({
            label: Multilingual.optional(),
            isPartOfRegion: z
              .object({
                label: Multilingual.optional(),
                isPartOfCountry: z.object({ label: Multilingual.optional() }).partial().optional(),
              })
              .partial()
              .optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

const IsLocatedAtSchema = z.object({
  geo: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  geoPoint: z.object({ lat: z.number(), lon: z.number() }).optional(),
  address: z.array(AddressSchema).optional(),
});

const HasContactSchema = z
  .object({
    homepage: StringOrStringArray.optional(),
    telephone: StringOrStringArray.optional(),
    email: StringOrStringArray.optional(),
  })
  .partial();

const HasDescriptionSchema = z
  .object({
    description: Multilingual.optional(),
    shortDescription: Multilingual.optional(),
  })
  .partial();

const HasReviewSchema = z
  .object({
    hasReviewValue: z
      .object({
        key: z.string().optional(),
        label: Multilingual.optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

const PoiObjectSchema = z
  .object({
    uuid: z.string(),
    uri: z.string().optional(),
    label: Multilingual.optional(),
    type: z.array(z.string()).optional(),
    isLocatedAt: z.array(IsLocatedAtSchema).optional(),
    hasContact: z.array(HasContactSchema).optional(),
    hasDescription: z.array(HasDescriptionSchema).optional(),
    hasReview: z.array(HasReviewSchema).optional(),
    lastUpdate: z.string().optional(),
  })
  .passthrough();

const CatalogResponseSchema = z.object({
  objects: z.array(PoiObjectSchema),
  meta: z.object({
    total: z.number(),
    page: z.number(),
    page_size: z.number(),
    total_pages: z.number(),
    next: z.string().nullable().optional(),
    previous: z.string().nullable().optional(),
  }),
});

type PoiObject = z.infer<typeof PoiObjectSchema>;

// ─── Helpers (multilingual / array normalisation) ──────────────────────────

function firstString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    for (const item of v) {
      const r = firstString(item);
      if (r !== null) return r;
    }
    return null;
  }
  return null;
}

function localized(v: unknown, prefer: 'fr' | 'en' = 'fr'): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    for (const item of v) {
      const r = localized(item, prefer);
      if (r !== null) return r;
    }
    return null;
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const candidates = [
      `@${prefer}`,
      prefer,
      prefer === 'fr' ? '@en' : '@fr',
      prefer === 'fr' ? 'en' : 'fr',
    ];
    for (const k of candidates) {
      if (typeof obj[k] === 'string') return obj[k] as string;
      if (Array.isArray(obj[k])) {
        const first = (obj[k] as unknown[])[0];
        if (typeof first === 'string') return first;
      }
    }
  }
  return null;
}

// ─── Low-level fetch ───────────────────────────────────────────────────────

const env = loadEnv();
const API_KEY = env.DATATOURISME_API_KEY;
const API_BASE = env.DATATOURISME_API_BASE;

function requireKey(): string {
  if (!API_KEY) {
    throw new Error(
      '[datatourisme] DATATOURISME_API_KEY is missing. Get one at https://info.datatourisme.fr/utiliser-les-donnees',
    );
  }
  return API_KEY;
}

async function dtFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const key = requireKey();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'X-API-Key': key, Accept: 'application/json' },
      });
      if (res.ok) return await res.json();
      // Retry on 429 / 5xx, fail fast otherwise
      if (res.status >= 500 || res.status === 429) {
        const body = await res.text();
        lastError = new Error(
          `DATAtourisme ${res.status} on ${url.pathname}: ${body.slice(0, 200)}`,
        );
        await sleep(500 * attempt);
        continue;
      }
      const body = await res.text();
      throw new Error(`DATAtourisme ${res.status} on ${url.pathname}: ${body.slice(0, 500)}`);
    } catch (e) {
      lastError = e as Error;
      if (attempt < 3) await sleep(500 * attempt);
    }
  }
  throw lastError ?? new Error('DATAtourisme: unknown error');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Public API ────────────────────────────────────────────────────────────

const HOTEL_TYPE_FILTER = 'type[in]=Hotel,HotelTrade,LodgingBusiness,Accommodation';

/**
 * Fuzzy search a hotel by name (text + Paris dept filter if dept provided).
 * Returns up to `limit` candidates sorted by name match heuristic.
 */
export async function findHotelByName(
  query: string,
  opts: { departmentInsee?: string; limit?: number } = {},
): Promise<readonly DtHotel[]> {
  const limit = opts.limit ?? 10;
  const filters: string[] = [HOTEL_TYPE_FILTER];
  if (opts.departmentInsee) {
    filters.push(
      `isLocatedAt.address.hasAddressCity.isPartOfDepartment.insee[eq]=${opts.departmentInsee}`,
    );
  }
  const raw = await dtFetch('/catalog', {
    search: `"${query}"`,
    filters: filters.join(' AND '),
    page_size: String(Math.min(limit * 2, 50)),
    lang: 'fr,en',
  });
  const parsed = CatalogResponseSchema.parse(raw);
  const hotels = parsed.objects.flatMap((o) => normalizeHotel(o) ?? []);
  // Heuristic: prefer exact substring match in name
  const ranked = hotels
    .map((h) => ({
      h,
      score: scoreNameMatch(h.name, query) + (h.classification.isPalace ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.h);
  return ranked.slice(0, limit);
}

/**
 * Paginated listing of every accommodation in a French département.
 * Used by `list-all-palaces.ts` to enumerate the full hotel catalog and
 * filter Palaces code-side, since DATAtourisme's review-URI filter syntax
 * for nested values is undocumented.
 */
export async function listHotelsInDepartment(
  departmentInsee: string,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<readonly DtHotel[]> {
  const pageSize = Math.min(opts.pageSize ?? 250, 250);
  const maxPages = opts.maxPages ?? 20;
  const filters = [
    HOTEL_TYPE_FILTER,
    `isLocatedAt.address.hasAddressCity.isPartOfDepartment.insee[eq]=${departmentInsee}`,
  ].join(' AND ');
  const all: DtHotel[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const raw = await dtFetch('/catalog', {
      filters,
      page_size: String(pageSize),
      page: String(page),
      lang: 'fr,en',
    });
    const parsed = CatalogResponseSchema.parse(raw);
    const hotels = parsed.objects.flatMap((o) => normalizeHotel(o) ?? []);
    all.push(...hotels);
    if (hotels.length < pageSize) break;
  }
  // Dedupe by UUID (paginated results occasionally repeat boundary items).
  const map = new Map<string, DtHotel>();
  for (const h of all) if (!map.has(h.uuid)) map.set(h.uuid, h);
  return [...map.values()];
}

export async function fetchHotelByUuid(uuid: string): Promise<DtHotel> {
  const fields = [
    'uuid',
    'uri',
    'label',
    'type',
    'isLocatedAt',
    'hasContact',
    'hasDescription',
    'hasReview',
    'lastUpdate',
  ].join(',');
  const raw = await dtFetch(`/catalog/${uuid}`, { fields, lang: 'fr,en' });
  const parsed = PoiObjectSchema.parse(raw);
  const hotel = normalizeHotel(parsed);
  if (!hotel) {
    throw new Error(
      `[datatourisme] fetchHotelByUuid(${uuid}): cannot normalize, missing critical fields`,
    );
  }
  return hotel;
}

/**
 * Fetch tourist POIs around a hotel. Returns a curated, deduplicated, ranked list.
 * Filtering policy:
 *   - exclude competing hotels / lodging
 *   - exclude pure stores / boutiques (too commercial, low editorial value)
 *   - prioritize: museum, cultural, building, park, religious, theater, gourmet restaurant
 *   - cap by category: max 2 museum, 1 gourmet restaurant, 1 park, 1 cultural, 1 building, …
 */
export async function fetchPOIsAround(
  latitude: number,
  longitude: number,
  opts: { radiusMeters?: number; excludeUuid?: string; limit?: number } = {},
): Promise<readonly DtPoi[]> {
  const radius = opts.radiusMeters ?? 800;
  const limit = opts.limit ?? 50;
  const filters: string[] = [];
  if (opts.excludeUuid) filters.push(`uuid[ne]=${opts.excludeUuid}`);
  const raw = await dtFetch('/catalog', {
    geo_distance: `${latitude},${longitude},${radius}m`,
    ...(filters.length > 0 ? { filters: filters.join(' AND ') } : {}),
    page_size: String(Math.min(limit, 250)),
    lang: 'fr,en',
  });
  const parsed = CatalogResponseSchema.parse(raw);
  const pois = parsed.objects.flatMap((o) => normalizePoi(o, latitude, longitude) ?? []);
  return curatePoiSelection(pois);
}

// ─── Normalization (PoiObject → DtHotel / DtPoi) ───────────────────────────

function normalizeHotel(o: PoiObject): DtHotel | null {
  const types = o.type ?? [];
  const isHotel = types.some((t) => /Hotel|Lodging|Accommodation/iu.test(t));
  if (!isHotel) return null;

  const name = localized(o.label);
  if (!name) return null;

  const loc = o.isLocatedAt?.[0];
  if (!loc) return null;

  const lat = loc.geo?.latitude ?? loc.geoPoint?.lat;
  const lon = loc.geo?.longitude ?? loc.geoPoint?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const addr = loc.address?.[0];
  const street = firstString(addr?.streetAddress) ?? '';
  const postal = addr?.postalCode ?? '';
  const city = addr?.addressLocality ?? localized(addr?.hasAddressCity?.label) ?? '';
  const department = localized(addr?.hasAddressCity?.isPartOfDepartment?.label) ?? '';
  const region = localized(addr?.hasAddressCity?.isPartOfDepartment?.isPartOfRegion?.label) ?? '';
  const country =
    localized(addr?.hasAddressCity?.isPartOfDepartment?.isPartOfRegion?.isPartOfCountry?.label) ??
    'France';

  const contact = o.hasContact?.[0];
  const website = firstString(contact?.homepage);
  const phone = firstString(contact?.telephone);
  const email = firstString(contact?.email);

  const descShort = localized(o.hasDescription?.[0]?.shortDescription);
  const descLong = localized(o.hasDescription?.[0]?.description);

  const reviews = o.hasReview ?? [];
  const isPalace = reviews.some((r) => r.hasReviewValue?.key === 'LabelRating_Palace');
  const stars = extractStars(reviews);

  return {
    uuid: o.uuid,
    uri: o.uri ?? '',
    name,
    types,
    location: {
      latitude: lat,
      longitude: lon,
      streetAddress: street,
      postalCode: postal,
      city,
      department,
      region,
      country,
    },
    contact: { website, phone, email },
    descriptionShort: descShort,
    descriptionLong: descLong,
    classification: { isPalace, stars },
    lastUpdate: o.lastUpdate ?? '',
  };
}

function extractStars(reviews: ReadonlyArray<z.infer<typeof HasReviewSchema>>): number | null {
  for (const r of reviews) {
    const key = r.hasReviewValue?.key;
    if (!key) continue;
    const m = /^ScaleRating_(\d)etoile/u.exec(key);
    if (m && m[1]) return Number(m[1]);
  }
  return null;
}

function normalizePoi(o: PoiObject, originLat: number, originLon: number): DtPoi | null {
  const name = localized(o.label);
  if (!name) return null;
  const loc = o.isLocatedAt?.[0];
  const lat = loc?.geo?.latitude ?? loc?.geoPoint?.lat;
  const lon = loc?.geo?.longitude ?? loc?.geoPoint?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const types = o.type ?? [];
  const category = classifyPoi(types);
  if (category === 'other') return null;

  const description = localized(o.hasDescription?.[0]?.shortDescription);
  const dist = haversineMeters(originLat, originLon, lat, lon);

  return {
    uuid: o.uuid,
    name,
    types,
    category,
    distanceMeters: Math.round(dist),
    latitude: lat,
    longitude: lon,
    descriptionShort: description,
  };
}

function classifyPoi(types: readonly string[]): DtPoi['category'] {
  // Exclusions: competing hotels, pure shopping, services
  const exclude = [
    'Hotel',
    'HotelTrade',
    'LodgingBusiness',
    'Accommodation',
    'Camping',
    'ShoppingCentreAndGallery',
  ];
  if (types.some((t) => exclude.includes(t))) {
    // Allow Restaurant even if also classified as FoodEstablishment
    if (!types.includes('Restaurant') && !types.includes('GourmetRestaurant')) return 'other';
  }
  if (types.includes('GourmetRestaurant')) return 'restaurant';
  if (types.includes('Museum')) return 'museum';
  if (types.includes('Park') || types.includes('ParkAndGarden')) return 'park';
  if (types.includes('RemarkableBuilding')) return 'building';
  if (types.includes('ReligiousSite')) return 'religious';
  if (types.includes('Theater')) return 'theater';
  if (types.includes('CulturalSite')) return 'cultural';
  if (types.includes('Restaurant')) return 'restaurant';
  return 'other';
}

/**
 * Cap-per-category curation: ensures a balanced editorial selection.
 * Returns at most 6 POIs sorted by category priority then distance.
 */
function curatePoiSelection(pois: readonly DtPoi[]): readonly DtPoi[] {
  const caps: Record<DtPoi['category'], number> = {
    museum: 2,
    cultural: 1,
    park: 1,
    building: 1,
    religious: 1,
    theater: 1,
    restaurant: 1,
    other: 0,
  };
  const priority: readonly DtPoi['category'][] = [
    'museum',
    'building',
    'cultural',
    'park',
    'religious',
    'theater',
    'restaurant',
  ];
  const byCategory = new Map<DtPoi['category'], DtPoi[]>();
  for (const p of pois) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }
  for (const arr of byCategory.values()) arr.sort((a, b) => a.distanceMeters - b.distanceMeters);

  const selected: DtPoi[] = [];
  for (const cat of priority) {
    const list = byCategory.get(cat) ?? [];
    const max = caps[cat];
    for (const p of list.slice(0, max)) selected.push(p);
  }
  return selected.slice(0, 6);
}

function scoreNameMatch(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 100;
  if (n.includes(q)) return 50;
  const qTokens = q.split(/\s+/u).filter((t) => t.length > 2);
  const matched = qTokens.filter((t) => n.includes(t)).length;
  return matched * 5;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
