import type { Offer } from 'schema-dts';

export type OfferNode = Exclude<Offer, string>;

export interface OfferInput {
  readonly priceFromEUR: number;
  readonly url: string;
  /** ISO 8601 date when the offer becomes valid (e.g. `2026-06-01`). */
  readonly validFrom?: string;
  /** ISO 8601 date when the offer expires. */
  readonly priceValidUntil?: string;
  /** `InStock` (default), `LimitedAvailability`, `OutOfStock`. */
  readonly availability?: 'InStock' | 'LimitedAvailability' | 'OutOfStock';
}

const AVAILABILITY_IRI = {
  InStock: 'https://schema.org/InStock',
  LimitedAvailability: 'https://schema.org/LimitedAvailability',
  OutOfStock: 'https://schema.org/OutOfStock',
} as const;

/**
 * Offer JSON-LD (Schema.org Offer). EUR pricing aligned with CDC §5 (tarifs nets).
 * `priceFromEUR` is rounded to 2 decimals to avoid `0.1+0.2 = 0.30000…` traps.
 */
export const offerJsonLd = (input: OfferInput): OfferNode => {
  const out: OfferNode = {
    '@type': 'Offer',
    priceCurrency: 'EUR',
    price: Math.round(input.priceFromEUR * 100) / 100,
    url: input.url,
    availability: AVAILABILITY_IRI[input.availability ?? 'InStock'],
  };
  if (input.validFrom !== undefined) {
    out.validFrom = input.validFrom;
  }
  if (input.priceValidUntil !== undefined) {
    out.priceValidUntil = input.priceValidUntil;
  }
  return out;
};
