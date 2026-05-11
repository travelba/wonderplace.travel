import type { Redis } from '@upstash/redis';

/** Narrow `@upstash/redis` surface reused by integrations and in-memory test doubles */
export type IntegrationRedis = Pick<Redis, 'get' | 'set' | 'del'>;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Distributed lock with simple spin-wait (Amadeus OAuth refresh, etc.).
 */
export async function runWithRedisLock(
  redis: IntegrationRedis,
  lockKey: string,
  lockTtlSec: number,
  fn: () => Promise<void>,
  options?: { readonly maxWaitMs?: number; readonly spinMs?: number },
): Promise<void> {
  const maxWaitMs = options?.maxWaitMs ?? 5_000;
  const spinMs = options?.spinMs ?? 120;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const acquired = await redis.set(lockKey, '1', { nx: true, ex: lockTtlSec });
    if (acquired !== null) {
      try {
        await fn();
      } finally {
        await redis.del(lockKey);
      }
      return;
    }
    await sleep(spinMs);
  }
  throw new Error(`redis lock timeout: ${lockKey}`);
}

export async function redisSetStringWithTtl(
  redis: IntegrationRedis,
  key: string,
  value: string,
  ttlSec: number,
): Promise<void> {
  await redis.set(key, value, { ex: ttlSec });
}

export async function redisGetString(redis: IntegrationRedis, key: string): Promise<string | null> {
  const v = await redis.get(key);
  if (typeof v === 'string') return v;
  return null;
}
