---
name: performance-engineering
description: Performance engineering rules for ConciergeTravel.fr (Core Web Vitals, image optimization, fonts, code splitting, edge runtime). Use when you ship UI, add dependencies, or change build/runtime configuration.
---

# Performance engineering — ConciergeTravel.fr

The cahier des charges sets **contractual Core Web Vitals targets** (CDC v3.0 §9.2):

| Metric                          | Target                                        |
| ------------------------------- | --------------------------------------------- |
| LCP (Largest Contentful Paint)  | **< 2.0 s** mobile 4G                         |
| CLS (Cumulative Layout Shift)   | **< 0.05** all pages                          |
| INP (Interaction to Next Paint) | **< 200 ms** mobile                           |
| TTFB (Time to First Byte)       | **< 600 ms** Vercel Edge                      |
| PageSpeed Insights              | **> 90 mobile / > 95 desktop** on hotel pages |

These targets are validated in CI via Lighthouse CI on 5 strategic pages: homepage, regional hub, hotel detail, classement, booking tunnel.

## Triggers

Invoke when:

- Adding any new dependency (audit bundle impact).
- Adding fonts, images, or media.
- Touching `next.config.ts`, image config, runtime config.
- Building a heavy component (gallery, map, carousel).
- Suspecting a regression on Core Web Vitals.

## Non-negotiable rules

### Images

- **Always** Next.js `<Image>` with explicit `width` and `height` (or `fill` + sized parent) to prevent CLS.
- Above-the-fold hero on hotel page uses `priority` and AVIF/WebP via `next.config.ts` `images.formats`.
- Cloudinary URLs go through `loaderFile` in `next.config.ts`; serve `f_auto,q_auto` and responsive widths.
- Lazy-load galleries with `loading="lazy"` and `decoding="async"` (default on `<Image>`).

### Fonts

- `next/font/google` with `display: 'swap'` and `subsets: ['latin']` for serif title font and sans body font.
- Preload only the body font; serif title font is fine non-preloaded.
- No FOIT, no FOUT — `swap` strategy.

### JavaScript

- Server Components by default; only interactive widgets are `'use client'`.
- Lazy-load heavy client islands with `next/dynamic` and `ssr: false` only when truly client-only (e.g. Amadeus Payment iframe wrapper).
- Bundle audit on PR: `pnpm dlx @next/bundle-analyzer` script wired in.
- No CommonJS-only deps if an ESM alternative exists.

### Caching

- Marketing/editorial: ISR per matrix (24h pillar/editorial, 12h hubs, 6h hotel) with `revalidateTag` for granular invalidation.
- API routes for ARI: 3-level Redis cache (cf. `redis-caching`).
- HTTP cache headers on dynamic OG images: `Cache-Control: public, max-age=31536000, immutable`.

### Streaming

- Wrap independent server fetches in `<Suspense>` so initial paint doesn't wait on Amadeus.
- Skeletons must reserve exact pixel space (no CLS).

### Third-party scripts

- Loaded with `next/script` `strategy="afterInteractive"` (analytics) or `strategy="lazyOnload"` (non-critical).
- Sentry: client SDK loaded with care (replay disabled by default; tunneled via `/monitoring/sentry-tunnel`).

### Edge runtime

- Use `export const runtime = 'edge'` for lightweight route handlers (auth callbacks, robots, llms.txt) — but NOT for handlers calling Supabase Auth admin or Sentry server SDK.

## Anti-patterns to refuse

- `<img>` without dimensions.
- Importing a date/i18n library that adds 200kb of locales (use date-fns selective imports or Intl native).
- Loading Google Tag Manager or analytics on the booking tunnel.
- Marking marketing pages as `force-dynamic`.
- `'use client'` on entire pages because of one interactive button.
- Inline styles built dynamically from props (CSS-in-JS at runtime) on hot paths — use Tailwind classes / static CSS.

## CI gates

- `pnpm typecheck` and `pnpm lint` block PRs.
- Lighthouse CI on 5 strategic URLs blocks PR if any target fails.
- Bundle size budget per route in `apps/web/next.config.ts`.

## References

- CDC v3.0 §9.1, §9.2.
- web.dev Core Web Vitals.
- `nextjs-app-router`, `redis-caching`, `responsive-ui-architecture` skills.
