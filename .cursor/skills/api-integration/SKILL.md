---
name: api-integration
description: Standard pattern for vendor API integrations in ConciergeTravel.fr (HTTP client, retries, timeouts, schema validation, errors, logging, caching). Use whenever you implement or modify any third-party API integration in `packages/integrations/`.
---

# API integration pattern — ConciergeTravel.fr

Every vendor (Amadeus, Little Hotelier, Makcorps, Apify, Google Places, Brevo, Algolia, Sentry tunnel) is encapsulated in a dedicated package under `packages/integrations/<vendor>/`. The pattern is uniform.

## Triggers

Invoke when:
- Adding a new integration package.
- Modifying retry / timeout / error mapping behavior.
- Editing the public surface of an integration (functions consumed by `apps/web` / `apps/admin`).

## Standard layout

```
packages/integrations/<vendor>/
├── client.ts          # configured fetch/SDK instance + auth
├── types.ts           # Zod schemas + inferred types
├── errors.ts          # typed error class hierarchy
├── cache-keys.ts      # Redis key builders (if cached)
├── <resource>.ts      # one file per resource (hotels.ts, offers.ts, orders.ts, ...)
├── index.ts           # public re-exports
└── package.json
```

## Non-negotiable rules

### Authentication
- Secrets read **only** from validated env via `packages/config/env`.
- OAuth2 client credentials (Amadeus): cache the access token in Redis with TTL = `expires_in - 60s`. Refresh on 401.
- Never log tokens, full headers, or PII.

### HTTP client
- Use the global `fetch` (Edge-compatible). Optional `undici` `Agent` only on Node-only paths.
- **Mandatory wrapper** `httpRequest({ url, method, body, headers, timeoutMs, retry })`:
  - `AbortController` with default timeout 8s (override per resource).
  - Retries: 3 attempts max, exponential backoff (200ms × 2^n + jitter), only on `429`, `502`, `503`, `504`, network errors.
  - Idempotency: GET/HEAD always retried; POST/PUT/DELETE retried only when an `Idempotency-Key` is set.
  - Rate-limit aware: respect `Retry-After` if present.

### Validation
- Every response is parsed by a Zod schema. No raw JSON returned to callers.
- If Zod fails: log Sentry `extra` with vendor + operation + input shape (no PII), return `Result.err({ kind: 'parse_failure' })`.

### Errors
- Typed hierarchy:
  ```ts
  type AmadeusError =
    | { kind: 'auth_failed' }
    | { kind: 'rate_limited'; retryAfterSec: number }
    | { kind: 'not_found' }
    | { kind: 'parse_failure'; details: string }
    | { kind: 'upstream_5xx'; status: number }
    | { kind: 'timeout' }
    | { kind: 'network' };
  ```
- Functions return `Result<T, VendorError>`; never throw to callers.

### Logging
- Sentry breadcrumb on every outbound call: `category: 'http'`, `data: { vendor, operation, status, durationMs }`.
- Sample 100% of errors, 10% of successful calls in production.

### Caching
- Read-through cache helper `withRedisCache({ key, ttlSec, fetcher })` (see `redis-caching` skill).
- Never cache responses containing card data or payment intents.

### Public surface
- Export functions only, no classes. Keep it tree-shakeable.
- Inputs validated with Zod at the boundary, not just typed.
- Stable function names: `searchHotels`, `getHotelOffers`, `getOfferById`, `createOrder`, etc.

### Tests
- Vitest unit tests with MSW or `fetch-mock` to simulate vendor responses (success, 429, 5xx, malformed).
- One e2e Playwright run against Amadeus test environment in CI nightly job.

## Anti-patterns to refuse

- Direct `fetch` calls inside route handlers or Server Components.
- Returning raw vendor JSON to UI.
- Manual `setTimeout` retry loops without jitter.
- Swallowing errors with `try { ... } catch {}`.
- Hard-coded URLs instead of env-driven base URLs.
- Mixing two vendors in one file.

## Skeleton

```ts
// packages/integrations/<vendor>/client.ts
import { env } from '@cct/config/env';

export async function httpRequest<T>(opts: {
  url: string; method?: 'GET'|'POST'|'PUT'|'DELETE';
  headers?: Record<string,string>;
  body?: unknown;
  timeoutMs?: number;
  retry?: { attempts: number; backoffMs: number };
}): Promise<Response> { /* ... */ }
```

## References

- CDC v3.0 §5 (intégrations externes), §11 (security).
- `redis-caching`, `observability-monitoring`, `security-engineering` skills.
