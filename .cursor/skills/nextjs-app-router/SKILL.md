---
name: nextjs-app-router
description: Next.js 15 App Router patterns and conventions for ConciergeTravel.fr. Use whenever you create or modify routes, layouts, server actions, route handlers, metadata, fetch caching, revalidation tags, or middleware.
---

# Next.js 15 App Router — ConciergeTravel.fr

We use **Next.js 15 App Router** with **React 19 Server Components by default**. Every change must respect the contractual rendering matrix (cf. `product-architecture` skill).

## Triggers

Invoke when:
- Creating any `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `opengraph-image.tsx`.
- Writing a Server Action.
- Tweaking caching behavior (`fetch` options, `revalidateTag`, `revalidatePath`, `unstable_cache`).
- Touching `middleware.ts` or `next.config.ts`.

## Non-negotiable rules

### Server Components by default
- No `'use client'` unless interactivity, browser API, or hooks are required.
- Heavy editorial pages (hubs, fiches, guides) must be RSC and stream where possible.

### Caching directives
- Marketing/editorial pages: `export const revalidate = N` matching the matrix (24h pillar/editorial, 12h hubs, 6h hotel pages).
- Booking tunnel + search results: `export const dynamic = 'force-dynamic'` and **no fetch caching**.
- API route handlers calling Amadeus availabilities: respect Redis 3-level cache (cf. `redis-caching` skill).
- Use `revalidateTag('hotel:<slug>')`, `revalidateTag('editorial:<slug>')`, `revalidateTag('hub:<region>')` from Payload `afterChange` hooks. **No raw `revalidatePath` from CMS** — tags only, scoped.

### Metadata
- Every page must export `generateMetadata` (or static `metadata`) producing: `title`, `description`, `alternates.canonical`, `alternates.languages` (FR/EN hreflang), `openGraph`, `twitter`, `robots`.
- Robots rules: marketing/editorial = `index,follow`; booking tunnel/account = `noindex,nofollow`.

### Server Actions
- Wrap with **Zod validation** at the entry. No untrusted client input passes without parse.
- Return discriminated unions: `{ ok: true; data } | { ok: false; error }`. No throws.
- Never call vendor APIs (Amadeus, Brevo, etc.) directly: go through `packages/integrations`.

### Internationalization
- `next-intl` middleware mounted in `middleware.ts`. Default locale `fr` without prefix; `en` prefixed.
- All page params include `[locale]`. Read locale via `unstable_setRequestLocale(locale)` at top of each page/layout.

### Streaming, suspense, parallel routes
- Wrap independent data fetches in `<Suspense>` with skeleton fallbacks.
- Use parallel routes (`@modal`, `@side`) for booking confirmation modals or hotel galleries when it improves UX.

## File conventions

- Route segment groups: `(marketing)`, `(booking)`, `(account)`. Groups don't impact URL but isolate layouts.
- `loading.tsx` mandatory for any segment that does I/O.
- `error.tsx` mandatory for any user-facing segment with potential vendor errors.
- `not-found.tsx` per segment, surfaces `<NotFoundEditorial />` from `packages/ui`.

## Anti-patterns to refuse

- Using `getServerSideProps` (Pages Router) — we are **App Router only**.
- Sprinkling `'use client'` to "make it work".
- Calling `fetch(...)` with `next: { revalidate: 0 }` on a marketing page (breaks ISR).
- Side effects (mutations) inside Server Components — only Server Actions or route handlers can mutate.
- Leaking secrets to client by reading `process.env.SECRET` inside a client component.
- Bypassing `next-intl` to hardcode FR strings in JSX.

## Example: marketing page with ISR + JSON-LD + AEO

```tsx
// apps/web/src/app/[locale]/(marketing)/hotels/france/[region]/[city]/[hotel]/page.tsx
import { unstable_setRequestLocale } from 'next-intl/server';
import { getHotelBySlug } from '@/lib/data/hotels';
import { JsonLd } from '@cct/seo/jsonld';
import { hotelJsonLd, breadcrumbJsonLd } from '@cct/seo/jsonld/builders';
import { AeoBlock } from '@cct/ui/seo/AeoBlock';

export const revalidate = 21600; // 6h ISR per CDC §2.2

export async function generateMetadata({ params }) { /* ... */ }

export default async function HotelPage({ params: { locale, region, city, hotel } }) {
  unstable_setRequestLocale(locale);
  const data = await getHotelBySlug({ slug: hotel, locale });
  if (!data) notFound();

  return (
    <>
      <JsonLd schema={hotelJsonLd(data)} />
      <JsonLd schema={breadcrumbJsonLd(data.breadcrumbs)} />
      <AeoBlock>{data.aeoAnswer}</AeoBlock>
      <HotelDetail hotel={data} />
    </>
  );
}
```

## References

- Next.js 15 App Router docs.
- CDC v3.0 §2.2 (rendering), §6 (SEO/GEO), §9 (mobile-first).
- `seo-technical`, `redis-caching`, `responsive-ui-architecture` skills.
