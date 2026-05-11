/**
 * Booking-context error variants (skill: booking-engine). Translated to
 * user-facing copy by `apps/web` at the route handler / server action
 * boundary — never leak internal details (no stack traces, no vendor JSON).
 */
export type BookingError =
  | { readonly kind: 'invalid_transition'; readonly from: string; readonly to: string }
  | { readonly kind: 'offer_expired'; readonly offerId: string; readonly expiredAt: string }
  | { readonly kind: 'payment_failed'; readonly reason: 'declined' | 'auth_required' | 'unknown' }
  | { readonly kind: 'booking_conflict'; readonly detail: string }
  | { readonly kind: 'cancellation_policy_unparseable'; readonly detail: string }
  | { readonly kind: 'guest_validation'; readonly field: string; readonly message: string };

export const invalidTransition = (from: string, to: string): BookingError => ({
  kind: 'invalid_transition',
  from,
  to,
});

export const offerExpiredError = (offerId: string, expiredAt: string): BookingError => ({
  kind: 'offer_expired',
  offerId,
  expiredAt,
});

export const paymentFailedError = (
  reason: 'declined' | 'auth_required' | 'unknown',
): BookingError => ({ kind: 'payment_failed', reason });
