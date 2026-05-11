import type { HotelSentimentCategories, HotelSentimentEntry } from './types.js';

/**
 * Schema.org-friendly aggregate rating shape (mirror of
 * `packages/seo`'s `AggregateRatingInput` so the integration layer
 * stays independent of the SEO package — the web app composes them).
 *
 * We deliberately surface the rating on the **0–5** scale even though
 * Amadeus exposes 0–100: it lines up with the convention every other
 * surface (Google rich-result preview, JSON-LD examples in the doc,
 * legacy review widgets) uses, and avoids future drift when we add a
 * non-Amadeus source.
 */
export interface AmadeusAggregateRating {
  readonly ratingValue: number;
  readonly reviewCount: number;
  readonly bestRating: 5;
  readonly worstRating: 1;
}

/**
 * Maps an Amadeus `hotelSentiment` entry to a schema.org-ready
 * aggregate rating. Returns `null` when there's nothing legitimately
 * publishable — Google's structured-data guidelines forbid synthesising
 * a rating from zero reviews.
 *
 * Conversion:
 *   - `overallRating` is 0–100; we divide by 20 to land on 0–5 with
 *     two decimal places of precision (rounded half-up).
 *   - `numberOfReviews` is preferred over `numberOfRatings`: Google's
 *     `AggregateRating.reviewCount` field counts **review text**, and
 *     Amadeus's `numberOfReviews` matches that semantic exactly. We
 *     fall back to `numberOfRatings` only when reviews are absent.
 */
export function amadeusSentimentToAggregateRating(
  entry: HotelSentimentEntry,
): AmadeusAggregateRating | null {
  if (entry.overallRating === undefined) return null;
  const reviewCount =
    entry.numberOfReviews !== undefined && entry.numberOfReviews > 0
      ? entry.numberOfReviews
      : entry.numberOfRatings !== undefined && entry.numberOfRatings > 0
        ? entry.numberOfRatings
        : 0;
  if (reviewCount === 0) return null;

  const score = Math.round((entry.overallRating / 20) * 100) / 100;
  // Clamp defensively in case Amadeus ever returns 101 (vendor drift).
  const ratingValue = score < 1 ? 1 : score > 5 ? 5 : score;

  return {
    ratingValue,
    reviewCount,
    bestRating: 5,
    worstRating: 1,
  };
}

/**
 * Canonical list of category keys Amadeus may surface in
 * `sentiments`. Pinned to the type so the page renderer stays
 * type-safe — adding a new category to the API contract here is the
 * single place to update both the mapper and downstream i18n labels.
 */
export const AMADEUS_SENTIMENT_CATEGORY_KEYS = [
  'sleepQuality',
  'service',
  'facilities',
  'roomComforts',
  'valueForMoney',
  'catering',
  'location',
  'pointsOfInterest',
  'staff',
  'internet',
] as const satisfies ReadonlyArray<keyof HotelSentimentCategories>;

export type AmadeusSentimentCategoryKey = (typeof AMADEUS_SENTIMENT_CATEGORY_KEYS)[number];

export interface AmadeusSentimentCategory {
  /** Stable key — matches the Amadeus field name and is used as an i18n token. */
  readonly key: AmadeusSentimentCategoryKey;
  /** Score on the 0–100 integer scale (passes through from Amadeus, clamped defensively). */
  readonly score: number;
}

export interface CategoryBreakdownOptions {
  /** Cap on the number of categories returned (default 5, the editorially-tested top of the list). */
  readonly topN?: number;
  /** Floor below which a category is hidden — protects against "service: 12" cards that hurt trust. */
  readonly minScore?: number;
}

/**
 * Maps an Amadeus `hotelSentiment` entry to a sorted, length-capped
 * list of (category, score). Categories with `undefined` scores are
 * dropped silently — they were never measured. Empty input returns an
 * empty array (caller decides whether to hide the section).
 *
 * Sort order is descending by score so the strongest signals lead the
 * UI. Ties keep the canonical order from
 * `AMADEUS_SENTIMENT_CATEGORY_KEYS` so the output is stable across
 * requests for the same hotel.
 */
export function amadeusSentimentToCategoryBreakdown(
  entry: HotelSentimentEntry,
  options: CategoryBreakdownOptions = {},
): readonly AmadeusSentimentCategory[] {
  const sentiments = entry.sentiments;
  if (sentiments === undefined) return [];

  const topN = options.topN ?? 5;
  const minScore = options.minScore ?? 0;
  if (topN <= 0) return [];

  const raw: AmadeusSentimentCategory[] = [];
  for (const key of AMADEUS_SENTIMENT_CATEGORY_KEYS) {
    const value = sentiments[key];
    if (typeof value !== 'number') continue;
    // Clamp 0..100 defensively in case the API drifts.
    const score = value < 0 ? 0 : value > 100 ? 100 : Math.round(value);
    if (score < minScore) continue;
    raw.push({ key, score });
  }

  // Stable sort: descending by score, then by canonical order
  // (already enforced by insertion order from the loop above).
  raw.sort((a, b) => b.score - a.score);

  return raw.slice(0, topN);
}
