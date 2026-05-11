import { describe, expect, it } from 'vitest';

import { normalizeComparison } from './normalize';

const stay = { checkIn: '2026-06-01', checkOut: '2026-06-03', adults: 2 };

describe('normalizeComparison', () => {
  it('keeps allow-listed providers, drops unknown brands and bad prices', () => {
    const out = normalizeComparison({
      stay,
      entries: [
        { provider: 'booking_com', price: '120.00' },
        { provider: 'expedia', price: 115 },
        // disallowed/junk entries below are dropped silently
        // @ts-expect-error — feeding intentionally bad data to assert filtering
        { provider: 'agoda', price: 90 },
        { provider: 'hotels_com', price: 'abc' },
        { provider: 'official_site', price: -5 },
      ],
    });

    expect(out.competitors).toEqual([
      { provider: 'expedia', amountMinor: 11500 },
      { provider: 'booking_com', amountMinor: 12000 },
    ]);
    expect(out.cheapestCompetitor).toEqual({ provider: 'expedia', amountMinor: 11500 });
  });

  it('keeps the cheapest value when a provider appears twice', () => {
    const out = normalizeComparison({
      stay,
      entries: [
        { provider: 'booking_com', price: '150.00' },
        { provider: 'booking_com', price: '120.00' },
      ],
    });
    expect(out.competitors).toEqual([{ provider: 'booking_com', amountMinor: 12000 }]);
  });

  it('returns null cheapestCompetitor when no valid entry remains', () => {
    const out = normalizeComparison({
      stay,
      entries: [
        { provider: 'booking_com', price: 'nope' },
        { provider: 'expedia', price: 0 },
      ],
    });
    expect(out.competitors).toEqual([]);
    expect(out.cheapestCompetitor).toBeNull();
  });

  it('rounds half-away-from-zero to cents', () => {
    const out = normalizeComparison({
      stay,
      entries: [{ provider: 'booking_com', price: 9.999 }],
    });
    expect(out.competitors[0]?.amountMinor).toBe(1000);
  });

  it('coerces a missing or non-positive benefitsValue to 0', () => {
    expect(normalizeComparison({ stay, entries: [] }).benefitsValueMinor).toBe(0);
    expect(
      normalizeComparison({ stay, entries: [], benefitsValueMinor: -10 }).benefitsValueMinor,
    ).toBe(0);
    expect(
      normalizeComparison({ stay, entries: [], benefitsValueMinor: 1234 }).benefitsValueMinor,
    ).toBe(1234);
  });
});
