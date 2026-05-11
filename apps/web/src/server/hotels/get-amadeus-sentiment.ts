import 'server-only';

import {
  amadeusSentimentToAggregateRating,
  amadeusSentimentToCategoryBreakdown,
  type AmadeusAggregateRating,
  type AmadeusSentimentCategory,
} from '@cct/integrations/amadeus';

import { env } from '@/lib/env';
import { getAmadeusClient } from '@/lib/amadeus';

/**
 * Composite domain shape returned by {@link getAmadeusHotelSentiment}.
 * Each member can independently be `null` / empty so the page can hide
 * surfaces selectively (e.g. an aggregate-only hotel, or one with
 * category-only signals — the latter is rare but observed in the wild).
 */
export interface AmadeusHotelSentiment {
  /** schema.org-ready aggregate rating, or `null` when not publishable. */
  readonly aggregate: AmadeusAggregateRating | null;
  /** Sorted, capped category breakdown (max 5 by default). May be empty. */
  readonly categories: readonly AmadeusSentimentCategory[];
}

const EMPTY: AmadeusHotelSentiment = { aggregate: null, categories: [] };

/**
 * Fetches the Amadeus e-Reputation sentiment for a single hotel and
 * derives both the aggregate rating (JSON-LD-ready) and the top-N
 * category breakdown (UX trust signal). Skill: amadeus-gds.
 *
 * The helper is intentionally **forgiving**: every failure mode resolves
 * to the `EMPTY` sentinel so the hotel page renders successfully even
 * when:
 *  - the hotel has no Amadeus property code (`amadeusHotelId === null`),
 *  - Amadeus credentials are missing (CI smoke, preview, dev with
 *    `SKIP_ENV_VALIDATION=true`),
 *  - the hotel has zero reviews (the aggregate mapper returns null —
 *    Google rich-results forbid synthesising ratings),
 *  - the upstream call fails or returns an unexpected shape.
 *
 * The 24h Redis cache lives inside the Amadeus client; this helper is
 * the thin glue that converts the wire shape into renderable domain
 * objects.
 *
 * IMPORTANT — never throw. The hotel page calls it in parallel with
 * `getTranslations`; a thrown error would tank the whole route.
 */
export async function getAmadeusHotelSentiment(
  amadeusHotelId: string | null,
): Promise<AmadeusHotelSentiment> {
  if (amadeusHotelId === null || amadeusHotelId === '') return EMPTY;

  let key: string | undefined;
  let secret: string | undefined;
  try {
    key = env.AMADEUS_API_KEY;
    secret = env.AMADEUS_API_SECRET;
  } catch {
    return EMPTY;
  }
  if (
    typeof key !== 'string' ||
    key.length === 0 ||
    typeof secret !== 'string' ||
    secret.length === 0
  ) {
    return EMPTY;
  }

  try {
    const client = getAmadeusClient();
    const result = await client.getHotelSentiments({ hotelIds: [amadeusHotelId] });
    if (!result.ok) return EMPTY;

    const entry =
      result.value.data.find((d) => d.hotelId === amadeusHotelId) ?? result.value.data[0];
    if (entry === undefined) return EMPTY;

    return {
      aggregate: amadeusSentimentToAggregateRating(entry),
      categories: amadeusSentimentToCategoryBreakdown(entry),
    };
  } catch (e) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[getAmadeusHotelSentiment] failed:', e);
    }
    return EMPTY;
  }
}
