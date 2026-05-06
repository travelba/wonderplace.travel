---
name: structured-data-schema-org
description: Schema.org JSON-LD builders for ConciergeTravel.fr (Hotel, LodgingBusiness, Offer, FAQPage, ItemList, Article, HowTo, BreadcrumbList, ProfilePage, AggregateRating, TravelAgency). Use whenever you add or modify a JSON-LD payload.
---

# Structured data (Schema.org) — ConciergeTravel.fr

Each page type carries one or more JSON-LD blocks per CDC v3.0 §6.4 and the Excel "Schema JSON-LD" sheet. Builders live in `packages/seo/jsonld/`.

## Triggers

Invoke when:
- Adding or changing a JSON-LD block on any page.
- Validating a builder against Google Rich Results / Schema.org.
- Mapping new Payload fields into structured data.

## Schema by page type

| Page type | Required schemas |
|---|---|
| Homepage | `WebSite` + `SearchAction` + `TravelAgency` + `BreadcrumbList` |
| Pillar `/hotels/france/` | `LodgingBusiness` (aggregator) + `BreadcrumbList` + `FAQPage` |
| Hub regional / city | `ItemList` (listing hotels) + `BreadcrumbList` |
| Hotel detail | `Hotel` + `Offer` + `AggregateRating` (Google) + `Review[]` (3 latest) + `BreadcrumbList` + `FAQPage` |
| Editorial classement / thematique | `ItemList` + `FAQPage` + `BreadcrumbList` + `Article` (with `author`, `datePublished`, `dateModified`) |
| Comparatif | `Article` + `FAQPage` + `BreadcrumbList` |
| Guide | `Article` + `FAQPage` + `HowTo` (where applicable) + `BreadcrumbList` |
| Author/team page | `ProfilePage[]` + `BreadcrumbList` |
| Methodology page | `Article` + `BreadcrumbList` |
| Loyalty landing | `Service` + `BreadcrumbList` |
| Agency `/agence/` | `TravelAgency` (`hasCredential: ["IATA","ASPST"]`) + `BreadcrumbList` |

## Non-negotiable rules

### Builders
- Pure functions in `packages/seo/jsonld/<schema>.ts`. No side effects.
- Input: a domain DTO. Output: typed JSON-LD object validated by Zod against a Schema.org subset.
- Render via `<JsonLd />` component (uses `<script type="application/ld+json">`).
- One JSON-LD block per `@type` per page; no block merging into a `@graph` unless multiple top-level types are necessary (then validate with Schema.org).

### Hotel
- `@type: "Hotel"` (not `Organization`) — fix per Excel "Plan d'action" item #3.
- Required: `name`, `description`, `starRating`, `address` (PostalAddress), `geo` (GeoCoordinates), `aggregateRating`, `review[]`, `amenityFeature[]`, `priceRange`, `checkinTime`, `checkoutTime`, `image[]`, `url`, `telephone`.
- `potentialAction: ReserveAction` linking to the booking step on the same page.

### Offer + PriceSpecification (CDC §6.4 + GEO sheet)
- Render only when an offer is currently available (after Amadeus availability call).
- Fields: `priceSpecification`, `priceCurrency: 'EUR'`, `validFrom`, `validThrough`, `availability: 'InStock'|'LimitedAvailability'|'OutOfStock'`, `seller: TravelAgency`.

### AggregateRating
- For hotel detail: from Google Reviews (`google_rating`, `google_reviews_count`).
- For classements: aggregate of selected hotels with `bestRating: '5'`, `worstRating: '1'`.

### FAQPage
- Use `@type: 'FAQPage'`, mainEntity Q/A pairs.
- 5 Q&A on classements / sélections / comparatifs / guides; 5 on hotel detail.
- Each `Question.name` < 100 chars; `acceptedAnswer.text` 40–80 words.

### BreadcrumbList — TOUTES pages
- Mandatory; rendered both visually and as JSON-LD.
- Builder takes `[{ name, url }, ...]`.

### Article
- Used on guides, comparatifs, methodology.
- Required: `headline`, `author` (sameAs ProfilePage URL), `datePublished`, `dateModified`, `publisher` (TravelAgency), `image`.
- `dateModified` synced with Payload `last_updated` and visible UI.

### HowTo
- For "comment réserver", "choisir un palace": `step[]` with `HowToStep` items.

### TravelAgency
- `hasCredential: ['IATA', 'ASPST']` (treated as text references; enriched via `Credential` Schema.org if relevant).
- `areaServed: 'FR'`, with phase 2 expansion later.

### ProfilePage
- For each editorial author: `name`, `jobTitle`, `knowsAbout`, `alumniOf`, `sameAs` (LinkedIn), `description` 200 words.

## Validation

- All builders produce a Zod-validated object. Tests assert against Google Rich Results sample requirements where possible.
- CI step: run a script that fetches a sample of each page type and validates JSON-LD with `schema-dts` types.

## Anti-patterns to refuse

- Using `@type: 'Organization'` on a hotel.
- Embedding HTML in JSON-LD strings (use plain text).
- Static AggregateRating with fake counts.
- Reviews fabricated or older than 24 months.
- Missing `dateModified` on guides/articles.

## References

- CDC v3.0 §6.4.
- Excel "Schema JSON-LD" sheet.
- Google Search Central — Structured Data docs.
- `seo-technical`, `geo-llm-optimization`, `content-modeling` skills.
