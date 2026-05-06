/**
 * Upstash Redis client + cache helpers (skill: redis-caching).
 * Concrete implementation in Phase 3 (cache-wrap, rate-limit, idempotency).
 */
import { Redis } from '@upstash/redis';

let cached: Redis | undefined;

export function getRedis(config?: { url?: string; token?: string }): Redis {
  if (cached) return cached;
  cached =
    config?.url && config.token
      ? new Redis({ url: config.url, token: config.token })
      : Redis.fromEnv();
  return cached;
}
