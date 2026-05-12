---
name: security-engineering
description: Security engineering rules for ConciergeTravel.fr (RLS, secrets, CSP, CSRF, rate limiting, PII, GDPR, audit logging). Use whenever you handle user input, secrets, headers, third-party calls, or sensitive data.
---

# Security engineering — ConciergeTravel.fr

Cahier des charges §11 sets contractual requirements: payment delegated to Amadeus, RLS enforced, role-based access, server-side input validation, env-only secrets, journaled sensitive calls, abuse protection.

## Triggers

Invoke when:

- Reading any secret or env variable.
- Adding any HTTP route, server action, or webhook.
- Touching headers, CSP, CORS, cookies.
- Storing or logging user data.
- Adding a third-party SDK to the client bundle.

## Non-negotiable rules

### Secrets management

- All secrets in `.env.local` (dev) and Vercel project env (prod). Never committed.
- `.env.example` documents every required variable.
- Validation at boot via `t3-env` in `packages/config/env`. Boot fails if missing/invalid.
- Server-only secrets (`*_SECRET`, `*_SERVICE_ROLE_KEY`, `*_API_KEY`) split from `NEXT_PUBLIC_*` and never imported in client components (enforced by lint).

### Input validation

- Every server action / route handler validates input with Zod at the boundary.
- File uploads: type, size, magic-byte check. Stored in Cloudinary signed-uploads only.

### Output encoding

- React handles encoding by default. Never use `dangerouslySetInnerHTML` except for trusted JSON-LD scripts.
- Markdown / Portable Text from Payload sanitized via `rehype-sanitize` before render.

### Headers (configured in `apps/web/next.config.ts` + middleware)

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy`: nonce-based for scripts; allow Amadeus payment iframe origin, Cloudinary, Algolia, Sentry tunnel, Brevo tracking pixel (only in marketing emails, not on site).
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` (geolocation for "near me" search if implemented).
- `X-Frame-Options: DENY` except payment route which allows Amadeus iframe via CSP `frame-src`.

### CSRF

- Server Actions use Next.js built-in origin checks; we additionally set `SameSite=Lax` on auth cookies and `SameSite=Strict` on sensitive admin cookies.
- Webhooks validate HMAC signatures.

### Rate limiting

- Public search/comparator/login endpoints behind `@upstash/ratelimit` (cf. `redis-caching`).

### PII and GDPR

- Minimum data principle: store only what's necessary to fulfill the booking and loyalty program.
- Email and phone tagged as PII, redacted in logs (`pino` redact paths).
- Right to erasure: dedicated server action wipes profile + anonymizes bookings (replace identifiers with hash, keep aggregated stats).
- Cookies: only essential cookies pre-consent. Marketing cookies behind a CMP banner (Phase 9 if marketing tracking is enabled).

### Audit logging

- Sensitive admin actions (cancel booking, refund, edit hotel publication state) emit an `audit_logs` row: `actor_id`, `action`, `target_type`, `target_id`, `ip`, `user_agent`, `timestamp`, `payload_hash`.
- Read-only access via Payload, exportable for legal.

### Dependencies

- `pnpm audit` and Dependabot enabled.
- No deprecated cryptographic primitives. Hashing uses `argon2id` (auth managed by Supabase) or `crypto.subtle` for HMAC.

### Anti-bot

- hCaptcha or Turnstile on the booking-request-email and signup forms (deferred to Phase 7 if abuse observed in MVP).
- Honeypot field on public forms.

### Webhooks

- HMAC validated using `crypto.timingSafeEqual`.
- Replay protection via timestamp tolerance ±5 min and nonce stored in Redis 10 min.

## Anti-patterns to refuse

- Using the Supabase service role key in client code.
- Setting `dangerouslySetInnerHTML` from a vendor JSON without sanitization.
- Logging full request bodies.
- Disabling `X-Frame-Options` globally because of a single iframe need.
- Reusing the same `Idempotency-Key` for two different operations.
- Trusting `request.headers['x-forwarded-for']` without provider whitelisting (Vercel sets it).

## References

- CDC v3.0 §11 (security and compliance).
- OWASP ASVS 4.0 (selected level 2 controls).
- `auth-role-management`, `redis-caching`, `payment-orchestration` skills.
