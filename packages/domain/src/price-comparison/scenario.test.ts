import { describe, expect, it } from 'vitest';

import { normalizeComparison } from './normalize';
import { computeScenario } from './scenario';

const stay = { checkIn: '2026-06-01', checkOut: '2026-06-03', adults: 2 };

const baseline = (price: number) =>
  normalizeComparison({
    stay,
    entries: [{ provider: 'booking_com', price }],
  });

describe('computeScenario', () => {
  it('returns `unavailable` when no competitor data', () => {
    const normalized = normalizeComparison({ stay, entries: [] });
    expect(computeScenario({ normalized, priceConciergeMinor: 10000 })).toEqual({
      kind: 'unavailable',
    });
  });

  it('returns `unavailable` when the concierge price is null', () => {
    const normalized = baseline(120);
    expect(computeScenario({ normalized, priceConciergeMinor: null })).toEqual({
      kind: 'unavailable',
    });
  });

  it('returns `cheaper` when concierge is strictly less', () => {
    const normalized = baseline(120);
    expect(computeScenario({ normalized, priceConciergeMinor: 11500 })).toEqual({
      kind: 'cheaper',
      deltaMinor: 500,
    });
  });

  it('returns `equal_with_benefits` when concierge ties + benefits > 0', () => {
    const normalized = normalizeComparison({
      stay,
      entries: [{ provider: 'booking_com', price: 120 }],
      benefitsValueMinor: 2500,
    });
    expect(computeScenario({ normalized, priceConciergeMinor: 12000 })).toEqual({
      kind: 'equal_with_benefits',
      benefitsValueMinor: 2500,
    });
  });

  it('returns `more_expensive` when concierge ties but no benefits', () => {
    const normalized = baseline(120);
    expect(computeScenario({ normalized, priceConciergeMinor: 12000 })).toEqual({
      kind: 'more_expensive',
      deltaMinor: 0,
    });
  });

  it('returns `more_expensive` when concierge is above the cheapest competitor', () => {
    const normalized = baseline(120);
    expect(computeScenario({ normalized, priceConciergeMinor: 12500 })).toEqual({
      kind: 'more_expensive',
      deltaMinor: 500,
    });
  });
});
