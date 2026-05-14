/**
 * dining-extractor.ts — Tavily-driven extraction of restaurants / bars / chefs / Michelin stars.
 *
 * Two-stage strategy:
 *   A) Michelin first — `site:guide.michelin.com {hotel}` advanced search.
 *      Michelin pages are very clean and contain the canonical truth for
 *      stars / cuisine / chef when present.
 *   B) Official site fallback — `site:{officialDomain} restaurant OR bar OR dining`
 *      to catch outlets that are not (yet) in the Michelin guide.
 *
 * Outputs:
 *   - One `DiningOutlet` per restaurant/bar found.
 *   - Each outlet keeps its evidence quote + source URL so the brief-builder
 *     can populate `external_source_facts[]` (verified verbatim).
 *
 * Anti-hallucination strategy:
 *   - LLM is instructed to return null when a field isn't explicitly stated.
 *   - Outlets with no name OR no source URL are dropped (cannot attribute).
 */

import { z } from 'zod';
import { tavilySearchAndExtract } from './tavily-client.js';
import { llmExtract } from './llm-extract.js';

// ─── Public types ──────────────────────────────────────────────────────────

export interface DiningOutlet {
  readonly name: string;
  readonly type: 'restaurant' | 'bar' | 'brasserie' | 'tea_room' | 'lounge' | 'other';
  readonly chef: string | null;
  readonly michelinStars: number | null;
  readonly cuisine: string | null;
  readonly priceCategory: '€' | '€€' | '€€€' | '€€€€' | null;
  readonly signature: string | null;
  readonly evidenceQuote: string;
  readonly sourceUrl: string;
}

export interface DiningExtractionResult {
  readonly outlets: readonly DiningOutlet[];
  readonly extractedSources: ReadonlyArray<{ url: string; rawMarkdown: string }>;
  readonly searchCount: number;
  readonly extractCount: number;
}

// ─── Zod (LLM output) ──────────────────────────────────────────────────────

const OutletZ = z.object({
  name: z.string().nullable(),
  type: z.enum(['restaurant', 'bar', 'brasserie', 'tea_room', 'lounge', 'other']).nullable(),
  chef: z.string().nullable(),
  michelin_stars: z.number().int().min(0).max(3).nullable(),
  cuisine: z.string().nullable(),
  price_category: z.enum(['€', '€€', '€€€', '€€€€']).nullable(),
  signature: z.string().nullable(),
  evidence_quote: z.string().nullable(),
});

const ExtractionZ = z.object({
  outlets: z.array(OutletZ).default([]),
});

const SCHEMA_DESCRIPTION = `
{
  "outlets": [                     // array of dining outlets PHYSICALLY LOCATED INSIDE this specific hotel
    {
      "name": string|null,         // exact name as in source, e.g. "Le Relais Plaza"
      "type": "restaurant"|"bar"|"brasserie"|"tea_room"|"lounge"|"other"|null,
      "chef": string|null,         // executive / head chef of THIS outlet, e.g. "Jean Imbert"
      "michelin_stars": 0|1|2|3|null, // 0 if listed by Michelin without a star, null if not mentioned
      "cuisine": string|null,      // e.g. "Classic Cuisine", "Mediterranean", "French haute cuisine"
      "price_category": "€"|"€€"|"€€€"|"€€€€"|null,
      "signature": string|null,    // one signature dish or feature literally mentioned (verbatim phrase, max 200 chars)
      "evidence_quote": string|null  // 1-2 sentences from the source backing the entry (verbatim)
    }
  ]
}

STRICT INCLUSION RULES — read carefully:
1. ONLY include outlets whose page or paragraph EXPLICITLY says they are AT, INSIDE, or PART OF the target hotel.
2. NEVER include the hotel itself as an outlet. Skip entries whose name matches or is a sub-string of the hotel name.
3. NEVER include restaurants of other hotels just because the source is a general Paris dining article.
   If the source content mentions multiple hotels and you're not 100% sure an outlet belongs to the target hotel → exclude it.
4. NEVER include outlets without a name (no "Restaurant of the Hotel" generic entries).
5. If in doubt about whether an outlet is at the target hotel → return an empty outlets array.
`;

// ─── Public API ────────────────────────────────────────────────────────────

export interface DiningExtractorInput {
  readonly hotelName: string;
  readonly city: string;
  /** Official site host, e.g. "dorchestercollection.com" (no scheme, no path). */
  readonly officialDomain: string | null;
}

export async function extractDining(input: DiningExtractorInput): Promise<DiningExtractionResult> {
  const sources: Array<{ url: string; rawMarkdown: string; score: number }> = [];
  let searchCount = 0;
  let extractCount = 0;

  // Stage A — Michelin
  const michelinQuery = `${input.hotelName} ${input.city} restaurant chef`;
  const michelinRun = await tavilySearchAndExtract({
    query: michelinQuery,
    extractQuery: `Michelin stars chef cuisine signature dish at ${input.hotelName}`,
    searchDepth: 'advanced',
    extractDepth: 'advanced',
    includeDomains: ['guide.michelin.com'],
    maxSearchResults: 8,
    maxExtractUrls: 4,
    chunksPerSource: 4,
    minScore: 0.4,
  });
  searchCount++;
  extractCount += michelinRun.extracted.length;
  for (const r of michelinRun.extracted) {
    sources.push({ url: r.url, rawMarkdown: r.content, score: r.score });
  }

  // Stage B — Official site (only if it differs from a generic page)
  if (input.officialDomain) {
    const officialQuery = `${input.hotelName} restaurant bar dining`;
    const officialRun = await tavilySearchAndExtract({
      query: officialQuery,
      extractQuery: `restaurants bars chefs and dining experiences at ${input.hotelName}`,
      searchDepth: 'advanced',
      extractDepth: 'advanced',
      includeDomains: [input.officialDomain, `*.${input.officialDomain}`],
      maxSearchResults: 6,
      maxExtractUrls: 2,
      chunksPerSource: 5,
      minScore: 0.4,
    });
    searchCount++;
    extractCount += officialRun.extracted.length;
    for (const r of officialRun.extracted) {
      sources.push({ url: r.url, rawMarkdown: r.content, score: r.score });
    }
  }

  if (sources.length === 0) {
    return { outlets: [], extractedSources: [], searchCount, extractCount };
  }

  // De-duplicate sources by URL (Michelin sometimes returns /en/ and /us/en/ versions)
  const dedup = dedupeSources(sources);

  // One LLM call per source so each outlet keeps its source URL.
  const outletsByUrl = new Map<string, DiningOutlet[]>();
  for (const src of dedup) {
    const extracted = await llmExtract({
      content: src.rawMarkdown,
      context: `Dining outlets at ${input.hotelName} (${input.city}) — from ${src.url}`,
      schemaDescription: SCHEMA_DESCRIPTION,
      schema: ExtractionZ,
    });
    if (!extracted) continue;
    const list: DiningOutlet[] = [];
    for (const o of extracted.data.outlets) {
      if (!o.name || o.name.trim().length < 2) continue;
      list.push({
        name: o.name.trim(),
        type: o.type ?? 'other',
        chef: o.chef && o.chef.trim().length > 0 ? o.chef.trim() : null,
        michelinStars: o.michelin_stars,
        cuisine: o.cuisine && o.cuisine.trim().length > 0 ? o.cuisine.trim() : null,
        priceCategory: o.price_category,
        signature: o.signature && o.signature.trim().length > 0 ? o.signature.trim() : null,
        evidenceQuote:
          o.evidence_quote && o.evidence_quote.trim().length > 0
            ? o.evidence_quote.trim().slice(0, 600)
            : '',
        sourceUrl: src.url,
      });
    }
    outletsByUrl.set(src.url, list);
  }

  // Merge by outlet name (Michelin + official may both describe the same restaurant).
  const merged = mergeOutletsByName([...outletsByUrl.values()].flat());

  // Deterministic post-filter against common false positives.
  const cleaned = merged.filter((o) => !looksLikeHotelName(o.name, input.hotelName));

  return {
    outlets: cleaned,
    extractedSources: dedup.map((s) => ({ url: s.url, rawMarkdown: s.rawMarkdown })),
    searchCount,
    extractCount,
  };
}

/**
 * Returns true when the candidate outlet name is just the hotel's own name
 * (so we don't list the hotel itself as a dining outlet). Compares normalized
 * strings to be robust to "Hôtel" prefix / accents / case.
 */
function looksLikeHotelName(candidate: string, hotelName: string): boolean {
  const c = normalizeName(candidate).replace(/^hotel /u, '');
  const h = normalizeName(hotelName).replace(/^hotel /u, '');
  if (c === h) return true;
  if (h.includes(c) && c.length >= 6) return true;
  if (c.includes(h) && h.length >= 6) return true;
  return false;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function dedupeSources(
  sources: ReadonlyArray<{ url: string; rawMarkdown: string; score: number }>,
): ReadonlyArray<{ url: string; rawMarkdown: string; score: number }> {
  const seen = new Set<string>();
  const out: (typeof sources)[number][] = [];
  for (const s of [...sources].sort((a, b) => b.score - a.score)) {
    const key = normalizeUrl(s.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function normalizeUrl(url: string): string {
  // Treat guide.michelin.com/{en|us/en|fr}/… as the same page.
  return url
    .replace(/\/(?:us\/|fr\/|en\/|us\/en\/)/u, '/')
    .replace(/[?#].*$/u, '')
    .toLowerCase();
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function mergeOutletsByName(outlets: readonly DiningOutlet[]): readonly DiningOutlet[] {
  const byKey = new Map<string, DiningOutlet>();
  for (const o of outlets) {
    const key = normalizeName(o.name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, o);
      continue;
    }
    // Merge: prefer non-null fields, prefer Michelin source (more authoritative for stars).
    const michelinPrefers = (a: DiningOutlet, b: DiningOutlet): DiningOutlet => {
      const aMich = a.sourceUrl.includes('guide.michelin.com');
      const bMich = b.sourceUrl.includes('guide.michelin.com');
      return aMich && !bMich ? a : bMich && !aMich ? b : a;
    };
    const primary = michelinPrefers(existing, o);
    const secondary = primary === existing ? o : existing;
    byKey.set(key, {
      name: primary.name,
      type: primary.type !== 'other' ? primary.type : secondary.type,
      chef: primary.chef ?? secondary.chef,
      michelinStars: primary.michelinStars ?? secondary.michelinStars,
      cuisine: primary.cuisine ?? secondary.cuisine,
      priceCategory: primary.priceCategory ?? secondary.priceCategory,
      signature: primary.signature ?? secondary.signature,
      evidenceQuote: primary.evidenceQuote || secondary.evidenceQuote,
      sourceUrl: primary.sourceUrl,
    });
  }
  return [...byKey.values()];
}
