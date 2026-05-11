import 'server-only';

import { env } from '@/lib/env';
import { redis } from '@/lib/redis';

/**
 * Daily Makcorps call counter (skill: competitive-pricing-comparison
 * §"Cost guardrails"). When the per-day quota is reached we stop calling
 * Makcorps for the rest of the day and serve the persisted
 * `price_comparisons` row instead.
 */

const KEY_PREFIX = 'quota:price-cmp:makcorps';

function dayKeyUtc(now: Date): string {
  // YYYY-MM-DD in UTC — quota window aligns with vendor billing cycles.
  return now.toISOString().slice(0, 10);
}

export async function incrementAndCheckMakcorpsQuota(now: Date = new Date()): Promise<{
  readonly allowed: boolean;
  readonly used: number;
  readonly quota: number;
}> {
  const quota = env.MAKCORPS_DAILY_QUOTA ?? 10_000;
  const key = `${KEY_PREFIX}:${dayKeyUtc(now)}`;
  const used = await redis.incr(key);
  // 26h covers the rollover with margin.
  if (used === 1) {
    await redis.expire(key, 26 * 3600);
  }
  return { allowed: used <= quota, used, quota };
}

/**
 * Lightweight read used by the service to short-circuit before issuing
 * the vendor call when we're already at the limit (avoids a wasted INCR).
 */
export async function peekMakcorpsQuota(now: Date = new Date()): Promise<{
  readonly used: number;
  readonly quota: number;
}> {
  const quota = env.MAKCORPS_DAILY_QUOTA ?? 10_000;
  const key = `${KEY_PREFIX}:${dayKeyUtc(now)}`;
  const raw = await redis.get(key);
  const used =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : 0;
  return { used: Number.isFinite(used) ? used : 0, quota };
}
