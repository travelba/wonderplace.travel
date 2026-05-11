import { describe, expect, it } from 'vitest';

import {
  attachGuest,
  attachOffer,
  beginPayment,
  confirmBooking,
  createDraft,
  failBooking,
  moveToRecap,
  startDraftFromOffer,
  type BookingDraft,
} from './draft';
import type { Guest } from './guest';
import type { Offer } from './offer';

const offer: Offer = {
  id: 'offer-1',
  provider: 'amadeus',
  hotelId: 'hotel-1',
  roomCode: 'KING',
  stay: { checkIn: '2026-07-01', checkOut: '2026-07-04' },
  guests: { adults: 2, children: 0 },
  totalPrice: { amountMinor: 123_400, currency: 'EUR' },
  cancellationPolicyText: 'Free cancellation until 2026-06-25.',
  expiresAt: '2027-01-01T00:00:00Z',
};

const guest: Guest = {
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean@example.com',
  phone: '+33612345678',
};

function expectOk<T, E>(r: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
}

/** Draft in `results` state — the canonical entry point for `attachOffer`. */
const draftAtResults = (mode: BookingDraft['mode'] = 'amadeus'): BookingDraft => ({
  ...createDraft({ id: 'd', mode }),
  state: 'results',
});

describe('BookingDraft aggregate', () => {
  it('happy path: amadeus mode flows results → confirmed', () => {
    let d: BookingDraft = draftAtResults('amadeus');

    d = expectOk(attachOffer(d, offer));
    expect(d.state).toBe('offer_locked');
    expect(d.offer?.id).toBe('offer-1');

    d = expectOk(attachGuest(d, guest));
    expect(d.state).toBe('guest_collected');
    expect(d.guest?.email).toBe('jean@example.com');

    d = expectOk(moveToRecap(d));
    expect(d.state).toBe('recap');

    d = expectOk(beginPayment(d));
    expect(d.state).toBe('payment_pending');
    expect(d.paymentStatus).toBe('pending');

    d = expectOk(confirmBooking(d));
    expect(d.state).toBe('confirmed');
    expect(d.paymentStatus).toBe('captured');
  });

  it('email mode marks payment as not_required and forbids beginPayment', () => {
    const d = createDraft({ id: 'd2', mode: 'email' });
    expect(d.paymentStatus).toBe('not_required');

    const r = beginPayment({ ...d, state: 'recap' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_transition');
  });

  it('failBooking switches paymentStatus to failed when reason is payment_failed', () => {
    const draft: BookingDraft = {
      id: 'd3',
      state: 'payment_pending',
      mode: 'amadeus',
      paymentStatus: 'pending',
    };
    const next = expectOk(failBooking(draft, 'payment_failed'));
    expect(next.state).toBe('failed');
    expect(next.paymentStatus).toBe('failed');
  });

  it('attachOffer rejects out-of-order transitions', () => {
    const d = createDraft({ id: 'd4', mode: 'amadeus' });
    const r = attachOffer(d, offer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_transition');
  });

  it('email-mode confirms directly from recap (no payment step)', () => {
    let d: BookingDraft = draftAtResults('email');
    d = expectOk(attachOffer(d, offer));
    d = expectOk(attachGuest(d, guest));
    d = expectOk(moveToRecap(d));

    d = expectOk(confirmBooking(d));
    expect(d.state).toBe('confirmed');
    expect(d.paymentStatus).toBe('not_required');
  });

  it('display_only mode confirms directly from recap', () => {
    let d: BookingDraft = draftAtResults('display_only');
    d = expectOk(attachOffer(d, offer));
    d = expectOk(attachGuest(d, guest));
    d = expectOk(moveToRecap(d));
    d = expectOk(confirmBooking(d));
    expect(d.paymentStatus).toBe('not_required');
  });

  it('startDraftFromOffer constructs an offer_locked draft and feeds the funnel', () => {
    let d = startDraftFromOffer({ id: 'd5', mode: 'amadeus', offer });
    expect(d.state).toBe('offer_locked');
    expect(d.offer?.id).toBe('offer-1');
    expect(d.paymentStatus).toBe('pending');

    d = expectOk(attachGuest(d, guest));
    d = expectOk(moveToRecap(d));
    d = expectOk(beginPayment(d));
    expect(d.state).toBe('payment_pending');
  });
});
