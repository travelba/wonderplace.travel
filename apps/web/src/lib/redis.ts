import 'server-only';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

let cached: Redis | undefined;

export const redis = (() => {
  if (cached) return cached;
  cached = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return cached;
})();
