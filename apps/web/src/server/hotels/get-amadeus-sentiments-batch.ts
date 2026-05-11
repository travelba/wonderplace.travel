import 'server-only';

import {
  amadeusSentimentToAggregateRating,
  type AmadeusAggregateRating,
} from '@cct/integrations/amadeus';

import { env } from '@/lib/env';
import { getAmadeusClient } from '@/lib/amadeus';

/**
 * Hard cap from the Amadeus e-Reputation Hotel Ratings API (skill:
 * amadeus-gds). A single call accepts at most 20 `hotelIds`; the helper
 * silently chunks larger inputs and merges the responses.
 */
const MAX_HOTEL_IDS_PER_CALL = 20;

/**
 * Batch-fetches Amadeus sentiment for a list of property codes and
 * returns a Map keyed by `amadeusHotelId` → schema.org-ready aggregate.
 * Skill: amadeus-gds, structured-data-schema-org.
 *
 * Why a Map rather than an array — destination hubs render N hotel
 * cards and want O(1) lookup by amadeusHotelId; an array would force
 * the page into a quadratic scan.
 *
 * Behaviour:
 *  - Deduplicates input ids (case-sensitive, since Amadeus is).
 *  - Drops empty / non-string entries silently.
 *  - Chunks the request into batches of {@link MAX_HOTEL_IDS_PER_CALL}.
 *  - Hotels with no publishable rating (zero reviews / missing data)
 *    are simply absent from the Map — the caller treats that as
 *    "no signal, hide the chip", which is the right UX default.
 *  - Every failure mode (missing env, partial API failure, parse
 *    error) resolves to an *empty* Map for the affected batch, not a
 *    thrown exception. The rest of the chunks still resolve normally.
 *
 * The 24h Redis cache lives inside the Amadeus client, so re-rendering
 * the same hub within the day costs zero upstream calls.
 */
export async function getAmadeusAggregateRatingsBatch(
  amadeusHotelIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, AmadeusAggregateRating>> {
  const ids = dedupe(amadeusHotelIds);
  if (ids.length === 0) return new Map();

  let key: string | undefined;
  let secret: string | undefined;
  try {
    key = env.AMADEUS_API_KEY;
    secret = env.AMADEUS_API_SECRET;
  } catch {
    return new Map();
  }
  if (
    typeof key !== 'string' ||
    key.length === 0 ||
    typeof secret !== 'string' ||
    secret.length === 0
  ) {
    return new Map();
  }

  let client;
  try {
    client = getAmadeusClient();
  } catch {
    return new Map();
  }

  const out = new Map<string, AmadeusAggregateRating>();
  const chunks = chunk(ids, MAX_HOTEL_IDS_PER_CALL);

  // Sequential rather than parallel: Amadeus rate-limits per credential
  // (skill: amadeus-gds), and hubs rarely exceed 1 chunk in practice
  // since most cities have <20 hotels. Sequential keeps the call
  // pattern boring and friendly to the upstream cache.
  for (const slice of chunks) {
    try {
      // Spread to a mutable array: the Zod-inferred input type is
      // `string[]` (mutable) and the helper holds the chunks as
      // `readonly string[]` for safety. The copy is free at this size.
      const result = await client.getHotelSentiments({ hotelIds: [...slice] });
      if (!result.ok) continue;
      for (const entry of result.value.data) {
        const rating = amadeusSentimentToAggregateRating(entry);
        if (rating !== null) out.set(entry.hotelId, rating);
      }
    } catch (e) {
      if (process.env['NODE_ENV'] !== 'production') {
        console.warn('[getAmadeusAggregateRatingsBatch] chunk failed:', e);
      }
      // Continue with the next chunk — partial responses are useful.
    }
  }

  return out;
}

function dedupe(input: readonly (string | null)[]): readonly string[] {
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function chunk(ids: readonly string[], size: number): readonly (readonly string[])[] {
  if (size <= 0) return [];
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}
