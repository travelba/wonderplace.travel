import type { Hotel } from 'schema-dts';

import { aggregateRatingJsonLd, type AggregateRatingInput } from './aggregate-rating';
import { offerJsonLd, type OfferInput } from './offer';

/** Hotel without the bare-IRI string union from schema-dts. */
export type HotelNode = Exclude<Hotel, string>;

export interface HotelAddressInput {
  readonly streetAddress: string;
  readonly addressLocality: string;
  readonly postalCode: string;
  /** ISO 3166-1 alpha-2 country code, defaults to `FR`. */
  readonly addressCountry?: string;
  readonly addressRegion?: string;
}

export interface HotelGeoInput {
  readonly latitude: number;
  readonly longitude: number;
}

export interface HotelJsonLdInput {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  /** Star rating (1–5). For *Palaces* (Atout France), set `starRating: 5` plus `isPalace: true`. */
  readonly starRating?: 1 | 2 | 3 | 4 | 5;
  /** Marker for the regulated Atout France *Palace* distinction. Surfaces an `award` field. */
  readonly isPalace?: boolean;
  readonly images?: readonly string[];
  readonly telephone?: string;
  readonly priceRange?: string;
  readonly address?: HotelAddressInput;
  readonly geo?: HotelGeoInput;
  readonly amenityFeatures?: readonly string[];
  readonly aggregateRating?: AggregateRatingInput;
  readonly offer?: OfferInput;
  /**
   * Optional list of recognitions/awards. Each entry is a free-form text such
   * as `"Forbes Travel Guide 5 Stars — 2024"`. Concatenated with the regulated
   * `Distinction Palace` marker when `isPalace` is also `true`.
   */
  readonly awards?: readonly string[];
  /**
   * Number of bookable units (Schema.org `Hotel.numberOfRooms`). Integer,
   * positive. When provided we surface it both as the rich-result property
   * and let LLMs ground "How many rooms does X have?" queries.
   */
  readonly numberOfRooms?: number;
  /**
   * Time-of-day strings in 24h `HH:MM` form. We do NOT coerce or validate
   * here — the page-level reader already ran them through a Zod regex.
   * Schema.org accepts either bare `Time` or a full `DateTime`; the former
   * is enough for Google's Hotel rich-result test.
   */
  readonly checkinTime?: string;
  readonly checkoutTime?: string;
  /**
   * `true` when pets are accepted (any policy). `false` when explicitly
   * refused. `undefined` leaves the field unset — Google treats absence
   * as "unknown" rather than "no".
   */
  readonly petsAllowed?: boolean;
  /**
   * Editorial pull-quote reviews (Forbes, Condé Nast Traveler, Michelin,
   * etc.). Surfaced as Schema.org `Review[]` items under the Hotel node.
   *
   *   - `reviewBody` ← quote.
   *   - `author.@type = Organization`, `author.name` ← `author ?? source`.
   *   - `publisher.@type = Organization`, `publisher.name` ← `source`.
   *   - `reviewRating` ← `{ratingValue, bestRating, worstRating: 0}` when
   *     `rating` + `maxRating` are both set.
   *   - `datePublished` ← `date`.
   *   - `url` ← `sourceUrl` (HTTPS).
   *
   * Capped at 5 entries before emission to stay within Google's
   * documented Hotel rich-result envelope.
   */
  readonly featuredReviews?: readonly HotelFeaturedReviewInput[];
}

export interface HotelFeaturedReviewInput {
  readonly source: string;
  readonly sourceUrl?: string;
  readonly author?: string;
  readonly quote: string;
  readonly rating?: number;
  readonly maxRating?: number;
  /** Optional ISO-8601 `YYYY-MM-DD` publication date. */
  readonly date?: string;
}

const PALACE_AWARD = 'Distinction Palace — Atout France';

/**
 * `Hotel` JSON-LD (skill: structured-data-schema-org).
 *
 * Legal note: the *Palace* distinction is regulated by Atout France. When
 * `isPalace` is `true`, expose it via the standard `award` property; never
 * inflate `starRating` beyond 5.
 */
export const hotelJsonLd = (input: HotelJsonLdInput): HotelNode => {
  const out: HotelNode = {
    '@type': 'Hotel',
    name: input.name,
    url: input.url,
  };

  if (input.description !== undefined) {
    out.description = input.description;
  }
  if (input.starRating !== undefined) {
    // `bestRating: 5` is recommended by Google's hotel rich-result
    // documentation even though `ratingValue` is already capped at 5
    // by our discriminated input type. Emitting it explicitly removes
    // any ambiguity for indexers that don't infer the scale.
    out.starRating = { '@type': 'Rating', ratingValue: input.starRating, bestRating: 5 };
  }
  // `award` may carry the regulated Palace distinction and/or editorial
  // recognitions. Schema.org allows multiple values, expressed as a string
  // array when the count is > 1.
  const awardEntries: string[] = [];
  if (input.isPalace === true) {
    awardEntries.push(PALACE_AWARD);
  }
  if (input.awards !== undefined) {
    for (const award of input.awards) {
      const trimmed = award.trim();
      if (trimmed.length > 0) awardEntries.push(trimmed);
    }
  }
  const firstAward = awardEntries[0];
  if (awardEntries.length === 1 && firstAward !== undefined) {
    out.award = firstAward;
  } else if (awardEntries.length > 1) {
    out.award = awardEntries;
  }
  if (input.images !== undefined && input.images.length > 0) {
    out.image = [...input.images];
  }
  if (input.telephone !== undefined) {
    out.telephone = input.telephone;
  }
  if (input.priceRange !== undefined) {
    out.priceRange = input.priceRange;
  }
  if (input.address !== undefined) {
    out.address = {
      '@type': 'PostalAddress',
      streetAddress: input.address.streetAddress,
      addressLocality: input.address.addressLocality,
      postalCode: input.address.postalCode,
      addressCountry: input.address.addressCountry ?? 'FR',
      ...(input.address.addressRegion !== undefined
        ? { addressRegion: input.address.addressRegion }
        : {}),
    };
  }
  if (input.geo !== undefined) {
    out.geo = {
      '@type': 'GeoCoordinates',
      latitude: input.geo.latitude,
      longitude: input.geo.longitude,
    };
  }
  if (input.amenityFeatures !== undefined && input.amenityFeatures.length > 0) {
    out.amenityFeature = input.amenityFeatures.map((name) => ({
      '@type': 'LocationFeatureSpecification',
      name,
      value: true,
    }));
  }
  if (input.aggregateRating !== undefined) {
    out.aggregateRating = aggregateRatingJsonLd(input.aggregateRating);
  }
  if (input.offer !== undefined) {
    out.makesOffer = offerJsonLd(input.offer);
  }
  if (input.numberOfRooms !== undefined && input.numberOfRooms > 0) {
    out.numberOfRooms = input.numberOfRooms;
  }
  if (input.checkinTime !== undefined && input.checkinTime.length > 0) {
    out.checkinTime = input.checkinTime;
  }
  if (input.checkoutTime !== undefined && input.checkoutTime.length > 0) {
    out.checkoutTime = input.checkoutTime;
  }
  if (input.petsAllowed !== undefined) {
    out.petsAllowed = input.petsAllowed;
  }
  if (input.featuredReviews !== undefined && input.featuredReviews.length > 0) {
    // Cap at 5 to mirror Google's documented Hotel rich-result envelope
    // (https://developers.google.com/search/docs/appearance/structured-data/hotel).
    // Editorial workflows that exceed 5 entries should curate down before
    // publication; this is a defensive emission cap, not a hard limit.
    out.review = input.featuredReviews.slice(0, 5).map((review) => ({
      '@type': 'Review',
      reviewBody: review.quote,
      author: {
        '@type': 'Organization',
        name:
          review.author !== undefined && review.author.length > 0 ? review.author : review.source,
      },
      publisher: {
        '@type': 'Organization',
        name: review.source,
      },
      ...(review.sourceUrl !== undefined && review.sourceUrl.length > 0
        ? { url: review.sourceUrl }
        : {}),
      ...(review.date !== undefined && review.date.length > 0
        ? { datePublished: review.date }
        : {}),
      ...(review.rating !== undefined && review.maxRating !== undefined
        ? {
            reviewRating: {
              '@type': 'Rating',
              ratingValue: review.rating,
              bestRating: review.maxRating,
              worstRating: 0,
            },
          }
        : {}),
    }));
  }

  return out;
};
