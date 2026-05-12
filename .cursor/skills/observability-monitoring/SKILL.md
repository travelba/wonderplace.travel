---
name: observability-monitoring
description: Observability stack for ConciergeTravel.fr (Sentry, structured logs with pino, Vercel Analytics, Web Vitals, alerts, dashboards). Use whenever you add error handling, logs, custom metrics, or alert configuration.
---

# Observability and monitoring — ConciergeTravel.fr

Per CDC v3.0 §2, monitoring is **Sentry** with **Datadog optional in Phase 2**. The MVP uses Sentry for errors + tracing, pino for structured logs, Vercel Analytics + Web Vitals for runtime, and basic alerts.

## Triggers

Invoke when:

- Adding error handling code paths.
- Adding logs anywhere on the server.
- Wiring tracing or transactions.
- Configuring sample rates, source maps, releases.
- Defining alerts.

## Stack

| Tool             | Use                       | Path                                                                      |
| ---------------- | ------------------------- | ------------------------------------------------------------------------- |
| Sentry           | Errors, tracing, releases | `apps/web/src/sentry.{client,server,edge}.config.ts` and `apps/admin/...` |
| pino             | Structured logs (server)  | `packages/observability/logger.ts`                                        |
| Vercel Analytics | RUM, page views           | `apps/web/src/app/layout.tsx`                                             |
| Web Vitals       | LCP/CLS/INP/TTFB          | `packages/observability/web-vitals.ts`                                    |
| Sentry Tunnel    | CSP-friendly client SDK   | `apps/web/src/app/monitoring/sentry-tunnel/route.ts`                      |

## Non-negotiable rules

### Sentry

- Client + Server + Edge configs (`@sentry/nextjs`).
- DSN read from env. Different envs: `dev`, `preview`, `production` via `SENTRY_ENV`.
- **Source maps** uploaded in CI on every release; PII scrubbing on by default.
- Release version = git SHA injected at build (`SENTRY_RELEASE`).
- Sample rates:
  - Errors: 100% in all envs.
  - Performance: 20% production, 100% dev.
  - Replay: 0% by default (opt-in for specific reproductions).
- Sensitive data scrubbing: `beforeSend` strips `email`, `phone`, `card_*` (must be empty anyway), `authorization`, `cookie`.

### Logging (pino)

- Server logs only; client logs go to Sentry breadcrumbs.
- Single logger instance with redaction paths (`req.headers.authorization`, `*.email`, `*.phone`).
- Levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.
- Log shape: `{ level, time, msg, requestId, userId?, vendor?, operation?, durationMs? }`.
- `requestId` propagated through `nanoid` per request (set in middleware, attached to `headers().get('x-request-id')`).

### Web Vitals

- `reportWebVitals` posts to `/api/metrics/web-vitals` (server endpoint persisting to Vercel Analytics + Sentry custom measurements).
- Track LCP, CLS, INP, TTFB, FCP per route.

### Tracing

- Sentry transactions wrap every server action and route handler automatically via `@sentry/nextjs` instrumentation.
- Custom spans for vendor calls (Amadeus search, Little availability, Makcorps): `Sentry.startSpan({ name: 'amadeus.searchHotels', op: 'http.client' }, ...)`.

### Alerts (Sentry)

- New error type in `apps/web` production → Slack `#alerts-cct`.
- Error rate > 1% on `/reservation/*` for 5 min → page on-call.
- Web Vitals regression: median LCP > 2.5s for 1h on hotel pages → Slack.

### Health checks

- `/api/health` returns `{ ok: true, deps: { supabase, redis, algolia, amadeus } }` with parallel pings (timeouts 1s each).
- Used by Vercel external monitors and StatusCake (Phase 2 optional).

### Datadog (optional, Phase 2)

- Behind feature flag `DATADOG_ENABLED`. RUM SDK lazy-loaded for high-traffic pages only.

## Anti-patterns to refuse

- `console.log` in server code (use the logger).
- Logging request bodies in plain text.
- Adding Sentry breadcrumbs containing PII (email, phone, address full).
- Synchronous logging on hot paths.
- Unsampled performance traces in production (cost + noise).

## References

- CDC v3.0 §2 (monitoring stack), §11 (audit logging).
- `security-engineering`, `api-integration`, `cicd-release-management` skills.
