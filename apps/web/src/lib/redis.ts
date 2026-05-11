import 'server-only';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

import { createInMemoryRedis } from './redis-memory';

let cached: Redis | undefined;

/**
 * E2E seam — when `CCT_E2E_FAKE_HOTEL_ID` is set (Playwright webserver
 * + CI smoke) we substitute a process-local in-memory store for
 * Upstash. Same shape (`get`, `set`, `del`, `incr`, `expire` with
 * `ex` / `nx`) so all callers keep working unchanged. Never enabled in
 * real deployments — the env var is opt-in and absent in prod.
 *
 * Falling back to Upstash construction with `undefined` env vars used
 * to merely log warnings and then explode on first call; routing the
 * E2E path through an in-process Map gives us deterministic state for
 * the booking-paid spec without any infra to spin up.
 */
function isE2ESeamEnabled(): boolean {
  return typeof process.env['CCT_E2E_FAKE_HOTEL_ID'] === 'string';
}

export const redis = (() => {
  if (cached) return cached;
  if (isE2ESeamEnabled()) {
    cached = createInMemoryRedis();
    return cached;
  }
  cached = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return cached;
})();
