import { describe, expect, it } from 'vitest';

import {
  buildEmailRequestIdempotencyKey,
  buildIdempotencyKey,
  type EmailRequestIdempotencyInput,
  type IdempotencyInput,
} from './idempotency';

const base: IdempotencyInput = {
  offerId: 'offer-1',
  hotelId: 'hotel-1',
  userId: 'user-1',
  stay: { checkIn: '2026-07-01', checkOut: '2026-07-04' },
  guests: { adults: 2, children: 0 },
  totalAmountMinor: 123_400,
};

describe('buildIdempotencyKey', () => {
  it('is deterministic and key-order-independent', () => {
    const k1 = buildIdempotencyKey(base);
    const k2 = buildIdempotencyKey({
      totalAmountMinor: 123_400,
      guests: { children: 0, adults: 2 },
      stay: { checkOut: '2026-07-04', checkIn: '2026-07-01' },
      userId: 'user-1',
      hotelId: 'hotel-1',
      offerId: 'offer-1',
    });
    expect(k1).toBe(k2);
  });

  it('changes when the offer or price changes', () => {
    expect(buildIdempotencyKey(base)).not.toBe(
      buildIdempotencyKey({ ...base, offerId: 'offer-2' }),
    );
    expect(buildIdempotencyKey(base)).not.toBe(
      buildIdempotencyKey({ ...base, totalAmountMinor: 123_500 }),
    );
  });

  it('treats undefined userId / salt as JSON null', () => {
    const k = buildIdempotencyKey({ ...base, userId: undefined });
    expect(k).toContain('"userId":null');
  });

  it('includes salt when provided', () => {
    const k = buildIdempotencyKey({ ...base, salt: 'session-xyz' });
    expect(k).toContain('"salt":"session-xyz"');
  });
});

const emailBase: EmailRequestIdempotencyInput = {
  hotelId: 'hotel-1',
  guestEmail: 'JEAN.Dupont@Example.COM',
  stay: { checkIn: '2026-07-01', checkOut: '2026-07-04' },
  guests: { adults: 2, children: 0 },
};

describe('buildEmailRequestIdempotencyKey', () => {
  it('lowercases the guest email so case variants collide', () => {
    const a = buildEmailRequestIdempotencyKey(emailBase);
    const b = buildEmailRequestIdempotencyKey({
      ...emailBase,
      guestEmail: 'jean.dupont@example.com',
    });
    expect(a).toBe(b);
    expect(a).toContain('"guestEmail":"jean.dupont@example.com"');
  });

  it('is sensitive to stay tuple changes', () => {
    expect(buildEmailRequestIdempotencyKey(emailBase)).not.toBe(
      buildEmailRequestIdempotencyKey({
        ...emailBase,
        stay: { checkIn: '2026-07-02', checkOut: '2026-07-04' },
      }),
    );
  });

  it('is property-order independent', () => {
    const a = buildEmailRequestIdempotencyKey(emailBase);
    const b = buildEmailRequestIdempotencyKey({
      guests: { children: 0, adults: 2 },
      stay: { checkOut: '2026-07-04', checkIn: '2026-07-01' },
      hotelId: 'hotel-1',
      guestEmail: 'JEAN.Dupont@Example.COM',
    });
    expect(a).toBe(b);
  });
});
