import { describe, expect, it } from 'vitest';

import { amadeusOfferToDomain, DEFAULT_OFFER_LOCK_SECONDS } from './map-offer.js';
import type { AmadeusOffer } from './types.js';

const baseOffer: AmadeusOffer = {
  id: 'amadeus-offer-1',
  checkInDate: '2026-07-01',
  checkOutDate: '2026-07-04',
  rateCode: 'RAC',
  room: {
    typeEstimated: { category: 'DELUXE_KING', beds: 1, bedType: 'KING' },
    description: { text: 'Deluxe Room with King Bed' },
  },
  guests: { adults: 2 },
  price: { currency: 'EUR', total: '315.50', base: '290.00' },
  policies: {
    paymentType: 'guarantee',
    cancellations: [
      {
        description: { text: 'Free cancellation until 2026-06-25 18:00 local time.' },
        amount: '0.00',
        deadline: '2026-06-25T18:00:00+02:00',
      },
    ],
  },
};

describe('amadeusOfferToDomain', () => {
  it('maps a free-cancellation offer to domain with EUR minor units', () => {
    const r = amadeusOfferToDomain(baseOffer, {
      hotelId: 'HTLPAR123',
      lockedAt: '2026-05-11T10:00:00Z',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.offer.id).toBe('amadeus-offer-1');
    expect(r.value.offer.provider).toBe('amadeus');
    expect(r.value.offer.hotelId).toBe('HTLPAR123');
    expect(r.value.offer.roomCode).toBe('DELUXE_KING');
    expect(r.value.offer.totalPrice).toEqual({ amountMinor: 31_550, currency: 'EUR' });
    expect(r.value.offer.guests).toEqual({ adults: 2, children: 0 });
    expect(r.value.cancellationPolicy.kind).toBe('free_until');
    expect(r.value.offer.cancellationPolicyText).toContain('Free cancellation');
  });

  it('synthesises expiresAt = lockedAt + DEFAULT_OFFER_LOCK_SECONDS', () => {
    const lockedAt = '2026-05-11T10:00:00Z';
    const r = amadeusOfferToDomain(baseOffer, { hotelId: 'H1', lockedAt });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expected = new Date(
      Date.parse(lockedAt) + DEFAULT_OFFER_LOCK_SECONDS * 1000,
    ).toISOString();
    expect(r.value.offer.expiresAt).toBe(expected);
  });

  it('rejects non-EUR currency with mapping_failure', () => {
    const r = amadeusOfferToDomain(
      { ...baseOffer, price: { ...baseOffer.price, currency: 'USD' } },
      { hotelId: 'H1', lockedAt: '2026-05-11T10:00:00Z' },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('mapping_failure');
  });

  it('produces partial_refund_until with computed fraction', () => {
    const r = amadeusOfferToDomain(
      {
        ...baseOffer,
        policies: {
          cancellations: [
            {
              description: { text: 'Penalty 50% after 2026-06-25.' },
              amount: '157.75',
              deadline: '2026-06-25T18:00:00+02:00',
            },
          ],
        },
      },
      { hotelId: 'H1', lockedAt: '2026-05-11T10:00:00Z' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cancellationPolicy.kind).toBe('partial_refund_until');
    if (r.value.cancellationPolicy.kind === 'partial_refund_until') {
      expect(r.value.cancellationPolicy.partialUntil.penaltyFraction).toBe(0.5);
    }
  });

  it('produces free_until_then_partial with two deadlines', () => {
    const r = amadeusOfferToDomain(
      {
        ...baseOffer,
        policies: {
          cancellations: [
            {
              description: { text: 'Free until 2026-06-20.' },
              amount: '0.00',
              deadline: '2026-06-20T18:00:00Z',
            },
            {
              description: { text: 'Then 50% kept until 2026-06-25.' },
              amount: '157.75',
              deadline: '2026-06-25T18:00:00Z',
            },
          ],
        },
      },
      { hotelId: 'H1', lockedAt: '2026-05-11T10:00:00Z' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cancellationPolicy.kind).toBe('free_until_then_partial');
    if (r.value.cancellationPolicy.kind === 'free_until_then_partial') {
      expect(r.value.cancellationPolicy.partialUntil.penaltyFraction).toBe(0.5);
    }
  });

  it('preserves the cancellation rawText verbatim', () => {
    const r = amadeusOfferToDomain(baseOffer, {
      hotelId: 'H1',
      lockedAt: '2026-05-11T10:00:00Z',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.offer.cancellationPolicyText).toBe(
      'Free cancellation until 2026-06-25 18:00 local time.',
    );
  });
});
