---
name: auth-role-management
description: Supabase Auth + RBAC integration for ConciergeTravel.fr (customer / editor / operator / admin / seo). Use when implementing auth flows, middleware, server actions requiring auth, role checks, or RLS policy claims.
---

# Auth and role management — ConciergeTravel.fr

Authentication is **Supabase Auth** (CDC §2). The app uses `@supabase/ssr` for Next.js 15 App Router cookie-based sessions. Role-based access is layered: **app-level guards** + **RLS policies** referencing JWT custom claims.

## Triggers

Invoke when:

- Adding or modifying any auth flow (signup, login, password reset, OAuth, magic link).
- Wiring `middleware.ts` for protected routes.
- Adding a server action or route handler that must enforce role.
- Defining a new role or claim.
- Editing `app_metadata.role` claim or RLS policies that reference it.

## Roles

| Role       | Description                     | Access scope                                                                    |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------- |
| `customer` | Public registered user          | Own bookings, own loyalty, own profile                                          |
| `editor`   | Editorial team                  | Editorial pages, FAQs, hotels content (no bookings)                             |
| `seo`      | SEO/GEO operator                | Editorial + redirects + sitemap config                                          |
| `operator` | Reservations / customer support | Bookings, booking_requests_email, loyalty members                               |
| `admin`    | Full access                     | All resources, including RLS service role-equivalent operations through Payload |

Roles are stored in `auth.users.app_metadata.role` (server-set only — clients never write `app_metadata`). Custom JWT claim mirror set via Supabase trigger so RLS policies can read `auth.jwt() ->> 'role'`.

## Non-negotiable rules

### Server-side first

- All session reading goes through `apps/web/src/lib/supabase/server.ts` (cookie-based, RSC-safe).
- Client-side Supabase client is read-only (no privileged calls).
- Service role key (`SUPABASE_SERVICE_ROLE_KEY`) is loaded **only** in server-only modules and never imported in components.

### Middleware

- `middleware.ts` mounts `next-intl` first, then a Supabase session refresher (`updateSession`).
- Protected route segments: `/(account)/**` requires `customer`+; `/admin/**` (Payload) requires editor+ via Payload's own auth.
- Redirect rules preserve `next` query for post-login return.

### Server Actions guards

- Helper `requireUser({ role?: AppRole })` wraps actions:
  ```ts
  const { user } = await requireUser({ role: 'operator' });
  ```
- Returns typed `Result` on failure; redirects to login if no session.

### RLS claim usage

- Policies use `auth.jwt() ->> 'role'` for editor/operator/admin checks.
- Customer policies use `auth.uid()` matching `user_id`.
- Anonymous reads only on published rows.

### Password policy

- Minimum 12 chars, breach-checked via Supabase Auth password strength (HaveIBeenPwned integration enabled).
- 2FA optional for `customer`, mandatory for `admin`/`operator` (TOTP). Enforced server-side via `aal` JWT claim check.

### Session

- 24h refresh; sliding window. Sensitive actions (cancel booking, view payment ref) require AAL2 if 2FA enabled, or recent sign-in (< 15 min) otherwise.

## Auth flows

- **Signup**: email + password + acceptance terms checkbox + optional newsletter consent. Email verification required before booking.
- **Login**: email/password. Magic link as secondary option. OAuth Google as deferred Phase 2 — not in MVP.
- **Reset**: standard Supabase reset flow with locale-specific Brevo template.
- **Account linking**: optional; out of MVP scope.

## Anti-patterns to refuse

- Reading session via client-side `supabase.auth.getUser()` to gate UI without server validation.
- Storing role in localStorage / cookies set by client.
- Using `app_metadata` from the client.
- Inline `if (user.email === 'admin@...')` checks.
- Writing RLS policies that trust `request.headers.x-role` or any client-supplied value.

## Example: server action with guard

```ts
// apps/web/src/app/[locale]/(account)/compte/reservations/actions.ts
'use server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { cancelBooking } from '@cct/integrations/amadeus';

const Input = z.object({ bookingRef: z.string() });

export async function cancelBookingAction(formData: FormData) {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' };

  const { user } = await requireUser({ role: 'customer' });
  return cancelBooking({ bookingRef: parsed.data.bookingRef, userId: user.id });
}
```

## References

- CDC v3.0 §11 (security), §8 (loyalty implies auth).
- `supabase-postgres-rls`, `security-engineering`, `backoffice-cms` skills.
