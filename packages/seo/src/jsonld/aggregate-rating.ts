import type { AggregateRating } from 'schema-dts';

export type AggregateRatingNode = Exclude<AggregateRating, string>;

export interface AggregateRatingInput {
  readonly ratingValue: number;
  readonly reviewCount: number;
  readonly bestRating?: number;
  readonly worstRating?: number;
}

/**
 * Aggregate rating builder (skill: structured-data-schema-org).
 * Caller must ensure `ratingValue` reflects a true aggregate of `reviewCount`
 * unique reviews (Google rich-results guideline) — never fabricate.
 */
export const aggregateRatingJsonLd = (input: AggregateRatingInput): AggregateRatingNode => ({
  '@type': 'AggregateRating',
  ratingValue: input.ratingValue,
  reviewCount: input.reviewCount,
  bestRating: input.bestRating ?? 5,
  worstRating: input.worstRating ?? 1,
});
