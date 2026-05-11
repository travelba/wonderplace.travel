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

### URL structure (CDC §3.1) — décision : slug court flat

**Hotel detail URLs stay flat:** `/hotel/[slug]` (singular). We deliberately diverge from CDC §3.3 (`/hotels/[pays]/[ville]/[slug-hotel]`) — see [ADR-0008](../../../docs/adr/0008-url-structure-hotel-flat.md).

- Rationale: short slugs < 60 chars rank better on mobile SERPs (Moz Beginner's Guide 2025, Ahrefs slug study 2024), the `/destination/[city]` hub already plays the geo role, and ADR-0007 (ISR via client island) already builds on this path shape.
- Rooms become **child indexable pages** under the parent: `/hotel/[slug]/chambres/[room-slug]` — see [ADR-0009](../../../docs/adr/0009-hotel-room-subpages-indexable.md).
- Editorial deep paths (`/hotel/[slug]/spa`, `/restaurant`, `/evenements`) only open when the editorial team commits to ≥ 300 unique words and a dedicated FAQ block.

Conventions:

- Lowercase, accents stripped, kebab-case, max 60 chars per segment.
- FR root without prefix; EN under `/en/`. Other locales = V2/V3 (see i18n roadmap below).
- Slugs immutable post-publication. If renamed, the old slug becomes a 301.

### Room sub-pages (`/hotel/[slug]/chambres/[room-slug]`)

- One indexable page per **room type** (not per room number). Canonical points to itself, **never** to the parent hotel — they are distinct entities.
- Bidirectional internal linking is mandatory: the hotel page lists every room, and each room page links back to the hotel + sibling rooms.
- Excluded from `ItemList` JSON-LD on `/destination/[city]` (anti-cannibalisation). The only exception is **signature suites** (Cap-Eden-Roc Suite, Cheval Blanc Penthouse...) curated by Payload `is_signature: true`.
- Long-tail target: queries like "suite avec jacuzzi vue mer Cannes", "chambre familiale Disneyland", "junior suite Ritz Paris".
- Minimum unique content: 200 words description + 5 dedicated photos + filled `Offer` schema. Failing any of these → `noindex` until completed.

### i18n roadmap (CDC §3.4)

- **V1 (current)**: FR (default, no prefix) + EN (`/en/`). hreflang `fr-FR` + `en` + `x-default`.
- **V2 (planned)**: + ES + DE + IT for European reach.
- **V3 (planned)**: + AR (RTL — bidirectional CSS + RTL a11y tests) + ZH + JA for international.
- Each phase adds a column to Payload localized fields, a hreflang alternate, and a sitemap segment. Human translation only — no raw MT on narrative blocks. CDC §3.4 (8 langues) is **aspirational** and tracked as a roadmap, not a V1 requirement.

### Sitemaps

- Multi-sitemap: `sitemap.xml` index pointing to:
  - `sitemap-hotels.xml` — fiche hôtel canoniques
  - `sitemap-rooms.xml` — sous-pages chambres indexables (`/hotel/[slug]/chambres/[room-slug]`)
  - `sitemap-editorial.xml` — classements, sélections, comparatifs, articles, guides
  - `sitemap-hubs.xml` — `/destination/[city]`, pages régionales
  - `sitemap-guides.xml` — guides locaux "Que faire autour" (CDC §2.12)
  - `sitemap-pois.xml` — POIs et lieux référencés (CDC §2.7) si publiés indépendamment
- `<lastmod>` ISO-8601 with timezone on **every** URL.
- Maximum 50k URLs per sub-sitemap.

### Robots

- Allow (2026 standard): `Googlebot`, `Google-Extended`, `Bingbot`, `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Perplexity-User`, `ClaudeBot`, `anthropic-ai`, `Applebot`, `Applebot-Extended`.
- Disallow: known abusive scrapers, `/api/internal/*`, `/admin/*`, `/(account)/*`, `/(booking)/*`, `/monitoring/*` (Sentry tunnel).
- Sitemap reference: `Sitemap: https://conciergetravel.fr/sitemap.xml`.

### AggregateRating mapping (CDC §2.10 vs Schema.org)

- The CDC displays a **note /10** in the UI. Schema.org `AggregateRating` accepts any `bestRating`, **but Google Rich Results always renders /5 in SERPs** — there is zero SEO value in emitting `/10`.
- **JSON-LD always emits `bestRating: '5'`** mapped from Amadeus (`/5`) or Google Places (`/5`). If UI shows `/10`, conversion is explicit (`displayed = stored × 2`) and documented next to the badge.
- Never fabricate `ratingValue` or `reviewCount`. Both must come from a vendor with `reviewCount > 0`.

### Urgency indicators (anti-pattern — CDC §2.8 refused)

- The CDC §2.8 mentions "X personnes consultent / stock restant" indicators. **We refuse them** unless the data is verifiable from Amadeus (`offer.availability: 'LimitedAvailability'` with the actual remaining count). Display "Plus que X chambres" only when sourced from a real ARI call.
- Fabricated urgency = dark pattern under EU Digital Services Act (art. 25) and French DGCCRF — DGCCRF sanctioned Booking (2020) and the EU concluded Expedia/Tripadvisor inquiry on the same grounds (2023-2024). For an IATA-licensed travel agency, this is a real legal risk.
- Documented as a hard refusal in [hotel-detail-page rule](../../rules/hotel-detail-page.mdc).

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
- Room sub-page with canonical pointing to the parent hotel (would erase its own indexability).
- Fabricated urgency indicators ("X personnes consultent" without Amadeus signal).
- `bestRating: '10'` in `AggregateRating` JSON-LD (Google renders /5 anyway).
- Adding ES/DE/IT/AR/ZH/JA locales without going through the i18n roadmap (V1/V2/V3) — partial coverage is worse than honest scoping.

## References

- CDC v3.0 §6, §8 (cursor brief).
- Excel arborescence — anti-cannibalisation sheet, GEO sheet.
- `geo-llm-optimization`, `structured-data-schema-org`, `nextjs-app-router` skills.
