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

### JSON-LD pages MUST be `force-dynamic` (CSP nonce contract)

Any page emitting `<JsonLdScript>` (= every editorial, hotel, hub, home,
guide, classement, marque, categorie page) MUST be `force-dynamic`,
because the script's CSP nonce is per-request:

```ts
export const dynamic = 'force-dynamic'; // CSP nonce + Supabase admin fetches.
```

Re-introducing `revalidate = N` on such a page silently caches HTML
with `nonce=""` — the browser then refuses to execute the JSON-LD and
Google sees zero structured data. This regression was paid twice
(PR #56 hotel detail, PR #57 home). Reference:
`apps/web/src/components/seo/json-ld.tsx` (doc block) and
`structured-data-schema-org` §CSP-nonce-contract.

The Vercel CDN edge cache still mitigates the cost of `force-dynamic`
for editorial routes whose underlying data only changes on publish.

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

### Defensive upstream calls in static-prerendered routes

Every `page.tsx` / `route.ts` that runs at build time AND touches an
upstream service (Supabase, Algolia, Cloudinary admin) **must** wrap the
call so an outage degrades to an empty render rather than crashing the
build. Same contract as `generateStaticParams` returning `[]`.

The CI Build job and the first Vercel prerender both run with stub or
unreachable credentials. Without a try/catch, you get this opaque
failure that aborts the entire deploy:

```
Error occurred prerendering page "/llms.txt".
Error: supabaseUrl is required.
Export encountered an error on /llms.txt/route, exiting the build.
```

Pattern (try/catch over `.catch(() => [])` because TypeScript's strict
inference around `readonly T[]` and Promise overloads gets confused
otherwise):

```ts
export const revalidate = 3600;

export default async function ClassementsHubPage(...) {
  // Defensive: degrade to an empty hub when Supabase is unreachable.
  let rankings: readonly PublishedRankingCard[];
  try {
    rankings = await listPublishedRankings();
  } catch {
    rankings = [];
  }
  // ...
}
```

Applies symmetrically to route handlers (`route.ts`):

```ts
const [hotels, rankings] = await Promise.all([
  listPublishedHotelSummaries(50).catch(() => []),
  listPublishedRankings().catch(() => []),
]);
```

The `Promise.all + .catch(() => [])` form is fine when the consuming
code never re-uses the array in a position that triggers the
`readonly` inference issue. When it does (typically `Array.reduce<T>`
or property access on an inferred element), fall back to try/catch.

### Middleware matcher must list every top-level folder you want to bypass

`next-intl`'s middleware matcher uses a negative-lookahead alternation
to skip non-app routes. Every new top-level folder (`/sitemaps/*.xml`,
`/api/health`, `/.well-known/*`) must appear in the alternation, otherwise
the middleware rewrites it to `/fr/<path>` and the request 404s. Single
files (`sitemap.xml`, `robots.txt`) need their full filename; folders
need only the folder name without extension:

```ts
matcher: [
  '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps|llms.txt|llms-full.txt|.well-known|manifest.webmanifest|monitoring).*)',
];
```

Symptom of a missing entry: route handler exists, build log lists it as
prerendered (`○ /sitemaps/rankings.xml`), but production returns 404.

## Example: marketing page with ISR + JSON-LD + AEO

```tsx
// apps/web/src/app/[locale]/(marketing)/hotels/france/[region]/[city]/[hotel]/page.tsx
import { unstable_setRequestLocale } from 'next-intl/server';
import { getHotelBySlug } from '@/lib/data/hotels';
import { JsonLd } from '@cct/seo/jsonld';
import { hotelJsonLd, breadcrumbJsonLd } from '@cct/seo/jsonld/builders';
import { AeoBlock } from '@cct/ui/seo/AeoBlock';

export const revalidate = 21600; // 6h ISR per CDC §2.2

export async function generateMetadata({ params }) {
  /* ... */
}

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
- **`structured-data-schema-org`** — CSP nonce contract details for JSON-LD.
- **`security-engineering`** — full CSP3 policy + middleware.
- **`editorial-long-read-rendering`** — two-column layout, TOC sidebar pattern.
