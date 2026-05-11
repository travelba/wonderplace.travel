import type { CancellationPolicy, Offer } from '@cct/domain/booking';
import { err, ok, type Result } from '@cct/domain/shared';

import type { AmadeusError } from './errors.js';
import { amadeusPoliciesToCancellation } from './map-cancellation-policy.js';
import type { AmadeusOffer } from './types.js';

/** Conventional lock window applied when Amadeus does not expose one. */
export const DEFAULT_OFFER_LOCK_SECONDS = 10 * 60;

const parseTotalMinor = (raw: string): number | undefined => {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
};

const pickRoomCode = (offer: AmadeusOffer): string => {
  const category = offer.room?.typeEstimated?.category;
  if (typeof category === 'string' && category.length > 0) return category;
  if (typeof offer.rateCode === 'string' && offer.rateCode.length > 0) return offer.rateCode;
  return offer.id;
};

/** Number of children, derived from `childAges` (Amadeus does not expose a raw count). */
const childCount = (offer: AmadeusOffer): number => offer.guests.childAges?.length ?? 0;

export interface OfferMappingContext {
  readonly hotelId: string;
  /** ISO-8601 timestamp at which we received the offer detail response. */
  readonly lockedAt: string;
  /** Seconds of lock validity; defaults to {@link DEFAULT_OFFER_LOCK_SECONDS}. */
  readonly lockSeconds?: number;
}

/**
 * Maps an Amadeus offer fragment to a domain `Offer` + the parsed
 * `CancellationPolicy` (kept alongside so both can be persisted together).
 *
 * The conversion is total: any malformed leaf yields `mapping_failure`,
 * because partial offers MUST NOT reach the payment step (CDC §6).
 */
export function amadeusOfferToDomain(
  offer: AmadeusOffer,
  ctx: OfferMappingContext,
): Result<
  { readonly offer: Offer; readonly cancellationPolicy: CancellationPolicy },
  AmadeusError
> {
  if (offer.price.currency.toUpperCase() !== 'EUR') {
    return err({
      kind: 'mapping_failure',
      details: `unsupported currency ${offer.price.currency}`,
    });
  }
  const totalMinor = parseTotalMinor(offer.price.total);
  if (totalMinor === undefined) {
    return err({
      kind: 'mapping_failure',
      details: `unparseable price total: ${offer.price.total}`,
    });
  }

  const lockedAtMs = Date.parse(ctx.lockedAt);
  if (!Number.isFinite(lockedAtMs)) {
    return err({ kind: 'mapping_failure', details: 'invalid lockedAt timestamp' });
  }
  const lockSeconds = ctx.lockSeconds ?? DEFAULT_OFFER_LOCK_SECONDS;
  const expiresAt = new Date(lockedAtMs + lockSeconds * 1000).toISOString();

  const policy = amadeusPoliciesToCancellation(offer);
  if (!policy.ok) return err(policy.error);

  const domain: Offer = {
    id: offer.id,
    provider: 'amadeus',
    hotelId: ctx.hotelId,
    roomCode: pickRoomCode(offer),
    stay: { checkIn: offer.checkInDate, checkOut: offer.checkOutDate },
    guests: { adults: offer.guests.adults, children: childCount(offer) },
    totalPrice: { amountMinor: totalMinor, currency: 'EUR' },
    cancellationPolicyText: policy.value.rawText,
    expiresAt,
  };

  return ok({ offer: domain, cancellationPolicy: policy.value });
}
