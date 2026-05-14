/**
 * Wikidata client for hotel enrichment.
 *
 * Two-step protocol:
 *   1. `searchHotel(query)`  → list of Q-IDs (free-text matching via wbsearchentities)
 *   2. `fetchHotelByQid(qid)` → structured facts via SPARQL on query.wikidata.org
 *
 * Properties extracted (when present on the entity):
 *   P571  inception / opening date
 *   P84   architect
 *   P127  owned by
 *   P137  operator
 *   P361  part of (parent chain — e.g. Dorchester Collection)
 *   P1435 heritage designation
 *
 * Wikidata APIs are unauthenticated. We respect best-practice quotas
 * (< 1 req/s + custom User-Agent) and parse all responses through Zod.
 */

import { z } from 'zod';

const USER_AGENT =
  'ConciergeTravelEditorialPilot/0.1 (https://conciergetravel.fr; reservations@conciergetravel.fr)';
const WIKIDATA_SEARCH_BASE = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

// ─── Public types ──────────────────────────────────────────────────────────

export interface WdSearchResult {
  readonly qid: string;
  readonly label: string;
  readonly description: string | null;
}

export interface WdHotel {
  readonly qid: string;
  readonly label: string;
  readonly inception: { readonly year: number; readonly raw: string } | null;
  readonly architects: readonly string[];
  readonly owner: string | null;
  readonly operator: string | null;
  readonly partOf: string | null;
  readonly heritageDesignations: readonly string[];
  readonly wikipediaUrlFr: string | null;
  readonly wikipediaUrlEn: string | null;
}

/**
 * External identifiers and links pulled from Wikidata in a single
 * SPARQL — fed directly into `public.hotels` columns by the
 * `enrich-wikidata-ids.ts` script.
 *
 * Every field is independently optional; the caller writes only the
 * keys that came back non-null and validates the formats one more
 * time against the migration's CHECK constraints.
 */
export interface WdHotelExternalIds {
  readonly qid: string;
  readonly officialUrl: string | null;
  readonly telephone: string | null;
  readonly email: string | null;
  readonly commonsCategory: string | null;
  readonly tripadvisorId: string | null;
  readonly bookingComId: string | null;
  readonly googleMapsCid: string | null;
  readonly merimeeId: string | null;
  readonly inceptionYear: number | null;
  readonly architects: readonly string[];
  readonly heritageDesignations: readonly string[];
  readonly wikipediaUrlFr: string | null;
  readonly wikipediaUrlEn: string | null;
  readonly sameAs: Readonly<Record<string, string>>;
}

// ─── Search (wbsearchentities) ─────────────────────────────────────────────

const SearchEntitySchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
});

const SearchResponseSchema = z.object({
  search: z.array(SearchEntitySchema),
});

export async function searchHotel(
  query: string,
  opts: { lang?: 'fr' | 'en'; limit?: number } = {},
): Promise<readonly WdSearchResult[]> {
  const lang = opts.lang ?? 'fr';
  const limit = opts.limit ?? 8;
  const url = new URL(WIKIDATA_SEARCH_BASE);
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('search', query);
  url.searchParams.set('language', lang);
  url.searchParams.set('type', 'item');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Wikidata search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const raw = await res.json();
  const parsed = SearchResponseSchema.parse(raw);
  return parsed.search.map((e) => ({
    qid: e.id,
    label: e.label ?? '',
    description: e.description ?? null,
  }));
}

// ─── SPARQL details ────────────────────────────────────────────────────────

const SparqlBindingSchema = z
  .object({
    hotelLabel: z.object({ value: z.string() }).optional(),
    inception: z.object({ value: z.string() }).optional(),
    architectLabel: z.object({ value: z.string() }).optional(),
    ownerLabel: z.object({ value: z.string() }).optional(),
    operatorLabel: z.object({ value: z.string() }).optional(),
    partOfLabel: z.object({ value: z.string() }).optional(),
    heritageLabel: z.object({ value: z.string() }).optional(),
    wpUrlFr: z.object({ value: z.string() }).optional(),
    wpUrlEn: z.object({ value: z.string() }).optional(),
  })
  .passthrough();

const SparqlResponseSchema = z.object({
  results: z.object({ bindings: z.array(SparqlBindingSchema) }),
});

export async function fetchHotelByQid(qid: string): Promise<WdHotel> {
  const cleanQid = qid.trim();
  if (!/^Q\d+$/u.test(cleanQid)) {
    throw new Error(`Invalid QID: ${qid}`);
  }
  // Single query that returns all properties at once via OPTIONAL clauses;
  // each multi-valued property (architect, heritage) yields one row per value.
  const sparql = `
    SELECT ?hotelLabel ?inception
           ?architectLabel ?ownerLabel ?operatorLabel ?partOfLabel ?heritageLabel
           ?wpUrlFr ?wpUrlEn
    WHERE {
      BIND(wd:${cleanQid} AS ?hotel)
      OPTIONAL { ?hotel wdt:P571 ?inception. }
      OPTIONAL { ?hotel wdt:P84 ?architect. ?architect rdfs:label ?architectLabel. FILTER(LANG(?architectLabel) = "fr") }
      OPTIONAL { ?hotel wdt:P127 ?owner. ?owner rdfs:label ?ownerLabel. FILTER(LANG(?ownerLabel) IN ("fr","en")) }
      OPTIONAL { ?hotel wdt:P137 ?operator. ?operator rdfs:label ?operatorLabel. FILTER(LANG(?operatorLabel) IN ("fr","en")) }
      OPTIONAL { ?hotel wdt:P361 ?partOf. ?partOf rdfs:label ?partOfLabel. FILTER(LANG(?partOfLabel) IN ("fr","en")) }
      OPTIONAL { ?hotel wdt:P1435 ?heritage. ?heritage rdfs:label ?heritageLabel. FILTER(LANG(?heritageLabel) = "fr") }
      OPTIONAL { ?wpUrlFr schema:about ?hotel; schema:isPartOf <https://fr.wikipedia.org/>. }
      OPTIONAL { ?wpUrlEn schema:about ?hotel; schema:isPartOf <https://en.wikipedia.org/>. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
    }
    LIMIT 50
  `.trim();

  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set('query', sparql);
  url.searchParams.set('format', 'json');

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
    },
  });
  if (!res.ok) {
    throw new Error(
      `Wikidata SPARQL ${res.status} for ${cleanQid}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const raw = await res.json();
  const parsed = SparqlResponseSchema.parse(raw);
  const bindings = parsed.results.bindings;

  // Collect uniques across all rows
  const architects = new Set<string>();
  const heritageDesignations = new Set<string>();
  let label = '';
  let inception: WdHotel['inception'] = null;
  let owner: string | null = null;
  let operator: string | null = null;
  let partOf: string | null = null;
  let wpUrlFr: string | null = null;
  let wpUrlEn: string | null = null;

  for (const b of bindings) {
    if (b.hotelLabel?.value && !label) label = b.hotelLabel.value;
    if (b.inception?.value && !inception) {
      const raw = b.inception.value;
      const year = parseYear(raw);
      if (year !== null) inception = { year, raw };
    }
    if (b.architectLabel?.value) architects.add(b.architectLabel.value);
    if (b.heritageLabel?.value) heritageDesignations.add(b.heritageLabel.value);
    if (b.ownerLabel?.value && !owner) owner = b.ownerLabel.value;
    if (b.operatorLabel?.value && !operator) operator = b.operatorLabel.value;
    if (b.partOfLabel?.value && !partOf) partOf = b.partOfLabel.value;
    if (b.wpUrlFr?.value && !wpUrlFr) wpUrlFr = b.wpUrlFr.value;
    if (b.wpUrlEn?.value && !wpUrlEn) wpUrlEn = b.wpUrlEn.value;
  }

  return {
    qid: cleanQid,
    label,
    inception,
    architects: [...architects],
    owner,
    operator,
    partOf,
    heritageDesignations: [...heritageDesignations],
    wikipediaUrlFr: wpUrlFr,
    wikipediaUrlEn: wpUrlEn,
  };
}

/**
 * Lightweight coordinate fetch for a Wikidata entity. Used by the
 * matcher's geographic-sanity check (rejects candidates more than
 * `maxKm` from the editorial fiche coordinates).
 *
 * Returns `null` when the entity has no P625 (point in geographic
 * coordinates) — common for chains or recent properties.
 */
export async function fetchWikidataCoordinates(
  qid: string,
): Promise<{ readonly lat: number; readonly lng: number } | null> {
  const cleanQid = qid.trim();
  if (!/^Q\d+$/u.test(cleanQid)) return null;
  const sparql = `
    SELECT ?coord WHERE { wd:${cleanQid} wdt:P625 ?coord. } LIMIT 1
  `.trim();
  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set('query', sparql);
  url.searchParams.set('format', 'json');
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
    });
    if (!res.ok) return null;
    const raw = await res.json();
    // SPARQL coord literal looks like "Point(2.3522 48.8566)" (lng lat order)
    const bindings = (raw as { results?: { bindings?: Array<{ coord?: { value?: string } }> } })
      .results?.bindings;
    const value = bindings?.[0]?.coord?.value;
    if (typeof value !== 'string') return null;
    const m = /^Point\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)$/u.exec(value);
    if (m === null || m[1] === undefined || m[2] === undefined) return null;
    return { lng: Number(m[1]), lat: Number(m[2]) };
  } catch {
    return null;
  }
}

/** Haversine distance in km. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const c = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(c));
}

/**
 * Convenience: search then fetch top match if confident.
 * Returns null if no candidate looks like an architectural/hotel entity.
 */
export async function findHotel(query: string): Promise<WdHotel | null> {
  const results = await searchHotel(query, { lang: 'fr', limit: 5 });
  if (results.length === 0) return null;
  // Score candidates by description keyword match (hôtel, palace, hotel)
  const scored = results
    .map((r) => ({
      r,
      score:
        (r.description && /h[oô]tel|palace|h[ée]bergement/iu.test(r.description) ? 10 : 0) +
        (r.label.toLowerCase().includes(query.toLowerCase()) ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 5) return null;
  return await fetchHotelByQid(best.r.qid);
}

function parseYear(rawDate: string): number | null {
  // SPARQL returns ISO-like dates "1913-01-01T00:00:00Z" or partial "1913-00-00T00:00:00Z"
  const m = /^([+-]?\d{1,4})-/u.exec(rawDate);
  if (!m || !m[1]) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1000 || y > 2100) return null;
  return y;
}

// ─── External IDs cascade ──────────────────────────────────────────────────

const ExtBindingSchema = z
  .object({
    officialUrl: z.object({ value: z.string() }).optional(),
    telephone: z.object({ value: z.string() }).optional(),
    email: z.object({ value: z.string() }).optional(),
    commonsCat: z.object({ value: z.string() }).optional(),
    tripadvisorId: z.object({ value: z.string() }).optional(),
    bookingId: z.object({ value: z.string() }).optional(),
    googleCid: z.object({ value: z.string() }).optional(),
    merimeeId: z.object({ value: z.string() }).optional(),
    inception: z.object({ value: z.string() }).optional(),
    architectLabel: z.object({ value: z.string() }).optional(),
    heritageLabel: z.object({ value: z.string() }).optional(),
    wpUrlFr: z.object({ value: z.string() }).optional(),
    wpUrlEn: z.object({ value: z.string() }).optional(),
    twitter: z.object({ value: z.string() }).optional(),
    instagram: z.object({ value: z.string() }).optional(),
    facebook: z.object({ value: z.string() }).optional(),
    youtube: z.object({ value: z.string() }).optional(),
    linkedin: z.object({ value: z.string() }).optional(),
  })
  .passthrough();

const ExtResponseSchema = z.object({
  results: z.object({ bindings: z.array(ExtBindingSchema) }),
});

/**
 * Pulls every external identifier and contact link Wikidata knows about
 * a hotel entity. One SPARQL, ~150 ms typical latency.
 *
 * Wikidata properties used:
 *   P856   official website
 *   P1329  telephone
 *   P968   email
 *   P373   Commons category
 *   P3134  TripAdvisor location ID
 *   P5800  Booking.com hotel ID
 *   P10086 Google Maps CID
 *   P380   Mérimée ID (French historic monuments registry)
 *   P571   inception
 *   P84    architect
 *   P1435  heritage designation
 *   P2002  Twitter handle
 *   P2003  Instagram username
 *   P2013  Facebook page ID
 *   P2397  YouTube channel ID
 *   P6634  LinkedIn company ID
 */
export async function fetchHotelExternalIds(qid: string): Promise<WdHotelExternalIds> {
  const cleanQid = qid.trim();
  if (!/^Q\d+$/u.test(cleanQid)) {
    throw new Error(`Invalid QID: ${qid}`);
  }
  const sparql = `
    SELECT ?officialUrl ?telephone ?email ?commonsCat
           ?tripadvisorId ?bookingId ?googleCid ?merimeeId
           ?inception ?architectLabel ?heritageLabel
           ?wpUrlFr ?wpUrlEn
           ?twitter ?instagram ?facebook ?youtube ?linkedin
    WHERE {
      BIND(wd:${cleanQid} AS ?hotel)
      OPTIONAL { ?hotel wdt:P856  ?officialUrl. }
      OPTIONAL { ?hotel wdt:P1329 ?telephone. }
      OPTIONAL { ?hotel wdt:P968  ?email. }
      OPTIONAL { ?hotel wdt:P373  ?commonsCat. }
      OPTIONAL { ?hotel wdt:P3134 ?tripadvisorId. }
      OPTIONAL { ?hotel wdt:P5800 ?bookingId. }
      OPTIONAL { ?hotel wdt:P10086 ?googleCid. }
      OPTIONAL { ?hotel wdt:P380  ?merimeeId. }
      OPTIONAL { ?hotel wdt:P571  ?inception. }
      OPTIONAL { ?hotel wdt:P84   ?architect. ?architect rdfs:label ?architectLabel. FILTER(LANG(?architectLabel) IN ("fr","en")) }
      OPTIONAL { ?hotel wdt:P1435 ?heritage. ?heritage rdfs:label ?heritageLabel. FILTER(LANG(?heritageLabel) = "fr") }
      OPTIONAL { ?wpUrlFr schema:about ?hotel; schema:isPartOf <https://fr.wikipedia.org/>. }
      OPTIONAL { ?wpUrlEn schema:about ?hotel; schema:isPartOf <https://en.wikipedia.org/>. }
      OPTIONAL { ?hotel wdt:P2002 ?twitter. }
      OPTIONAL { ?hotel wdt:P2003 ?instagram. }
      OPTIONAL { ?hotel wdt:P2013 ?facebook. }
      OPTIONAL { ?hotel wdt:P2397 ?youtube. }
      OPTIONAL { ?hotel wdt:P6634 ?linkedin. }
    }
    LIMIT 200
  `.trim();

  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set('query', sparql);
  url.searchParams.set('format', 'json');

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) {
    throw new Error(
      `Wikidata SPARQL ext ${res.status} for ${cleanQid}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const parsed = ExtResponseSchema.parse(await res.json());
  const bindings = parsed.results.bindings;

  const architectsSet = new Set<string>();
  const heritageSet = new Set<string>();
  let officialUrl: string | null = null;
  let telephone: string | null = null;
  let email: string | null = null;
  let commonsCategory: string | null = null;
  let tripadvisorId: string | null = null;
  let bookingComId: string | null = null;
  let googleMapsCid: string | null = null;
  let merimeeId: string | null = null;
  let inceptionYear: number | null = null;
  let wikipediaUrlFr: string | null = null;
  let wikipediaUrlEn: string | null = null;
  let twitter: string | null = null;
  let instagram: string | null = null;
  let facebook: string | null = null;
  let youtube: string | null = null;
  let linkedin: string | null = null;

  for (const b of bindings) {
    if (b.officialUrl?.value && !officialUrl) officialUrl = b.officialUrl.value;
    if (b.telephone?.value && !telephone) telephone = b.telephone.value;
    if (b.email?.value && !email) email = b.email.value.replace(/^mailto:/u, '');
    if (b.commonsCat?.value && !commonsCategory) commonsCategory = b.commonsCat.value;
    if (b.tripadvisorId?.value && !tripadvisorId) tripadvisorId = b.tripadvisorId.value;
    if (b.bookingId?.value && !bookingComId) bookingComId = b.bookingId.value;
    if (b.googleCid?.value && !googleMapsCid) googleMapsCid = b.googleCid.value;
    if (b.merimeeId?.value && !merimeeId) merimeeId = b.merimeeId.value;
    if (b.inception?.value && inceptionYear === null) {
      inceptionYear = parseYear(b.inception.value);
    }
    if (b.architectLabel?.value) architectsSet.add(b.architectLabel.value);
    if (b.heritageLabel?.value) heritageSet.add(b.heritageLabel.value);
    if (b.wpUrlFr?.value && !wikipediaUrlFr) wikipediaUrlFr = b.wpUrlFr.value;
    if (b.wpUrlEn?.value && !wikipediaUrlEn) wikipediaUrlEn = b.wpUrlEn.value;
    if (b.twitter?.value && !twitter) twitter = b.twitter.value;
    if (b.instagram?.value && !instagram) instagram = b.instagram.value;
    if (b.facebook?.value && !facebook) facebook = b.facebook.value;
    if (b.youtube?.value && !youtube) youtube = b.youtube.value;
    if (b.linkedin?.value && !linkedin) linkedin = b.linkedin.value;
  }

  const sameAs: Record<string, string> = {};
  if (twitter !== null) sameAs['twitter'] = `https://twitter.com/${twitter}`;
  if (instagram !== null) sameAs['instagram'] = `https://www.instagram.com/${instagram}/`;
  if (facebook !== null) sameAs['facebook'] = `https://www.facebook.com/${facebook}`;
  if (youtube !== null) sameAs['youtube'] = `https://www.youtube.com/channel/${youtube}`;
  if (linkedin !== null) sameAs['linkedin'] = `https://www.linkedin.com/company/${linkedin}/`;

  return {
    qid: cleanQid,
    officialUrl,
    telephone,
    email,
    commonsCategory,
    tripadvisorId,
    bookingComId,
    googleMapsCid,
    merimeeId,
    inceptionYear,
    architects: [...architectsSet],
    heritageDesignations: [...heritageSet],
    wikipediaUrlFr,
    wikipediaUrlEn,
    sameAs,
  };
}
