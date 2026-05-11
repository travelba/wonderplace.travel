import 'server-only';

import type { Redis } from '@upstash/redis';

/**
 * Process-local in-memory Redis stand-in for **E2E and CI smoke** runs
 * only. Implements the strict subset of the Upstash `Redis` interface
 * actually used by `apps/web/src/lib/redis.ts` consumers:
 *
 *  - `get<T>(key)`           — returns the stored value (typed) or
 *                              `null` when absent / expired.
 *  - `set(key, value, opts)` — `ex` (seconds) and `nx` (only-if-absent)
 *                              flags. Returns `'OK'` on success and
 *                              `null` when `nx` is rejected, matching
 *                              `ioredis` / Upstash semantics.
 *  - `del(key)`              — count of deleted entries (0 or 1).
 *  - `incr(key)`             — atomic +1; initialises at 1 when absent.
 *  - `expire(key, seconds)`  — sets the TTL when the key exists.
 *
 * The store is purely in-process and resets on each Node worker
 * restart. Never use outside `NODE_ENV !== 'production'` or an E2E
 * harness — there is no replication, no persistence, no clustering.
 *
 * Values are stored as JSON strings (mirroring how the Upstash client
 * serialises objects). Calling code that uses `redis.get<MyShape>(k)`
 * will receive a parsed object when the value was an object on
 * insertion, and a string verbatim otherwise — same contract as
 * Upstash's automatic JSON detection.
 */

interface Entry {
  /** Raw value as inserted (Upstash auto-stringifies objects). */
  readonly raw: string;
  /** Whether the original insertion was a non-string (so `get` re-parses). */
  readonly wasObject: boolean;
  /** Absolute expiration in ms (epoch). `undefined` = no TTL. */
  expiresAt: number | undefined;
}

class InMemoryRedis {
  private readonly store = new Map<string, Entry>();

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  }

  private peek(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.peek(key);
    if (entry === undefined) return null;
    if (entry.wasObject) {
      try {
        return JSON.parse(entry.raw) as T;
      } catch {
        return null;
      }
    }
    return entry.raw as unknown as T;
  }

  async set(
    key: string,
    value: unknown,
    options?: { readonly ex?: number; readonly nx?: boolean },
  ): Promise<'OK' | null> {
    if (options?.nx === true && this.peek(key) !== undefined) {
      return null;
    }
    const wasObject = typeof value !== 'string';
    const raw = wasObject ? JSON.stringify(value) : (value as string);
    const expiresAt =
      options?.ex !== undefined && Number.isFinite(options.ex)
        ? Date.now() + Math.max(1, options.ex) * 1000
        : undefined;
    this.store.set(key, { raw, wasObject, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const entry = this.peek(key);
    const current =
      entry === undefined ? 0 : Number.parseInt(entry.wasObject ? '0' : entry.raw, 10) || 0;
    const next = current + 1;
    this.store.set(key, {
      raw: String(next),
      wasObject: false,
      expiresAt: entry?.expiresAt,
    });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.peek(key);
    if (entry === undefined) return 0;
    entry.expiresAt = Date.now() + Math.max(1, seconds) * 1000;
    return 1;
  }
}

/**
 * Returns a structural type-cast of the in-memory store as the Upstash
 * `Redis` type. Only the methods listed at the top of this file are
 * implemented — calling anything else will throw at runtime, which is
 * the right behaviour for a stub.
 */
export function createInMemoryRedis(): Redis {
  const instance = new InMemoryRedis();
  // We intentionally cast through `unknown` — the full Upstash `Redis`
  // surface is large; we only implement the methods consumed by
  // `apps/web/src/lib/redis.ts` callers. Any unimplemented method
  // raises a clear runtime error.
  const proxy = new Proxy(instance as unknown as Redis, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value === undefined && typeof prop === 'string' && !prop.startsWith('__')) {
        return async () => {
          throw new Error(`[redis-memory] unimplemented method: ${prop}`);
        };
      }
      return value;
    },
  });
  return proxy;
}
