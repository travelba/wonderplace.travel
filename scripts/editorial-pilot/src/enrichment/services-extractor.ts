/**
 * services-extractor.ts — Tavily-driven extraction of hotel services & amenities.
 *
 * Strategy: search the official hotel domain for "services", "amenities",
 * "concierge", "practical information", "FAQ", extract the most relevant
 * page(s), and ask the LLM to pull only concrete, literally stated facts:
 *   - languages_spoken (only those explicitly listed)
 *   - parking / valet
 *   - airport transfer
 *   - pet policy
 *   - concierge desk (Clefs d'Or)
 *   - 24h room service / butler
 *   - check-in / check-out times
 *
 * Anti-hallucination strategy:
 *   - Boolean fields default to null when not literally confirmed.
 *   - Language list keeps only ISO names that appear verbatim or implicitly
 *     listed (e.g. "English, French, Spanish, Arabic"). Generic statements
 *     like "multilingual staff" → languages_spoken stays empty.
 *   - "Concierge" by itself is NOT enough to flag clefs_dor=true — only set
 *     when the literal phrase "Clefs d'Or" or "Les Clefs d'Or" is present.
 */

import { z } from 'zod';
import { tavilySearchAndExtract } from './tavily-client.js';
import { llmExtract } from './llm-extract.js';

// ─── Public types ──────────────────────────────────────────────────────────

export interface ServicesFacts {
  /** ISO-style language names verbatim (English, French, Spanish, Arabic, …). */
  readonly languagesSpoken: readonly string[];
  readonly hasParking: boolean | null;
  readonly hasValetParking: boolean | null;
  readonly hasAirportTransfer: boolean | null;
  readonly airportTransferNote: string | null;
  readonly petsAllowed: boolean | null;
  readonly petPolicyNote: string | null;
  readonly hasConcierge: boolean | null;
  /** True ONLY when "Clefs d'Or" is literally mentioned. */
  readonly conciergeClefsDor: boolean | null;
  readonly has24hRoomService: boolean | null;
  readonly hasButlerService: boolean | null;
  /** Verbatim string e.g. "15:00", "3 p.m.", "à partir de 15h". */
  readonly checkInTime: string | null;
  readonly checkOutTime: string | null;
  readonly evidenceQuote: string;
  readonly sourceUrl: string;
}

export interface ServicesExtractionResult {
  readonly services: ServicesFacts | null;
  readonly extractedSources: ReadonlyArray<{ url: string; rawMarkdown: string }>;
}

// ─── Zod (LLM output) ──────────────────────────────────────────────────────

const ServicesZ = z.object({
  languages_spoken: z.array(z.string()).default([]),
  has_parking: z.boolean().nullable(),
  has_valet_parking: z.boolean().nullable(),
  has_airport_transfer: z.boolean().nullable(),
  airport_transfer_note: z.string().nullable(),
  pets_allowed: z.boolean().nullable(),
  pet_policy_note: z.string().nullable(),
  has_concierge: z.boolean().nullable(),
  concierge_clefs_dor: z.boolean().nullable(),
  has_24h_room_service: z.boolean().nullable(),
  has_butler_service: z.boolean().nullable(),
  check_in_time: z.string().nullable(),
  check_out_time: z.string().nullable(),
  evidence_quote: z.string().nullable(),
});

const SCHEMA_DESCRIPTION = `
{
  "languages_spoken": [string],          // ONLY languages literally listed as SPOKEN BY STAFF (English names, e.g. ["English","French","Spanish"]).
  "has_parking": true|false|null,        // any on-site parking
  "has_valet_parking": true|false|null,  // valet specifically
  "has_airport_transfer": true|false|null,
  "airport_transfer_note": string|null,  // verbatim note (vehicle type, included/extra) — max 200 chars
  "pets_allowed": true|false|null,
  "pet_policy_note": string|null,        // verbatim policy excerpt — max 200 chars
  "has_concierge": true|false|null,      // a concierge desk
  "concierge_clefs_dor": true|false|null,// TRUE only if "Clefs d'Or" / "Les Clefs d'Or" literally present
  "has_24h_room_service": true|false|null,
  "has_butler_service": true|false|null,
  "check_in_time": string|null,          // verbatim ("3pm", "15:00", "à partir de 15h")
  "check_out_time": string|null,         // verbatim
  "evidence_quote": string|null          // 1-2 sentences backing the strongest fields (verbatim, max 400 chars)
}

CRITICAL RULES:
- If silent on a boolean → null (NOT false).
- "Concierge" alone ≠ Clefs d'Or. Set concierge_clefs_dor=null unless the
  phrase "Clefs d'Or" (with capitals or in French "Les Clefs d'Or") appears.
- Check-in/out: only if a specific time/range is stated.
- Do NOT infer butler/24h service from "premium service" / "highest standards".

LANGUAGES — anti-hallucination protocol (CRITICAL):
- ONLY include languages explicitly listed as SPOKEN BY STAFF in the body
  of the content. Look for phrases like "we speak", "our staff speaks",
  "our concierges speak", "languages spoken", "langues parlées", "nos
  équipes parlent". The list must appear inside a sentence about staff.
- IGNORE any list that is clearly a language/country picker:
    • a long list of >8 languages
    • language names written in their own script
      (e.g. "العربية", "简体中文", "Čeština", "Ελληνικά", "עברית", "日本語",
      "한국어", "Magyar", "Türkçe", "Português")
    • listed alongside "Select language", "Choose your country",
      "Localisation", "International sites".
  If you detect such a picker → return [] for languages_spoken.
- Use ENGLISH language names only ("English", not "anglais" / "Inglese").
- Maximum 8 languages.
- Generic phrases like "multilingual staff" / "polyglot team" → [].
`;

// ─── Public API ────────────────────────────────────────────────────────────

export interface ServicesExtractorInput {
  readonly hotelName: string;
  readonly city: string;
  readonly officialDomain: string | null;
}

export async function extractServices(
  input: ServicesExtractorInput,
): Promise<ServicesExtractionResult> {
  if (!input.officialDomain) {
    return { services: null, extractedSources: [] };
  }

  const run = await tavilySearchAndExtract({
    query: `${input.hotelName} ${input.city} services amenities concierge parking airport transfer languages pets check-in`,
    extractQuery: `practical services amenities concierge parking valet airport transfer languages spoken pets policy check-in check-out at ${input.hotelName}`,
    searchDepth: 'advanced',
    extractDepth: 'advanced',
    includeDomains: [input.officialDomain, `*.${input.officialDomain}`],
    maxSearchResults: 8,
    maxExtractUrls: 3,
    chunksPerSource: 5,
    minScore: 0.3,
  });

  if (run.extracted.length === 0) {
    return { services: null, extractedSources: [] };
  }

  let best: ServicesFacts | null = null;
  for (const src of run.extracted) {
    const extracted = await llmExtract({
      content: src.content,
      context: `Services & amenities at ${input.hotelName} — from ${src.url}`,
      schemaDescription: SCHEMA_DESCRIPTION,
      schema: ServicesZ,
    });
    if (!extracted) continue;
    const d = extracted.data;
    const candidate: ServicesFacts = {
      languagesSpoken: cleanLanguageList(d.languages_spoken),
      hasParking: d.has_parking,
      hasValetParking: d.has_valet_parking,
      hasAirportTransfer: d.has_airport_transfer,
      airportTransferNote: trimOrNull(d.airport_transfer_note, 200),
      petsAllowed: d.pets_allowed,
      petPolicyNote: trimOrNull(d.pet_policy_note, 200),
      hasConcierge: d.has_concierge,
      conciergeClefsDor: d.concierge_clefs_dor,
      has24hRoomService: d.has_24h_room_service,
      hasButlerService: d.has_butler_service,
      checkInTime: trimOrNull(d.check_in_time, 40),
      checkOutTime: trimOrNull(d.check_out_time, 40),
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
    services: best,
    extractedSources: run.extracted.map((r) => ({ url: r.url, rawMarkdown: r.content })),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function trimOrNull(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = s.trim();
  if (t.length === 0) return null;
  return t.slice(0, max);
}

/** Cap above which the list almost certainly comes from a language picker. */
const MAX_REALISTIC_LANGUAGES = 8;

/** Non-Latin scripts: their presence is a strong signal of a language picker. */
const NON_LATIN_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Cyrillic}\p{Script=Greek}]/u;

/**
 * Normalises a raw language list:
 *   - trims, drops empty
 *   - drops generic adjectives ("multilingual", "various", "many")
 *   - dedupes case-insensitively
 *   - DROPS the entire list if it looks like a language picker:
 *       • more than {MAX_REALISTIC_LANGUAGES} entries
 *       • OR any entry written in a non-Latin script (العربية, 日本語, …)
 *
 * Returning an empty list is the correct behaviour when the LLM swallowed
 * a locale switcher: subsequent passes will skip the "languages parlées"
 * sentence rather than inventing one.
 */
function cleanLanguageList(raw: readonly string[]): readonly string[] {
  const generic = /^(multilingual|polyglot|various|many|several|all major)$/iu;
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = item.trim();
    if (t.length === 0 || t.length > 30) continue;
    if (generic.test(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(t);
  }
  if (cleaned.length === 0) return [];
  if (cleaned.length > MAX_REALISTIC_LANGUAGES) return [];
  if (cleaned.some((t) => NON_LATIN_SCRIPT.test(t))) return [];
  return cleaned;
}

function countSignal(s: ServicesFacts): number {
  let n = 0;
  if (s.languagesSpoken.length > 0) n++;
  if (s.hasParking !== null) n++;
  if (s.hasValetParking !== null) n++;
  if (s.hasAirportTransfer !== null) n++;
  if (s.airportTransferNote) n++;
  if (s.petsAllowed !== null) n++;
  if (s.petPolicyNote) n++;
  if (s.hasConcierge !== null) n++;
  if (s.conciergeClefsDor !== null) n++;
  if (s.has24hRoomService !== null) n++;
  if (s.hasButlerService !== null) n++;
  if (s.checkInTime) n++;
  if (s.checkOutTime) n++;
  return n;
}
