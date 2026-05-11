import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';

import {
  ensureOfferUsable,
  isOfferExpired,
  nightCount,
  offerRemainingMs,
  type Offer,
} from './offer';

const baseOffer: Offer = {
  id: 'offer-1',
  provider: 'amadeus',
  hotelId: 'hotel-1',
  roomCode: 'KING',
  stay: { checkIn: '2026-07-01', checkOut: '2026-07-04' },
  guests: { adults: 2, children: 0 },
  totalPrice: { amountMinor: 123_400, currency: 'EUR' },
  cancellationPolicyText: 'Free cancellation until 2026-06-25T18:00:00Z.',
  expiresAt: '2026-05-11T12:00:00Z',
};

describe('offer expiration helpers', () => {
  it('flags expired offers and zeroes remaining ms', () => {
    const clock = fixedClock('2026-05-11T12:00:01Z');
    expect(isOfferExpired(baseOffer, clock)).toBe(true);
    expect(offerRemainingMs(baseOffer, clock)).toBe(0);
  });

  it('reports remaining ms when still in the window', () => {
    const clock = fixedClock('2026-05-11T11:59:59Z');
    expect(isOfferExpired(baseOffer, clock)).toBe(false);
    expect(offerRemainingMs(baseOffer, clock)).toBe(1000);
  });

  it('treats malformed expiresAt as already expired', () => {
    const clock = fixedClock('2026-05-11T11:00:00Z');
    const broken: Offer = { ...baseOffer, expiresAt: 'not-a-date' };
    expect(isOfferExpired(broken, clock)).toBe(true);
  });

  it('ensureOfferUsable returns the offer when valid', () => {
    const clock = fixedClock('2026-05-11T10:00:00Z');
    const r = ensureOfferUsable(baseOffer, clock);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe('offer-1');
  });

  it('ensureOfferUsable surfaces an offer_expired error past TTL', () => {
    const clock = fixedClock('2026-05-11T13:00:00Z');
    const r = ensureOfferUsable(baseOffer, clock);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('offer_expired');
  });
});

describe('nightCount', () => {
  it('counts whole nights between check-in and check-out', () => {
    expect(nightCount({ checkIn: '2026-07-01', checkOut: '2026-07-04' })).toBe(3);
  });

  it('returns 0 when checkOut <= checkIn or dates are malformed', () => {
    expect(nightCount({ checkIn: '2026-07-04', checkOut: '2026-07-01' })).toBe(0);
    expect(nightCount({ checkIn: 'foo', checkOut: '2026-07-04' })).toBe(0);
  });
});
