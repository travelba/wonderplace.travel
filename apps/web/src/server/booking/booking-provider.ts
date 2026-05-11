import 'server-only';

import type { Guest, Offer } from '@cct/domain/booking';
import { ok, type Result } from '@cct/domain/shared';

/**
 * Booking-provider port — wraps the upstream reservation API (Amadeus
 * hotel-orders, Little Hotelier reservations, …). Returns an opaque
 * external reference + an optional PNR / provider booking id for audit.
 */
export type BookingChannel = 'amadeus' | 'little';

export interface CreateOrderInput {
  readonly offer: Offer;
  readonly guest: Guest;
  readonly paymentRef: string;
  readonly idempotencyKey: string;
}

export type CreateOrderResult = {
  readonly externalId: string;
  readonly pnr: string | undefined;
};

export type BookingProviderError =
  | { readonly kind: 'offer_expired' }
  | { readonly kind: 'pricing_changed' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'upstream'; readonly details: string };

export interface BookingProvider {
  readonly channel: BookingChannel;
  readonly mode: 'stub' | 'live';
  createOrder(input: CreateOrderInput): Promise<Result<CreateOrderResult, BookingProviderError>>;
}

/**
 * Stub Amadeus booking provider. Mints a synthetic order id derived from
 * the idempotency key so repeated submissions with the same key collide
 * deterministically (matches the spirit of `Idempotency-Key` on the real
 * API).
 */
export const stubAmadeusBookingProvider: BookingProvider = {
  channel: 'amadeus',
  mode: 'stub',
  async createOrder(input) {
    const tail = input.idempotencyKey
      .slice(-12)
      .replace(/[^A-Za-z0-9]/g, '0')
      .toUpperCase();
    const externalId = `STUB-ORD-${tail.padEnd(12, '0')}`;
    return ok({ externalId, pnr: undefined });
  },
};

/**
 * Live provider selection point. Returns the Amadeus stub today.
 * Switching to live Amadeus is a one-line change here once credentials
 * (+ the `AMADEUS_*` env vars) are available.
 */
export function getBookingProvider(): BookingProvider {
  return stubAmadeusBookingProvider;
}
