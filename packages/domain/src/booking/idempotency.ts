/**
 * Idempotency key derivation (skill: booking-engine, CDC §6). Builds a
 * deterministic canonical string from the booking inputs so that repeated
 * `createBooking` calls (e.g. browser back, retried webhook) reuse the same
 * vendor-side idempotency key.
 *
 * The canonical form is keys-sorted JSON without whitespace. The domain
 * deliberately **does not hash** the key — hashing belongs to the
 * integration layer (which has access to Web Crypto / Node `crypto`).
 */
export interface IdempotencyInput {
  readonly offerId: string;
  readonly hotelId: string;
  readonly userId: string | undefined;
  readonly stay: { readonly checkIn: string; readonly checkOut: string };
  readonly guests: { readonly adults: number; readonly children: number };
  /** Total price in EUR minor units; included so a re-quote produces a new key. */
  readonly totalAmountMinor: number;
  /** Optional caller-provided salt (e.g. session id) for extra disambiguation. */
  readonly salt?: string;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

function canonicalise(value: JsonValue): JsonValue {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map(canonicalise);
  }
  if (typeof value === 'object') {
    const out: { [k: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v !== undefined) {
        out[key] = canonicalise(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * Returns a deterministic, JSON-canonical idempotency key string. Same
 * `IdempotencyInput` ⇒ same key, regardless of property declaration order.
 */
export const buildIdempotencyKey = (input: IdempotencyInput): string => {
  const payload: JsonValue = {
    offerId: input.offerId,
    hotelId: input.hotelId,
    userId: input.userId ?? null,
    stay: { checkIn: input.stay.checkIn, checkOut: input.stay.checkOut },
    guests: { adults: input.guests.adults, children: input.guests.children },
    totalAmountMinor: input.totalAmountMinor,
    salt: input.salt ?? null,
  };
  return JSON.stringify(canonicalise(payload));
};

/**
 * Lightweight idempotency input for the email-mode tunnel (no offer / no
 * price / no payment). Includes the stay tuple + the guest's email so two
 * different visitors enquiring about the same hotel/period from the same
 * device don't collide.
 */
export interface EmailRequestIdempotencyInput {
  readonly hotelId: string;
  readonly guestEmail: string;
  readonly stay: { readonly checkIn: string; readonly checkOut: string };
  readonly guests: { readonly adults: number; readonly children: number };
}

const normaliseEmail = (s: string): string => s.trim().toLowerCase();

/**
 * Canonical key for email-mode booking requests. Mirrors
 * {@link buildIdempotencyKey} (sorted-keys, no whitespace) but with a
 * smaller input set and lowercase-normalised email. Hashing remains the
 * caller's responsibility (the integration layer has access to Web Crypto).
 */
export const buildEmailRequestIdempotencyKey = (input: EmailRequestIdempotencyInput): string => {
  const payload: JsonValue = {
    guestEmail: normaliseEmail(input.guestEmail),
    guests: { adults: input.guests.adults, children: input.guests.children },
    hotelId: input.hotelId,
    stay: { checkIn: input.stay.checkIn, checkOut: input.stay.checkOut },
  };
  return JSON.stringify(canonicalise(payload));
};
