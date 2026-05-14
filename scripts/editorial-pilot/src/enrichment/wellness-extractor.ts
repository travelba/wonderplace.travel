/**
 * wellness-extractor.ts — Tavily-driven extraction of spa / wellness facilities.
 *
 * Strategy: search the official hotel domain for "spa", "wellness",
 * "fitness", extract the most relevant page(s), and ask the LLM to pull
 * the spa name, partner brand (e.g. Dior, La Mer, Sisley), surface, pool
 * presence, and main treatments.
 *
 * Anti-hallucination strategy:
 *   - Boolean fields default to null when not literally confirmed.
 *   - Treatments list keeps only verbatim names (no "luxury" / "premium"
 *     adjectives unless they are part of the literal name).
 */

import { z } from 'zod';
import { tavilySearchAndExtract } from './tavily-client.js';
import { llmExtract } from './llm-extract.js';

// ─── Public types ──────────────────────────────────────────────────────────

export interface WellnessFacts {
  readonly spaName: string | null;
  /** Brand partner, e.g. "Dior", "La Mer", "Sisley", "Valmont", "Augustinus Bader". */
  readonly partnerBrand: string | null;
  readonly surfaceM2: number | null;
  readonly hasPool: boolean | null;
  readonly poolType: string | null;
  readonly hasFitness: boolean | null;
  readonly hasHammam: boolean | null;
  readonly hasSauna: boolean | null;
  readonly numberOfTreatmentRooms: number | null;
  /** Verbatim names of signature treatments listed. */
  readonly signatureTreatments: readonly string[];
  readonly evidenceQuote: string;
  readonly sourceUrl: string;
}

export interface WellnessExtractionResult {
  readonly wellness: WellnessFacts | null;
  readonly extractedSources: ReadonlyArray<{ url: string; rawMarkdown: string }>;
}

// ─── Zod (LLM output) ──────────────────────────────────────────────────────

const WellnessZ = z.object({
  spa_name: z.string().nullable(),
  partner_brand: z.string().nullable(),
  surface_m2: z.number().min(20).max(20000).nullable(),
  has_pool: z.boolean().nullable(),
  pool_type: z.string().nullable(),
  has_fitness: z.boolean().nullable(),
  has_hammam: z.boolean().nullable(),
  has_sauna: z.boolean().nullable(),
  number_of_treatment_rooms: z.number().int().min(1).max(50).nullable(),
  signature_treatments: z.array(z.string()).default([]),
  evidence_quote: z.string().nullable(),
});

const SCHEMA_DESCRIPTION = `
{
  "spa_name": string|null,              // official spa name (e.g. "Dior Spa", "Spa Valmont")
  "partner_brand": string|null,         // skincare / wellness brand partner (Dior, Sisley, La Mer, …)
  "surface_m2": number|null,            // total spa surface in m² literally stated
  "has_pool": true|false|null,          // ONLY true/false if explicitly stated, else null
  "pool_type": string|null,             // e.g. "indoor", "outdoor", "swimming lane", "splash pool"
  "has_fitness": true|false|null,
  "has_hammam": true|false|null,
  "has_sauna": true|false|null,
  "number_of_treatment_rooms": number|null,
  "signature_treatments": [string],     // verbatim names of named treatments, empty array if none
  "evidence_quote": string|null         // 1-2 sentences backing the entry (verbatim, max 400 chars)
}
DO NOT infer "has_pool=false" just because a pool isn't mentioned. If silent → null.
`;

// ─── Public API ────────────────────────────────────────────────────────────

export interface WellnessExtractorInput {
  readonly hotelName: string;
  readonly city: string;
  readonly officialDomain: string | null;
}

export async function extractWellness(
  input: WellnessExtractorInput,
): Promise<WellnessExtractionResult> {
  if (!input.officialDomain) {
    return { wellness: null, extractedSources: [] };
  }

  const run = await tavilySearchAndExtract({
    query: `${input.hotelName} ${input.city} spa wellness pool fitness`,
    extractQuery: `spa name brand partner surface pool fitness hammam sauna treatments at ${input.hotelName}`,
    searchDepth: 'advanced',
    extractDepth: 'advanced',
    includeDomains: [input.officialDomain, `*.${input.officialDomain}`],
    maxSearchResults: 8,
    maxExtractUrls: 3,
    chunksPerSource: 5,
    minScore: 0.35,
  });

  if (run.extracted.length === 0) {
    return { wellness: null, extractedSources: [] };
  }

  let best: WellnessFacts | null = null;
  for (const src of run.extracted) {
    const extracted = await llmExtract({
      content: src.content,
      context: `Spa & wellness facilities at ${input.hotelName} — from ${src.url}`,
      schemaDescription: SCHEMA_DESCRIPTION,
      schema: WellnessZ,
    });
    if (!extracted) continue;
    const d = extracted.data;
    const candidate: WellnessFacts = {
      spaName: d.spa_name && d.spa_name.trim().length > 0 ? d.spa_name.trim() : null,
      partnerBrand:
        d.partner_brand && d.partner_brand.trim().length > 0 ? d.partner_brand.trim() : null,
      surfaceM2: d.surface_m2,
      hasPool: d.has_pool,
      poolType: d.pool_type && d.pool_type.trim().length > 0 ? d.pool_type.trim() : null,
      hasFitness: d.has_fitness,
      hasHammam: d.has_hammam,
      hasSauna: d.has_sauna,
      numberOfTreatmentRooms: d.number_of_treatment_rooms,
      signatureTreatments: d.signature_treatments
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length < 120),
      evidenceQuote:
        d.evidence_quote && d.evidence_quote.trim().length > 0
          ? d.evidence_quote.trim().slice(0, 400)
          : '',
      sourceUrl: src.url,
    };
    const score = countSignal(candidate);
    if (score === 0) continue;
    if (!best || score > countSignal(best)) {
      best = candidate;
    }
  }

  return {
    wellness: best,
    extractedSources: run.extracted.map((r) => ({ url: r.url, rawMarkdown: r.content })),
  };
}

function countSignal(w: WellnessFacts): number {
  let n = 0;
  if (w.spaName) n++;
  if (w.partnerBrand) n++;
  if (w.surfaceM2 !== null) n++;
  if (w.hasPool !== null) n++;
  if (w.poolType) n++;
  if (w.hasFitness !== null) n++;
  if (w.hasHammam !== null) n++;
  if (w.hasSauna !== null) n++;
  if (w.numberOfTreatmentRooms !== null) n++;
  if (w.signatureTreatments.length > 0) n++;
  return n;
}
