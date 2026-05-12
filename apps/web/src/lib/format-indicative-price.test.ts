import { describe, expect, it } from 'vitest';

import {
  computeHotelPriceRange,
  formatIndicativePriceParts,
  type IndicativePriceMinor,
} from './format-indicative-price';

function priced(
  fromMinor: number,
  toMinor: number | null,
  currency: IndicativePriceMinor['currency'] = 'EUR',
): { readonly indicativePrice: IndicativePriceMinor } {
  return { indicativePrice: { fromMinor, toMinor, currency } };
}

function unpriced(): { readonly indicativePrice: null } {
  return { indicativePrice: null };
}

describe('formatIndicativePriceParts', () => {
  it('formats a closed range with locale-aware currency in fr-FR', () => {
    const parts = formatIndicativePriceParts(
      { fromMinor: 95_000, toMinor: 240_000, currency: 'EUR' },
      'fr',
    );
    expect(parts.from).toMatch(/950/);
    expect(parts.from).toContain('€');
    expect(parts.to).toMatch(/2\s?400/);
  });

  it('returns null `to` when the upper bound is missing', () => {
    const parts = formatIndicativePriceParts(
      { fromMinor: 95_000, toMinor: null, currency: 'EUR' },
      'fr',
    );
    expect(parts.from).toContain('€');
    expect(parts.to).toBeNull();
  });

  it('uses en-GB formatting when the locale is `en`', () => {
    const parts = formatIndicativePriceParts(
      { fromMinor: 50_000, toMinor: null, currency: 'GBP' },
      'en',
    );
    expect(parts.from).toContain('£');
  });

  it('drops fractional digits even when the amount has cents', () => {
    const parts = formatIndicativePriceParts(
      { fromMinor: 99_950, toMinor: null, currency: 'EUR' },
      'fr',
    );
    expect(parts.from).not.toContain(',');
    expect(parts.from).not.toContain('.');
  });
});

describe('computeHotelPriceRange', () => {
  it('returns null when no room has an indicative price', () => {
    const result = computeHotelPriceRange([unpriced(), unpriced()], 'fr');
    expect(result).toBeNull();
  });

  it('returns null on an empty room list', () => {
    expect(computeHotelPriceRange([], 'fr')).toBeNull();
  });

  it('returns a single price when all rooms share the same anchor', () => {
    const result = computeHotelPriceRange([priced(95_000, 95_000), priced(95_000, 95_000)], 'fr');
    expect(result).not.toBeNull();
    expect(result).toContain('€');
    expect(result).not.toContain('–');
  });

  it('returns a range covering the min `from` and max `to` across rooms', () => {
    const result = computeHotelPriceRange(
      [priced(95_000, 130_000), priced(125_000, 250_000), priced(1_100_000, null)],
      'fr',
    );
    expect(result).toMatch(/–/);
    expect(result).toContain('€');
  });

  it('falls back to `fromMinor` when `toMinor` is null for the upper bound', () => {
    const result = computeHotelPriceRange([priced(95_000, null), priced(180_000, null)], 'fr');
    expect(result).toMatch(/–/);
  });

  it('returns null when priced rooms mix currencies (no FX guessing)', () => {
    const result = computeHotelPriceRange(
      [priced(95_000, null, 'EUR'), priced(120_000, null, 'USD')],
      'fr',
    );
    expect(result).toBeNull();
  });

  it('formats with en-GB currency rules when locale is `en`', () => {
    const result = computeHotelPriceRange([priced(95_000, 240_000)], 'en');
    expect(result).not.toBeNull();
    expect(result).toContain('€');
  });
});
