import 'server-only';

/**
 * Dev/E2E-only synthetic hotel record for the email-mode booking
 * tunnel. Mirrors the dev-fake-offer seam so Playwright can exercise
 * the `/reservation/start` UI without seeded Supabase data.
 *
 * Activation:
 *  - Set `CCT_E2E_FAKE_HOTEL_ID` (a UUID v4 string) in the runtime env.
 *  - The seam ONLY fires when the requested hotelId matches that value.
 *  - We additionally refuse activation if `NODE_ENV === 'production'`
 *    *and* the env var is unset — the env var must be explicitly
 *    provided to opt in, even in non-prod, so accidental usage in dev
 *    builds is hard.
 *
 * The synthetic hotel is published, email-mode, and located in Paris.
 * Returned only as a *head* (lookup shape used by `/reservation/start`).
 */

export interface FakeHotelHead {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly region: string;
}

const FAKE_HOTEL_TEMPLATE: Omit<FakeHotelHead, 'id'> = {
  name: 'Hôtel de Test (E2E)',
  city: 'Paris',
  region: 'Île-de-France',
};

function configuredFakeId(): string | undefined {
  const raw = process.env['CCT_E2E_FAKE_HOTEL_ID'];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function configuredFakePaidId(): string | undefined {
  const raw = process.env['CCT_E2E_FAKE_PAID_HOTEL_ID'];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export function isFakeHotelEnabled(): boolean {
  return configuredFakeId() !== undefined;
}

export function getFakeHotelHead(hotelId: string): FakeHotelHead | null {
  const configured = configuredFakeId();
  if (configured === undefined || hotelId !== configured) return null;
  return { id: hotelId, ...FAKE_HOTEL_TEMPLATE };
}

const FAKE_PAID_HOTEL_TEMPLATE: Omit<FakeHotelHead, 'id'> = {
  name: 'Hôtel Amadeus (E2E)',
  city: 'Nice',
  region: 'Provence-Alpes-Côte d’Azur',
};

/**
 * Paid-tunnel counterpart to {@link getFakeHotelHead}. Returned only
 * when the requested UUID matches `CCT_E2E_FAKE_PAID_HOTEL_ID`,
 * mimicking a published `booking_mode = 'amadeus'` hotel for the
 * `lockOffer` → invite → recap → payment Playwright scenario. Like
 * the email-mode seam, the env var must be explicitly set to enable
 * — there is no default.
 */
export function getFakePaidHotelHead(hotelId: string): FakeHotelHead | null {
  const configured = configuredFakePaidId();
  if (configured === undefined || hotelId !== configured) return null;
  return { id: hotelId, ...FAKE_PAID_HOTEL_TEMPLATE };
}
