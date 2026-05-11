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
    out.starRating = { '@type': 'Rating', ratingValue: input.starRating };
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

  return out;
};
