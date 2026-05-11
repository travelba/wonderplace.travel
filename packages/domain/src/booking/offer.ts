import type { Clock } from '../shared/clock';
import { err, ok, type Result } from '../shared/result';

import { offerExpiredError, type BookingError } from './errors';

/**
 * Offer value object (skill: booking-engine). Captured at Amadeus
 * `hotel-offers` step or Little Hotelier equivalent. Once locked it has a
 * vendor-side TTL and **must not** be mutated; we re-fetch instead.
 */
export type OfferProvider = 'amadeus' | 'little';

export interface MoneyAmount {
  /** Integer minor units (cents) to avoid float drift. */
  readonly amountMinor: number;
  readonly currency: 'EUR';
}

export interface OfferStayDates {
  /** ISO calendar date `YYYY-MM-DD`. */
  readonly checkIn: string;
  /** ISO calendar date `YYYY-MM-DD`. */
  readonly checkOut: string;
}

export interface OfferGuestCounts {
  readonly adults: number;
  readonly children: number;
}

export interface Offer {
  readonly id: string;
  readonly provider: OfferProvider;
  readonly hotelId: string;
  readonly roomCode: string;
  readonly stay: OfferStayDates;
  readonly guests: OfferGuestCounts;
  readonly totalPrice: MoneyAmount;
  /** Cancellation policy raw text, **verbatim** from provider (CDC §6). */
  readonly cancellationPolicyText: string;
  /** ISO-8601 timestamp at which the vendor offer expires. */
  readonly expiresAt: string;
}

const isoTimestampMs = (iso: string): number | undefined => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
};

/**
 * Returns the strictly positive number of milliseconds before `expiresAt`,
 * or `0` if the offer is already expired (or `expiresAt` is unparseable).
 */
export const offerRemainingMs = (offer: Offer, clock: Clock): number => {
  const exp = isoTimestampMs(offer.expiresAt);
  if (exp === undefined) return 0;
  const remaining = exp - clock.now().getTime();
  return remaining > 0 ? remaining : 0;
};

export const isOfferExpired = (offer: Offer, clock: Clock): boolean =>
  offerRemainingMs(offer, clock) === 0;

/**
 * Ensures `offer.expiresAt` is in the future at the provided clock. Returns
 * `ok(offer)` if usable, `err(offer_expired)` otherwise — callers must
 * trigger a re-fetch rather than proceed to payment.
 */
export const ensureOfferUsable = (offer: Offer, clock: Clock): Result<Offer, BookingError> => {
  if (isOfferExpired(offer, clock)) {
    return err(offerExpiredError(offer.id, offer.expiresAt));
  }
  return ok(offer);
};

/**
 * Number of nights between check-in and check-out. Returns `0` when the
 * dates are malformed or `checkOut <= checkIn` (defensive — the caller
 * should treat zero nights as an invalid offer).
 */
export const nightCount = (stay: OfferStayDates): number => {
  const inMs = isoTimestampMs(`${stay.checkIn}T00:00:00Z`);
  const outMs = isoTimestampMs(`${stay.checkOut}T00:00:00Z`);
  if (inMs === undefined || outMs === undefined) return 0;
  const diff = outMs - inMs;
  if (diff <= 0) return 0;
  return Math.round(diff / 86_400_000);
};
