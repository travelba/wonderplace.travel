/**
 * Upstash Redis client + cache helpers (skill: redis-caching).
 */
import { Redis } from '@upstash/redis';

export type { IntegrationRedis } from './cache-helpers.js';
export { redisGetString, redisSetStringWithTtl, runWithRedisLock } from './cache-helpers.js';

let cached: Redis | undefined;

export function getRedis(config?: { url?: string; token?: string }): Redis {
  if (cached) return cached;
  cached =
    config?.url && config.token
      ? new Redis({ url: config.url, token: config.token })
      : Redis.fromEnv();
  return cached;
}
