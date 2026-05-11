import 'server-only';

import { buildEmailRequestIdempotencyKey } from '@cct/domain/booking';

import { redis } from '@/lib/redis';

const ONE_DAY_SEC = 24 * 60 * 60;

/**
 * Apps-web wrapper around the domain idempotency key derivation. Same
 * `{hotelId, guestEmail, stay, guests}` ⇒ same key, so double-submits
 * within the TTL window (24h) collapse onto the first request's ref.
 *
 * Free-text fields (`message`, `roomPreference`) are intentionally
 * excluded so minor edits between two clicks are still deduplicated.
 */
export interface EmailRequestKeyInput {
  readonly hotelId: string;
  readonly guestEmail: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adults: number;
  readonly children: number;
}

export function buildEmailRequestCanonicalKey(input: EmailRequestKeyInput): string {
  return buildEmailRequestIdempotencyKey({
    hotelId: input.hotelId,
    guestEmail: input.guestEmail,
    stay: { checkIn: input.checkIn, checkOut: input.checkOut },
    guests: { adults: input.adults, children: input.children },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hash);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return out;
}

/** Redis key for the idempotency record. */
export function emailRequestIdempotencyRedisKey(hash: string): string {
  return `idempotency:booking-email:${hash}`;
}

export type IdempotencyOutcome =
  | { readonly kind: 'fresh' }
  | { readonly kind: 'existing'; readonly requestRef: string };

/**
 * Reserves an idempotency slot keyed by the canonical input. Returns
 * `fresh` when no prior record exists (caller proceeds with the booking
 * flow); returns `existing` with the previously stored request ref when
 * a duplicate is detected within 24h.
 *
 * The caller is expected to call {@link finaliseEmailRequestIdempotency}
 * once the booking is confirmed so subsequent retries can be deduplicated.
 */
export async function reserveEmailRequestIdempotency(
  input: EmailRequestKeyInput,
): Promise<{ readonly hash: string; readonly outcome: IdempotencyOutcome }> {
  const canonical = buildEmailRequestCanonicalKey(input);
  const hash = await sha256Hex(canonical);
  const key = emailRequestIdempotencyRedisKey(hash);

  const acquired = await redis.set(key, 'pending', { nx: true, ex: ONE_DAY_SEC });
  if (acquired !== null) {
    return { hash, outcome: { kind: 'fresh' } };
  }
  const existing = await redis.get<string>(key);
  if (typeof existing === 'string' && existing.startsWith('CT-')) {
    return { hash, outcome: { kind: 'existing', requestRef: existing } };
  }
  // Another concurrent submitter holds the lock but has not yet finalised
  // (state is still `pending`). Treat as fresh to avoid blocking the user
  // — at worst we send two emails, which is preferable to a stuck flow.
  return { hash, outcome: { kind: 'fresh' } };
}

/**
 * Replaces the pending placeholder with the real request ref so future
 * retries return the stored value. TTL is renewed to a full 24 h window.
 */
export async function finaliseEmailRequestIdempotency(
  hash: string,
  requestRef: string,
): Promise<void> {
  await redis.set(emailRequestIdempotencyRedisKey(hash), requestRef, { ex: ONE_DAY_SEC });
}

/** Releases the slot if the submission ultimately failed. */
export async function releaseEmailRequestIdempotency(hash: string): Promise<void> {
  await redis.del(emailRequestIdempotencyRedisKey(hash));
}
