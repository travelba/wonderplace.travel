import type { HttpError } from '../http/http-error.js';

/**
 * Adapter-level error variants for the Amadeus integration (skill:
 * amadeus-gds, api-integration). The booking domain translates these into
 * `BookingError` at its boundary; route handlers map them to user-facing
 * copy without leaking vendor specifics.
 */
export type AmadeusError =
  | { readonly kind: 'http'; readonly error: HttpError }
  | { readonly kind: 'parse_failure'; readonly details: string }
  | { readonly kind: 'oauth_rejected'; readonly details?: string }
  | { readonly kind: 'offer_expired' }
  | { readonly kind: 'offer_not_available'; readonly offerId: string }
  | { readonly kind: 'pricing_changed'; readonly offerId: string }
  | { readonly kind: 'mapping_failure'; readonly details: string }
  | { readonly kind: 'not_implemented'; readonly operation: string };
