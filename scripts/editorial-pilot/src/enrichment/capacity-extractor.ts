/**
 * capacity-extractor.ts — Tavily-driven extraction of room / suite counts and sizes.
 *
 * Strategy: search the official hotel domain for "rooms", "chambres",
 * "accommodation", then extract the most relevant page(s) and ask the LLM
 * to pull structured counts.
 *
 * Many palace sites bury the room count in a press kit or FAQ; Tavily's
 * `advanced` search depth handles that surprisingly well.
 *
 * Anti-hallucination strategy:
 *   - Numbers must be verbatim from the page; "200+" / "around 200" → null.
 *   - If only a total is stated → roomsCount + suitesCount stay null.
 */

import { z } from 'zod';
import { tavilySearchAndExtract } from './tavily-client.js';
import { llmExtract } from './llm-extract.js';

// ─── Public types ──────────────────────────────────────────────────────────

export interface CapacityFacts {
  /** Total accommodation keys (rooms + suites if both are given). */
  readonly totalKeys: number | null;
  readonly roomsCount: number | null;
  readonly suitesCount: number | null;
  /** Number of named "signature" or "speciality" suites if mentioned. */
  readonly signatureSuitesCount: number | null;
  /** Smallest room size in m² (literally stated). */
  readonly minRoomSurfaceM2: number | null;
  readonly maxRoomSurfaceM2: number | null;
  readonly evidenceQuote: string;
  readonly sourceUrl: string;
}

export interface CapacityExtractionResult {
  readonly capacity: CapacityFacts | null;
  readonly extractedSources: ReadonlyArray<{ url: string; rawMarkdown: string }>;
}

// ─── Zod (LLM output) ──────────────────────────────────────────────────────

const CapacityZ = z.object({
  total_keys: z.number().int().min(1).max(2000).nullable(),
  rooms_count: z.number().int().min(0).max(2000).nullable(),
  suites_count: z.number().int().min(0).max(500).nullable(),
  signature_suites_count: z.number().int().min(0).max(50).nullable(),
  min_room_surface_m2: z.number().min(5).max(500).nullable(),
  max_room_surface_m2: z.number().min(5).max(2000).nullable(),
  evidence_quote: z.string().nullable(),
});

const SCHEMA_DESCRIPTION = `
{
  "total_keys": number|null,                // TOTAL accommodation keys for the ENTIRE hotel (rooms + suites combined)
  "rooms_count": number|null,               // TOTAL standard rooms in the entire hotel (not suites)
  "suites_count": number|null,              // TOTAL suites in the entire hotel
  "signature_suites_count": number|null,    // count of named/speciality/eponymous suites if stated
  "min_room_surface_m2": number|null,       // smallest accommodation size in m² literally stated
  "max_room_surface_m2": number|null,       // largest accommodation size in m² literally stated
  "evidence_quote": string|null             // 1-2 sentences from the source backing the numbers (verbatim, max 400 chars)
}

CRITICAL RULES — read carefully:
- NEVER answer with approximate numbers ("around 200", "more than 150") → null.
- NEVER include other hotels in the group. Only THIS hotel.
- A LIST of suite categories ("Suite Impériale, Suite Honeymoon, …") is NOT a count.
  10 named suite categories on one page does NOT mean "10 suites total".
  Set suites_count=null unless an explicit phrase like
  "X suites" / "X chambres et suites" / "the hotel features X rooms"
  appears in the source.
- The phrase MUST refer to the ENTIRE hotel. If you only see one accommodation
  description ("Suite Royale 300 m²"), set total/rooms/suites to null and
  fill only the surface fields.
- Prefer numbers from press-kit / overview / "about the hotel" pages over
  product-detail pages.
- If two contradictory totals appear, prefer the larger one (overview pages
  often state the full total).
`;

// ─── Public API ────────────────────────────────────────────────────────────

export interface CapacityExtractorInput {
  readonly hotelName: string;
  readonly city: string;
  readonly officialDomain: string | null;
  /**
   * Fallback narrative (DATAtourisme descriptionLong, Wikipedia extract, …).
   * Used when Tavily fails to yield a convincing total. Often contains the
   * exact phrase "X chambres" that Tavily misses on press-less hotel sites.
   */
  readonly fallbackNarrative?: string | null;
}

export async function extractCapacity(
  input: CapacityExtractorInput,
): Promise<CapacityExtractionResult> {
  // ─── Step 1 — narrative source (DATAtourisme excerpt). Often contains
  // ─── the exact phrase "X chambres et Y suites" and is therefore more
  // ─── trustworthy than Tavily's page-level chunks for totals.
  let narrativeCapacity: CapacityFacts | null = null;
  if (input.fallbackNarrative && input.fallbackNarrative.length > 50) {
    narrativeCapacity = await extractOne({
      content: input.fallbackNarrative,
      context: `Capacity at ${input.hotelName} — from DATAtourisme/Wikipedia narrative`,
      sourceUrl: 'datatourisme:narrative',
    });
  }

  // ─── Step 2 — Tavily on the official domain (best for surfaces, suite
  // ─── line-ups, and fallback when narrative is silent).
  let tavilyBest: CapacityFacts | null = null;
  let extractedSources: ReadonlyArray<{ url: string; rawMarkdown: string }> = [];

  if (input.officialDomain) {
    const run = await tavilySearchAndExtract({
      query: `${input.hotelName} ${input.city} total number of rooms suites press fact sheet hotel overview about`,
      extractQuery: `total number of rooms and suites in the entire hotel, hotel facts, press kit, overview at ${input.hotelName}`,
      searchDepth: 'advanced',
      extractDepth: 'advanced',
      includeDomains: [input.officialDomain, `*.${input.officialDomain}`],
      maxSearchResults: 12,
      maxExtractUrls: 5,
      chunksPerSource: 5,
      minScore: 0.3,
    });

    for (const src of run.extracted) {
      const candidate = await extractOne({
        content: src.content,
        context: `Capacity at ${input.hotelName} — from ${src.url}`,
        sourceUrl: src.url,
      });
      if (!candidate) continue;
      if (!tavilyBest || scoreCapacity(candidate) > scoreCapacity(tavilyBest)) {
        tavilyBest = candidate;
      }
    }

    extractedSources = run.extracted.map((r) => ({ url: r.url, rawMarkdown: r.content }));
  }

  // ─── Step 3 — combine. Rule of thumb:
  //   • Counts (total_keys, rooms_count, suites_count) → trust narrative first.
  //   • Surfaces → trust Tavily first (more granular).
  //
  // If both sources disagree on the total and the narrative gives a larger
  // number, the narrative wins. A 5-star Paris palace with only 26 keys is
  // implausible; the Tavily figure usually comes from a single category page.
  if (narrativeCapacity && tavilyBest) {
    return {
      capacity: combineCapacity(narrativeCapacity, tavilyBest),
      extractedSources,
    };
  }
  if (narrativeCapacity) {
    return { capacity: narrativeCapacity, extractedSources };
  }
  return { capacity: tavilyBest, extractedSources };
}

/**
 * Combine narrative-derived (primary for counts) with Tavily-derived
 * (primary for surfaces) capacity. When both have a total, picks the larger
 * — small totals from Tavily often come from product-detail pages.
 */
function combineCapacity(narrative: CapacityFacts, tavily: CapacityFacts): CapacityFacts {
  return {
    totalKeys: pickLarger(narrative.totalKeys, tavily.totalKeys),
    roomsCount: pickLarger(narrative.roomsCount, tavily.roomsCount),
    suitesCount: pickLarger(narrative.suitesCount, tavily.suitesCount),
    signatureSuitesCount: narrative.signatureSuitesCount ?? tavily.signatureSuitesCount,
    // For surfaces, prefer Tavily (more granular product-page numbers).
    minRoomSurfaceM2: tavily.minRoomSurfaceM2 ?? narrative.minRoomSurfaceM2,
    maxRoomSurfaceM2: tavily.maxRoomSurfaceM2 ?? narrative.maxRoomSurfaceM2,
    evidenceQuote: narrative.evidenceQuote || tavily.evidenceQuote,
    sourceUrl:
      narrative.totalKeys !== null || narrative.roomsCount !== null
        ? narrative.sourceUrl
        : tavily.sourceUrl,
  };
}

function pickLarger(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

async function extractOne(args: {
  content: string;
  context: string;
  sourceUrl: string;
}): Promise<CapacityFacts | null> {
  const extracted = await llmExtract({
    content: args.content,
    context: args.context,
    schemaDescription: SCHEMA_DESCRIPTION,
    schema: CapacityZ,
  });
  if (!extracted) return null;
  const d = extracted.data;
  const hasSomething =
    d.total_keys !== null ||
    d.rooms_count !== null ||
    d.suites_count !== null ||
    d.signature_suites_count !== null ||
    d.min_room_surface_m2 !== null ||
    d.max_room_surface_m2 !== null;
  if (!hasSomething) return null;
  return {
    totalKeys: d.total_keys,
    roomsCount: d.rooms_count,
    suitesCount: d.suites_count,
    signatureSuitesCount: d.signature_suites_count,
    minRoomSurfaceM2: d.min_room_surface_m2,
    maxRoomSurfaceM2: d.max_room_surface_m2,
    evidenceQuote:
      d.evidence_quote && d.evidence_quote.trim().length > 0
        ? d.evidence_quote.trim().slice(0, 400)
        : '',
    sourceUrl: args.sourceUrl,
  };
}

/**
 * Capacity score:
 *   total_keys      → 3 pts (strongest signal)
 *   rooms_count     → 2 pts
 *   suites_count    → 1 pt (weakest — easily confused with category lists)
 *   surface bounds  → 1 pt each
 *
 * Used to choose the most informative source amongst Tavily extracts.
 */
function scoreCapacity(c: CapacityFacts): number {
  let n = 0;
  if (c.totalKeys !== null) n += 3;
  if (c.roomsCount !== null) n += 2;
  if (c.suitesCount !== null) n += 1;
  if (c.signatureSuitesCount !== null) n += 1;
  if (c.minRoomSurfaceM2 !== null) n += 1;
  if (c.maxRoomSurfaceM2 !== null) n += 1;
  return n;
}
