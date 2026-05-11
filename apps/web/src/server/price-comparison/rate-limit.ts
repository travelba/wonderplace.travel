import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';

import { redis } from '@/lib/redis';

/**
 * Per-IP sliding-window rate limiter for `/api/price-comparison`
 * (skill: competitive-pricing-comparison §"Performance and abuse").
 * 30 req/min/IP matches the spec.
 */
export const priceComparisonByIpRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'ratelimit:price-cmp:ip',
  analytics: true,
});

export interface RateLimitVerdict {
  readonly ok: boolean;
  readonly retryAfterSec: number;
}

const isE2EBypass = (): boolean => typeof process.env['CCT_E2E_FAKE_HOTEL_ID'] === 'string';

export async function gateByIp(ip: string): Promise<RateLimitVerdict> {
  if (isE2EBypass()) return { ok: true, retryAfterSec: 0 };
  const r = await priceComparisonByIpRateLimit.limit(ip);
  const retryMs = Math.max(0, r.reset - Date.now());
  return { ok: r.success, retryAfterSec: Math.ceil(retryMs / 1000) };
}
