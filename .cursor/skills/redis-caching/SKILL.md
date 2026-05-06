---
name: redis-caching
description: Upstash Redis caching strategy for ConciergeTravel.fr — Amadeus ARI 3-level cache, price comparator cache, idempotency keys, rate limiting. Use when introducing or changing any cache, TTL, key naming, or invalidation behavior.
---

# Redis caching — ConciergeTravel.fr

Cache is **Upstash Redis (HTTP)** — works on edge runtime and standard Node. The cahier des charges specifies a **3-level Amadeus ARI cache** and a 15 min cache for the price comparator (CDC §7.2 + addendum v3.2).

## Triggers

Invoke when:
- Adding any new cached resource.
- Changing TTL of an existing cache.
- Adding rate limiting on a public endpoint.
- Implementing idempotency keys (booking creation).

## Library

`@upstash/redis` HTTP client; instantiate once in `apps/web/src/lib/redis.ts`:

```ts
import { Redis } from '@upstash/redis';
export const redis = Redis.fromEnv();
```

Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## Key naming convention

`<domain>:<purpose>:<scope>:<args>` — colon-separated, all lowercase, kebab-case args.

Examples:
- `amadeus:offers:hotel-by-city:lyon:2026-07-10:2026-07-12:2:0`
- `amadeus:offer:lock:<offerId>`
- `amadeus:order:status:<orderId>`
- `little:availability:<propId>:<checkin>:<checkout>:<adults>`
- `price-cmp:<hotelId>:<checkin>:<checkout>:<adults>`
- `gplaces:reviews:<placeId>`
- `ratelimit:<scope>:<ip-or-user>`
- `idempotency:booking:<key>`

## Cache levels (CDC §7.2)

| Level | TTL | Use case |
|---|---|---|
| **Long** | **6 h** | Hotel page no-dates content (description, photos, amenities snapshot) |
| **Short** | **15 min** | Search results with dates (Amadeus `/v3/shopping/hotel-offers`) |
| **No cache** | — | Pre-payment offer lookup (`/v3/shopping/hotel-offers/{offerId}`) — guaranteed fresh price |

Other caches:
- Price comparator (Makcorps/Apify): **15 min** (matches §B.2 normalisation).
- Google Places reviews: **24 h**.
- Amadeus order status: **5 min**.

## Non-negotiable rules

- **Never cache pre-payment offer lookups** — prices must be guaranteed at the moment of payment.
- **Never cache booking creation** — and use idempotency keys to prevent duplicates.
- **Use SETEX (not SET + EXPIRE)** to avoid race conditions.
- **JSON-encode** values; decode with Zod parse at read time (never trust the cache).
- **Cache only successful responses**. Errors / empty results may be cached for a very short TTL (e.g. 30s) under `:miss` suffix to dampen vendor outage stampedes.
- **Stampede protection**: use `cache-wrap` helper that locks per-key (`SET NX PX 5000`) for 5s while a single fetch fills the cache.
- **Monitoring**: log cache hit/miss to Sentry breadcrumbs and Vercel logs.

## Rate limiting

- Use `@upstash/ratelimit` `slidingWindow` strategy.
- Public Amadeus search: 50 req / min / IP (CDC §7.2).
- Price comparator: 30 req / min / IP.
- Auth login attempts: 5 / 15 min / IP+email.

```ts
import { Ratelimit } from '@upstash/ratelimit';
export const searchRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '1 m'),
  prefix: 'rl:search',
  analytics: true,
});
```

## Idempotency

Booking creation (Amadeus order or Little reservation) accepts an `Idempotency-Key` header. Server stores `idempotency:booking:<key>` → `{ status, bookingRef }` for 24h. A retry with the same key returns the stored result.

## Invalidation

- Editorial publish (Payload `afterChange`) → `revalidateTag('editorial:<slug>')` (Next.js cache, separate from Redis).
- Hotel publish → `revalidateTag('hotel:<slug>')` + delete `amadeus:offers:hotel-by-city:<city>:*` via SCAN+DEL.
- Manual flush (admin button) → safe wrapper that scans by prefix; never `FLUSHALL` in prod.

## Anti-patterns to refuse

- Calling `await redis.get(key)` and casting result to typed without Zod parse.
- Using `KEYS *` in production code (use `SCAN`).
- Caching anything that involves payment intent creation.
- Setting TTL > 24h on hotel availability data.
- Writing values without TTL (long-living orphans).

## References

- CDC v3.0 §7.2 (3-level cache), §7.3 (no card data anywhere).
- Addendum v3.2 §B.2 (price comparator cache 15 min).
- `amadeus-gds`, `competitive-pricing-comparison`, `security-engineering` skills.
