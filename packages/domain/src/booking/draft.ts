import { err, ok, type Result } from '../shared/result';

import type { BookingError } from './errors';
import type { Guest } from './guest';
import type { Offer } from './offer';
import { transition, type BookingMode, type BookingState } from './state';

export type { BookingMode } from './state';

/** Payment status mirrors the Amadeus Payments / iframe lifecycle. */
export type DraftPaymentStatus = 'not_required' | 'pending' | 'authorized' | 'captured' | 'failed';

/**
 * Aggregate carrying the full tunnel state. Pure value — every mutation
 * returns a new `BookingDraft` (no in-place changes), so React/SSR caches
 * stay sound.
 */
export interface BookingDraft {
  readonly id: string;
  readonly state: BookingState;
  readonly mode: BookingMode;
  readonly offer?: Offer;
  readonly guest?: Guest;
  readonly paymentStatus: DraftPaymentStatus;
}

export interface NewDraftInput {
  readonly id: string;
  readonly mode: BookingMode;
}

export const createDraft = (input: NewDraftInput): BookingDraft => ({
  id: input.id,
  state: 'idle',
  mode: input.mode,
  paymentStatus:
    input.mode === 'email' || input.mode === 'display_only' ? 'not_required' : 'pending',
});

export interface NewDraftFromOfferInput {
  readonly id: string;
  readonly mode: BookingMode;
  readonly offer: Offer;
}

/**
 * Constructs a `BookingDraft` already in state `offer_locked` with the
 * provided offer attached. Used by the booking layer when the user picks
 * an offer to lock — the pre-search states (`idle | searching | results`)
 * are not persisted as drafts in this product (they live in URL params
 * and the search UI only).
 */
export const startDraftFromOffer = (input: NewDraftFromOfferInput): BookingDraft => ({
  id: input.id,
  state: 'offer_locked',
  mode: input.mode,
  offer: input.offer,
  paymentStatus:
    input.mode === 'email' || input.mode === 'display_only' ? 'not_required' : 'pending',
});

const replaceState = (
  draft: BookingDraft,
  to: BookingState,
): Result<BookingDraft, BookingError> => {
  const r = transition(draft.state, to, draft.mode);
  if (!r.ok) return r;
  return ok({ ...draft, state: r.value });
};

export const attachOffer = (
  draft: BookingDraft,
  offer: Offer,
): Result<BookingDraft, BookingError> => {
  const r = replaceState(draft, 'offer_locked');
  if (!r.ok) return r;
  return ok({ ...r.value, offer });
};

export const attachGuest = (
  draft: BookingDraft,
  guest: Guest,
): Result<BookingDraft, BookingError> => {
  const r = replaceState(draft, 'guest_collected');
  if (!r.ok) return r;
  return ok({ ...r.value, guest });
};

export const moveToRecap = (draft: BookingDraft): Result<BookingDraft, BookingError> =>
  replaceState(draft, 'recap');

export const beginPayment = (draft: BookingDraft): Result<BookingDraft, BookingError> => {
  if (draft.mode === 'email' || draft.mode === 'display_only') {
    return err({
      kind: 'invalid_transition',
      from: draft.state,
      to: 'payment_pending',
    });
  }
  const r = replaceState(draft, 'payment_pending');
  if (!r.ok) return r;
  return ok({ ...r.value, paymentStatus: 'pending' });
};

export const confirmBooking = (draft: BookingDraft): Result<BookingDraft, BookingError> => {
  const r = replaceState(draft, 'confirmed');
  if (!r.ok) return r;
  const nextPaymentStatus: DraftPaymentStatus =
    draft.mode === 'email' || draft.mode === 'display_only' ? 'not_required' : 'captured';
  return ok({ ...r.value, paymentStatus: nextPaymentStatus });
};

export const failBooking = (
  draft: BookingDraft,
  reason: 'payment_failed' | 'offer_expired' | 'upstream_error',
): Result<BookingDraft, BookingError> => {
  const r = replaceState(draft, 'failed');
  if (!r.ok) return r;
  const nextPaymentStatus: DraftPaymentStatus =
    reason === 'payment_failed' ? 'failed' : r.value.paymentStatus;
  return ok({ ...r.value, paymentStatus: nextPaymentStatus });
};
