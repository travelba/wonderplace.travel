import 'server-only';

import type { Offer } from '@cct/domain/booking';

/**
 * Dev/preview-only synthetic offer builder. Used by the lock route when
 * `fake=1` is supplied AND `NODE_ENV !== 'production'`. It mimics the
 * shape of an Amadeus offer so the rest of the tunnel exercises the
 * real state machine, DB persistence, and emails without requiring live
 * GDS credentials.
 *
 * Hard-coded constants:
 *  - €250 / night, EUR
 *  - 10-minute lock window
 *  - Free cancellation up to 48h before arrival (verbatim text)
 *  - Room code `TEST-KING`
 */
export interface CreateFakeOfferInput {
  readonly hotelId: string;
  readonly stay: { readonly checkIn: string; readonly checkOut: string };
  readonly guests: { readonly adults: number; readonly children: number };
}

const FAKE_NIGHT_PRICE_MINOR = 25_000;
const LOCK_WINDOW_SEC = 10 * 60;

function nightCount(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

/**
 * Fake offers are normally gated on `NODE_ENV !== 'production'`, but
 * the Playwright webserver runs Next.js in `production` mode after
 * `next build` to exercise the real bundle. The opt-in
 * `CCT_E2E_FAKE_PAID_HOTEL_ID` env var (only set by the test harness)
 * re-enables the seam in that single context — never in real prod.
 */
export function isFakeOffersEnabled(): boolean {
  if (process.env['NODE_ENV'] !== 'production') return true;
  const paidId = process.env['CCT_E2E_FAKE_PAID_HOTEL_ID'];
  return typeof paidId === 'string' && paidId.length > 0;
}

export function createFakeOfferForDev(input: CreateFakeOfferInput): Offer {
  const nights = nightCount(input.stay.checkIn, input.stay.checkOut);
  const total = FAKE_NIGHT_PRICE_MINOR * nights;
  const expiresAt = new Date(Date.now() + LOCK_WINDOW_SEC * 1000).toISOString();

  return {
    id: `TEST-OFFER-${input.hotelId}-${Date.now().toString(36)}`,
    provider: 'amadeus',
    hotelId: input.hotelId,
    roomCode: 'TEST-KING',
    stay: input.stay,
    guests: input.guests,
    totalPrice: { amountMinor: total, currency: 'EUR' },
    cancellationPolicyText:
      "Annulation gratuite jusqu'à 48h avant l'arrivée. Réservation en mode démo — texte factice pour le développement.",
    expiresAt,
  };
}
