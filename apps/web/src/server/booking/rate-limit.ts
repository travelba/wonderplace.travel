import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';

import { redis } from '@/lib/redis';

/**
 * Sliding-window rate limiters for the email-mode booking enquiry
 * endpoint (skill: redis-caching §rate-limiting + security-engineering).
 *
 * - `byIp`    : 5 enquiries / hour / source IP — protects against scripted
 *               spam at the network edge.
 * - `byEmail` : 3 enquiries / day  / guest email — limits how many parallel
 *               requests a single visitor can submit. Lower than IP because
 *               legitimate users rarely enquire for more than 1-2 hotels
 *               per day.
 */
export const emailRequestByIpRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix: 'ratelimit:booking-email:ip',
  analytics: true,
});

export const emailRequestByEmailRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '24 h'),
  prefix: 'ratelimit:booking-email:email',
  analytics: true,
});

export interface RateLimitVerdict {
  readonly ok: boolean;
  readonly retryAfterSec: number;
}

const verdictFromLimit = (limited: { success: boolean; reset: number }): RateLimitVerdict => {
  const retryMs = Math.max(0, limited.reset - Date.now());
  return {
    ok: limited.success,
    retryAfterSec: Math.ceil(retryMs / 1000),
  };
};

/**
 * E2E seam — Upstash Ratelimit runs Lua scripts (`evalsha`) which the
 * in-memory Redis stand-in does not implement. When the test harness
 * is active we short-circuit to "always allow" so the booking-email
 * spec exercises the route without spurious 500s.
 */
const isE2EBypass = (): boolean => typeof process.env['CCT_E2E_FAKE_HOTEL_ID'] === 'string';

const E2E_ALLOW: RateLimitVerdict = { ok: true, retryAfterSec: 0 };

export async function gateByIp(ip: string): Promise<RateLimitVerdict> {
  if (isE2EBypass()) return E2E_ALLOW;
  const r = await emailRequestByIpRateLimit.limit(ip);
  return verdictFromLimit(r);
}

export async function gateByEmail(email: string): Promise<RateLimitVerdict> {
  if (isE2EBypass()) return E2E_ALLOW;
  const r = await emailRequestByEmailRateLimit.limit(email.trim().toLowerCase());
  return verdictFromLimit(r);
}
