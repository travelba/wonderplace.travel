import { describe, expect, it } from 'vitest';

import {
  AMADEUS_SENTIMENT_CATEGORY_KEYS,
  amadeusSentimentToAggregateRating,
  amadeusSentimentToCategoryBreakdown,
} from './map-sentiment.js';
import type { HotelSentimentEntry } from './types.js';

const base: HotelSentimentEntry = {
  hotelId: 'HTLPAR123',
  overallRating: 90,
  numberOfReviews: 200,
  numberOfRatings: 250,
  sentiments: { service: 95, location: 88 },
};

describe('amadeusSentimentToAggregateRating', () => {
  it('converts a 0–100 overall score to a 0–5 ratingValue with two decimals', () => {
    const r = amadeusSentimentToAggregateRating(base);
    expect(r).not.toBeNull();
    expect(r?.ratingValue).toBe(4.5); // 90 / 20
    expect(r?.bestRating).toBe(5);
    expect(r?.worstRating).toBe(1);
  });

  it('prefers numberOfReviews over numberOfRatings (semantic match with schema.org)', () => {
    const r = amadeusSentimentToAggregateRating(base);
    expect(r?.reviewCount).toBe(200);
  });

  it('falls back to numberOfRatings when reviews are absent', () => {
    const r = amadeusSentimentToAggregateRating({
      ...base,
      numberOfReviews: undefined,
    });
    expect(r?.reviewCount).toBe(250);
  });

  it('returns null when overallRating is undefined (no review yet)', () => {
    expect(
      amadeusSentimentToAggregateRating({
        ...base,
        overallRating: undefined,
      }),
    ).toBeNull();
  });

  it('returns null when reviewCount would be zero (forbidden by Google guidelines)', () => {
    expect(
      amadeusSentimentToAggregateRating({
        ...base,
        numberOfReviews: 0,
        numberOfRatings: 0,
      }),
    ).toBeNull();
  });

  it('rounds half-up to two decimals (e.g. 87 → 4.35)', () => {
    const r = amadeusSentimentToAggregateRating({ ...base, overallRating: 87 });
    expect(r?.ratingValue).toBe(4.35);
  });

  it('clamps a defensive vendor-drift value above 100 to the 5 ceiling', () => {
    const r = amadeusSentimentToAggregateRating({ ...base, overallRating: 105 });
    expect(r?.ratingValue).toBe(5);
  });

  it('clamps a defensive vendor-drift value below 0 to the 1 floor', () => {
    const r = amadeusSentimentToAggregateRating({ ...base, overallRating: 0 });
    expect(r?.ratingValue).toBe(1);
  });
});

describe('amadeusSentimentToCategoryBreakdown', () => {
  it('returns an empty array when `sentiments` is missing entirely', () => {
    const r = amadeusSentimentToCategoryBreakdown({
      hotelId: 'HTLPAR123',
      overallRating: 80,
      numberOfReviews: 10,
    });
    expect(r).toEqual([]);
  });

  it('returns an empty array when `sentiments` is an empty object', () => {
    const r = amadeusSentimentToCategoryBreakdown({
      hotelId: 'HTLPAR123',
      sentiments: {},
    });
    expect(r).toEqual([]);
  });

  it('skips categories whose value is undefined (never measured)', () => {
    const r = amadeusSentimentToCategoryBreakdown({
      hotelId: 'HTLPAR123',
      sentiments: { service: 90, location: undefined, staff: 75 },
    });
    expect(r.map((c) => c.key)).toEqual(['service', 'staff']);
  });

  it('sorts categories descending by score', () => {
    const r = amadeusSentimentToCategoryBreakdown({
      hotelId: 'HTLPAR123',
      sentiments: {
        service: 60,
        location: 90,
        valueForMoney: 75,
        staff: 82,
      },
    });
    expect(r.map((c) => c.score)).toEqual([90, 82, 75, 60]);
  });

  it('caps the result to the top-N (default 5)', () => {
    const r = amadeusSentimentToCategoryBreakdown({
      hotelId: 'HTLPAR123',
      sentiments: {
        sleepQuality: 95,
        service: 92,
        facilities: 88,
        roomComforts: 85,
        valueForMoney: 82,
        catering: 78,
        location: 75,
        pointsOfInterest: 70,
      },
    });
    expect(r).toHaveLength(5);
    expect(r.map((c) => c.key)).toEqual([
      'sleepQuality',
      'service',
      'facilities',
      'roomComforts',
      'valueForMoney',
    ]);
  });

  it('honours a custom topN', () => {
    const r = amadeusSentimentToCategoryBreakdown(
      {
        hotelId: 'HTLPAR123',
        sentiments: { service: 95, location: 80, staff: 70 },
      },
      { topN: 2 },
    );
    expect(r).toHaveLength(2);
    expect(r.map((c) => c.key)).toEqual(['service', 'location']);
  });

  it('filters out categories below `minScore`', () => {
    const r = amadeusSentimentToCategoryBreakdown(
      {
        hotelId: 'HTLPAR123',
        sentiments: { service: 90, location: 45, staff: 20 },
      },
      { minScore: 50 },
    );
    expect(r.map((c) => c.key)).toEqual(['service']);
  });

  it('returns an empty array for topN <= 0 (defensive)', () => {
    const r = amadeusSentimentToCategoryBreakdown(
      {
        hotelId: 'HTLPAR123',
        sentiments: { service: 95 },
      },
      { topN: 0 },
    );
    expect(r).toEqual([]);
  });

  it('clamps drift values into the 0..100 range and rounds to integers', () => {
    const r = amadeusSentimentToCategoryBreakdown({
      hotelId: 'HTLPAR123',
      sentiments: { service: 105, location: -10, staff: 73.6 },
    });
    expect(r.find((c) => c.key === 'service')?.score).toBe(100);
    expect(r.find((c) => c.key === 'location')?.score).toBe(0);
    expect(r.find((c) => c.key === 'staff')?.score).toBe(74);
  });

  it('preserves canonical category order on score ties', () => {
    const r = amadeusSentimentToCategoryBreakdown({
      hotelId: 'HTLPAR123',
      sentiments: {
        // Same score across three keys — canonical order from the
        // declaration array breaks the tie deterministically.
        service: 80,
        location: 80,
        staff: 80,
      },
    });
    // Canonical declaration order: service (index 1), location (6), staff (8).
    expect(r.map((c) => c.key)).toEqual(['service', 'location', 'staff']);
  });

  it('exposes a non-empty canonical list of category keys', () => {
    expect(AMADEUS_SENTIMENT_CATEGORY_KEYS.length).toBeGreaterThanOrEqual(10);
    expect(AMADEUS_SENTIMENT_CATEGORY_KEYS).toContain('service');
    expect(AMADEUS_SENTIMENT_CATEGORY_KEYS).toContain('valueForMoney');
  });
});
