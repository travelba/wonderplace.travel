---
name: product-architecture
description: High-level product architecture decisions for ConciergeTravel.fr. Use whenever you introduce a new bounded context, change a layer boundary, add a top-level package, or alter the rendering strategy (SSG/ISR/SSR) of a route.
---

# Product architecture — ConciergeTravel.fr

ConciergeTravel.fr is structured in **four functional layers** (cahier des charges v3.0 §5):

1. **Editorial layer** (SEO/GEO) — pillar, regional/city hubs, hotel pages, classements, thematic, comparatives, guides, E-E-A-T.
2. **Booking layer** — search, real-time results, offer detail, guest collection, native cancellation policy display, Amadeus Payment, confirmation, post-booking.
3. **Loyalty layer** — tier FREE auto-activated on first booking (Little catalog), tier PREMIUM prepared in data model and UI.
4. **Administration layer** — Payload CMS back-office for hotels, content, FAQs, bookings, email requests, loyalty, reporting, Google Reviews sync.

## Triggers

Invoke this skill when:

- Adding a new top-level folder under `apps/`, `packages/`, or `docs/`.
- Changing rendering strategy of any route (SSG ↔ ISR ↔ SSR).
- Crossing a layer boundary (e.g. editorial code calling booking internals directly).
- Introducing or removing a bounded context inside `packages/domain/`.

## Non-negotiable rules

- **No shortcut between layers**. Editorial UI must never call Amadeus directly. Booking UI must never read Payload collections directly. All cross-layer calls go through `packages/domain/` services.
- **Rendering matrix is contractual** (CDC §2.2):
  - Pillar `/hotels/france/` → **SSG + ISR 24h**.
  - Regional/city hubs → **SSG + ISR 12h**.
  - Hotel detail page (no dates) → **SSG + ISR 6h**.
  - Editorial pages (classements, thématiques, guides) → **SSG + ISR 24h**.
  - Search results with dates → **SSR no cache**.
  - Booking tunnel → **SSR no cache**.
  - API routes ARI / availabilities → **SSR + Redis cache (3 levels, see redis-caching skill)**.
- **No deviation from rendering matrix** without writing an ADR in `docs/adr/`.
- **Pages publishable without redeploy** — the back-office must be able to publish a hotel or editorial page through `revalidateTag`/`revalidatePath` only.
- **Mobile-first is contractual**: every template starts at 375px, then desktop. PageSpeed Mobile > 90 on 5 strategic pages, LCP < 2.0s, CLS < 0.05, INP < 200ms.

## Folder ownership

| Concern                | Owner package                           | Forbidden imports                                             |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Public marketing pages | `apps/web/src/app/[locale]/(marketing)` | direct Amadeus client, Payload CMS internals                  |
| Booking tunnel         | `apps/web/src/app/[locale]/(booking)`   | Payload, editorial helpers                                    |
| Account pages          | `apps/web/src/app/[locale]/(account)`   | Payload, integrations layer                                   |
| Domain logic           | `packages/domain/<context>`             | React, Next.js, Supabase client, fetch                        |
| Integrations           | `packages/integrations/<vendor>`        | React, domain (one-way: domain ← integrations via interfaces) |
| SEO/GEO                | `packages/seo`                          | direct vendor calls                                           |
| Back-office            | `apps/admin`                            | front public components                                       |

## Anti-patterns to refuse

- Calling `fetch('https://api.amadeus.com/...')` directly from a Server Component.
- Importing Payload collections from `apps/web`.
- Adding ad-hoc API routes that duplicate logic in `packages/integrations/`.
- Passing raw vendor responses to the UI without normalization in the domain layer.
- Marking a marketing page as `export const dynamic = 'force-dynamic'` to "fix" something — that breaks SEO and ISR.

## References

- Cahier des charges v3.0 §2.2 (rendering matrix), §5 (architecture produit), §11 (security).
- `docs/01-architecture.md`
- ADRs: `docs/adr/0001-stack.md`, `docs/adr/0002-monorepo-turborepo.md`
