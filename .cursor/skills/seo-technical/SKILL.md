---
name: seo-technical
description: Technical SEO rules for ConciergeTravel.fr (metadata, hreflang, canonical, sitemaps, robots, ISR, indexability, anti-cannibalisation). Use for any change touching metadata, URL structure, redirects, or indexing signals.
---

# Technical SEO — ConciergeTravel.fr

SEO is **a platform-level concern, not an after-thought** (CDC v3.0 §6, §8 of the Cursor brief). The site competes against the official hotel websites and must out-rank them.

## Triggers

Invoke when:
- Adding or editing any page metadata.
- Touching `sitemap.xml`, `robots.txt`, hreflang, canonical, redirects.
- Adding a route that may compete with an existing one (review the anti-cannibalisation matrix).
- Modifying `revalidate` values.

## Non-negotiable rules

### Metadata baseline (every page)
- Unique `<title>`: 50–60 chars max; pattern `<intent> · <local> | ConciergeTravel`.
- Unique `<meta description>`: 140–160 chars.
- `<link rel="canonical">` always set; never points to a redirect target.
- `<link rel="alternate" hreflang="fr-FR">` and `<link rel="alternate" hreflang="en">` plus `x-default` (defaults to `fr-FR`).
- Open Graph (`og:title`, `og:description`, `og:image`, `og:type`, `og:locale`) and Twitter Cards.
- `og:image` dynamic via `opengraph-image.tsx` per route segment.

### URL structure (CDC §3.1)
- Lowercase, accents stripped, kebab-case, max 60 chars per segment.
- FR root without prefix; EN under `/en/`.
- Slugs immutable post-publication. If renamed, the old slug becomes a 301.

### Sitemaps
- Multi-sitemap: `sitemap.xml` index pointing to `sitemap-hotels.xml`, `sitemap-editorial.xml`, `sitemap-hubs.xml`, `sitemap-guides.xml`.
- `<lastmod>` ISO-8601 with timezone on **every** URL.
- Maximum 50k URLs per sub-sitemap.

### Robots
- Allow: `Googlebot`, `Googlebot-Extended`, `Bingbot`, `GPTBot`, `PerplexityBot`, `ClaudeBot`, `anthropic-ai`, `Applebot`, `Applebot-Extended`.
- Disallow: known abusive scrapers, `/api/internal/*`, `/admin/*`, `/(account)/*`, `/(booking)/*`.
- Sitemap reference: `Sitemap: https://conciergetravel.fr/sitemap.xml`.

### Indexability per segment
- Marketing/editorial → `index, follow`.
- Booking tunnel + account → `noindex, nofollow`.
- Search results page (`/recherche`) → `noindex, follow` (can crawl categorical links, do not index parameterized URLs).
- Pagination/filter combos → `noindex, follow` with `rel=prev/next` deprecated; we'll rely on canonical to the unparameterized list.

### Anti-cannibalisation (Excel matrix)
- `selection/lune-de-miel/` 301 → `selection/romantiques-et-lune-de-miel/`.
- `selection/ski/` 301 → `selection/montagne/`.
- `selection/plage-privee/` 301 → `selection/bord-de-mer-et-plage/`.
- `selection/thalasso/` and `selection/vignobles/` remain as **child pages** of their parents, not separate piliers.
- `classement/plus-beaux/` (esthétique) and `classement/meilleurs/` (note/service) coexist with **strongly differentiated H1 + intro**.

### Internal linking
- Bidirectional: a hotel page links to its hub, and the hub links back. No orphans.
- A `<RelatedLinks />` component requires explicit pillar/parent/children inputs to render — empty arrays trigger a build warning.
- Breadcrumbs visible + JSON-LD on every page.

### ISR contract
- Marketing/editorial revalidate per the rendering matrix (cf. `nextjs-app-router`).
- `revalidateTag('hotel:<slug>')`, `revalidateTag('editorial:<slug>')` from Payload `afterChange`.

### Redirects
- All historical 301s tracked in `redirects` table (Payload-managed) and projected into `next.config.ts` at build time.
- Redirect status is always 301 unless temporarily 302 (must be commented).

## Anti-patterns to refuse

- Returning HTML 200 from a non-existent slug ("soft 404").
- Pages with the same `<title>` and intent as another (cannibalisation).
- Missing canonical or hreflang.
- Hash-bang URLs.
- Duplicate `<h1>`.
- `noindex` inadvertently set on a marketing template.

## References

- CDC v3.0 §6, §8 (cursor brief).
- Excel arborescence — anti-cannibalisation sheet, GEO sheet.
- `geo-llm-optimization`, `structured-data-schema-org`, `nextjs-app-router` skills.
