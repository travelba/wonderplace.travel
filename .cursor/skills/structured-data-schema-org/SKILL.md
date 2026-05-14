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

| Page type                                                | Required schemas                                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage                                                 | `WebSite` + `SearchAction` + `TravelAgency` + `BreadcrumbList` + `FAQPage` (AEO block)                                                                                                                   |
| Pillar `/hotels/france/`                                 | `LodgingBusiness` (aggregator) + `BreadcrumbList` + `FAQPage`                                                                                                                                            |
| Hub regional / city `/destination/[city]`                | `ItemList` (listing hotels) + `BreadcrumbList` + `Place` (city geo)                                                                                                                                      |
| Hotel detail `/hotel/[slug]`                             | `Hotel` + `Place` + `GeoCoordinates` + `Offer[]` + `AggregateRating` + `Review[]` (3 latest) + `BreadcrumbList` + `FAQPage` + `ImageObject[]` (≥ 30) + `VideoObject` (if available) + `Award[]` (if any) |
| Hotel room sub-page `/hotel/[slug]/chambres/[room-slug]` | `Room` (or `HotelRoom`) + `Offer` + `Hotel` (parent via `isPartOf`) + `BreadcrumbList` + `ImageObject[]` (≥ 5)                                                                                           |
| Editorial classement / thematique                        | `ItemList` + `FAQPage` + `BreadcrumbList` + `Article` (with `author`, `datePublished`, `dateModified`)                                                                                                   |
| Comparatif                                               | `Article` + `FAQPage` + `BreadcrumbList`                                                                                                                                                                 |
| Guide local "Que faire autour"                           | `Article` + `FAQPage` + `HowTo` (where applicable) + `BreadcrumbList` + `Place[]` (POIs cités)                                                                                                           |
| Author/team page                                         | `ProfilePage[]` + `BreadcrumbList`                                                                                                                                                                       |
| Methodology page                                         | `Article` + `BreadcrumbList`                                                                                                                                                                             |
| Loyalty landing                                          | `Service` + `BreadcrumbList`                                                                                                                                                                             |
| Agency `/agence/`                                        | `TravelAgency` (`hasCredential: ["IATA","ASPST"]`) + `BreadcrumbList`                                                                                                                                    |

## Non-negotiable rules

### Builders

- Pure functions in `packages/seo/jsonld/<schema>.ts`. No side effects.
- Input: a domain DTO. Output: typed JSON-LD object validated by Zod against a Schema.org subset.
- Render via `<JsonLdScript data={…} nonce={…} />` (uses `<script type="application/ld+json">`).
- One JSON-LD block per `@type` per page; no block merging into a `@graph` unless multiple top-level types are necessary (then validate with Schema.org).

### CSP nonce contract — non-negotiable (paid for twice: PR #56, #57)

The site runs under a strict CSP3 policy:

```
script-src 'self' 'nonce-{nonce}' 'strict-dynamic'
```

There is **no `'unsafe-inline'` fallback in production**. Any
`<script type="application/ld+json">` without the per-request nonce is
silently dropped by the browser → zero rich results indexed.

The contract this codifies:

1. **Read the nonce at the page boundary, once**, via `headers()`:

   ```ts
   const nonce = (await headers()).get('x-nonce') ?? undefined;
   ```

2. **Pass it explicitly** as a `nonce` prop to every `JsonLdScript` on the page. NEVER call `headers()` inside the JsonLdScript leaf — earlier versions did and it caused `DYNAMIC_SERVER_USAGE` 500s.
3. **The page MUST be `force-dynamic`.** Calling `headers()` already
   marks the route dynamic; the explicit `export const dynamic = 'force-dynamic'`
   keeps the contract grep-able and prevents a future ISR re-enable
   from silently stripping the nonce.
4. **Never** emit a raw `<script>` tag — always wrap with the shared
   `<JsonLdScript />` component (`apps/web/src/components/seo/json-ld.tsx`).

Reference: `apps/web/src/components/seo/json-ld.tsx` (long doc comment
explaining the PR #56/#57 regressions). See also
`nextjs-app-router` §JSON-LD-and-dynamic-rendering and
`security-engineering` §CSP.

### Hotel

- `@type: "Hotel"` (not `Organization`) — fix per Excel "Plan d'action" item #3.
- Required: `name`, `description` (= 150-char factual summary from CDC §2.3), `starRating`, `address` (PostalAddress), `geo` (GeoCoordinates), `aggregateRating`, `review[]`, `amenityFeature[]`, `priceRange`, `checkinTime`, `checkoutTime`, `image[]`, `url`, `telephone`, `dateModified`, `lastReviewed`.
- `potentialAction: ReserveAction` linking to the booking step on the same page.
- Optional but encouraged: `award[]` (CDC §2.13), `containedInPlace` (Place — city), `nearbyAttraction` (POIs from `pois` collection).
- Each `image` is rendered as `ImageObject` with `caption` (mot-clé + contexte — example: `"piscine extérieure chauffée Hôtel X Nice"`).

### Room (sub-page `/hotel/[slug]/chambres/[room-slug]`)

- `@type: "HotelRoom"` (preferred) or `Room` (fallback).
- Required: `name`, `description` (200 words min unique), `occupancy` (`QuantitativeValue` with `maxValue`), `floorSize` (`QuantitativeValue` with `unitCode: 'MTK'` for m²), `bed` (array of `BedDetails` with `numberOfBeds` and `typeOfBed`).
- `amenityFeature[]` (room-specific: balcony, jacuzzi, kitchenette, view).
- `isPartOf`: `{ "@type": "Hotel", "@id": "<parent hotel URL>" }` — anchors the sub-page to the parent without canonical fusion.
- Always paired with a sibling `Offer` block.

### Offer + PriceSpecification (CDC §6.4, §2.8)

- Render only when an offer is currently available (after Amadeus availability call).
- Fields: `priceSpecification`, `priceCurrency: 'EUR'`, `validFrom`, `validThrough` (= `priceValidUntil`), `availability: 'InStock' | 'LimitedAvailability' | 'OutOfStock'`, `seller: TravelAgency`.
- On hotel detail: array of offers (one per available room type).
- On room sub-page: single `Offer` for that room type.
- `priceValidUntil` mandatory (CDC §2.8) — avoids stale offers indexed without expiry.

### Place + GeoCoordinates (CDC §2.7)

- Hotel itself = `Place` via the `geo` field on `Hotel`.
- POIs from the `pois` collection rendered as separate `Place` entries, linked via `nearbyAttraction` on the parent `Hotel`. Each carries `geo`, `distanceToHotel` (custom property if standard one missing — `QuantitativeValue` with `unitCode: 'KMT'`).

### AggregateRating (mandatory `bestRating: '5'`)

- For hotel detail: from Google Reviews (`google_rating`, `google_reviews_count`) or Amadeus sentiments.
- For classements: aggregate of selected hotels with `bestRating: '5'`, `worstRating: '1'`.
- **`bestRating` MUST be `'5'`** even when the UI displays `/10` — Google Rich Results renders `/5` regardless of `bestRating`, so emitting `/10` provides zero SEO upside and breaks vendor mapping. UI conversion (`displayed = stored × 2`) is the responsibility of the presentation layer only.
- Never fabricate counts. Always reflect real `reviewCount > 0` from a vendor.

### FAQPage

- Use `@type: 'FAQPage'`, mainEntity Q/A pairs.
- **10–15 Q&A on hotel detail** (CDC §2.11) — was 5 in V1.
- 5–10 Q&A on classements / sélections / comparatifs / guides.
- Each `Question.name` < 100 chars; `acceptedAnswer.text` **50–100 mots** (CDC §2.11, was 40–80).
- Compose `FAQPage` from the AEO block question/answer + the editorial FAQ list (already done in `apps/web/src/app/[locale]/hotel/[slug]/page.tsx`).

### Award (CDC §2.13)

- `Award` is a free-text Schema.org type on `Hotel.award`.
- For verified certifications (Clef Verte, Michelin Key, Green Globe, LEED) prefer `hasCredential: EducationalOccupationalCredential` when the issuer publishes a verifiable certificate. Otherwise plain `award` string is acceptable.

### ImageObject + VideoObject (CDC §2.2)

- Every hotel image rendered as `ImageObject` with `contentUrl`, `caption` (alt-quality, SEO-keyword + context), `width`, `height`.
- Featured image set as `Hotel.image` (string URL or array of `ImageObject`).
- Hotel video (≥ 30 s, MP4 H.265) rendered as `VideoObject` with `contentUrl`, `thumbnailUrl`, `uploadDate`, `duration` (ISO 8601 `PT30S`), `description`, `transcript` if available.
- Visite 360° (Matterport) rendered as `VirtualLocation` (Schema.org extension) or as a `VideoObject` fallback with `additionalType: "https://schema.org/VirtualLocation"`.

### amenityFeature[] taxonomy (CDC §2.6 — full Google Hotels parity)

- Stored in the `amenities` + `hotel_amenities` tables (see `content-modeling`).
- 12 categories rendered as `amenityFeature[]` entries (`LocationFeatureSpecification` for boolean/text values, `QuantitativeValue` for numeric ones):
  - **Connectivity**: Wi-Fi free/paid, débit Mbps.
  - **F&B**: breakfast, restaurant (count, cuisine), bar, room service (24h / hours), diet-friendly tags.
  - **Pools & beaches**: indoor, outdoor, heated, beach access.
  - **Wellness**: spa, hammam, sauna, massages, fitness.
  - **Transport & parking**: shuttle, covered parking, valet, EV charger, distance to public transit.
  - **Activities**: tennis, golf, excursions desk.
  - **Family**: cot, kids' club, baby-sitting.
  - **Pets**: accepted (yes/no), fees, weight limit.
  - **Accessibility**: lift, adapted rooms, roll-in shower, hearing/vision aids.
  - **Business**: meeting rooms, coworking, printer.
  - **Security**: safe, smoke detectors, 24h reception.
  - **Payments**: cards, Amex, cash, crypto, wire transfer.

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
- Missing `dateModified` on guides/articles or `lastReviewed` on hotel detail.
- `bestRating: '10'` on `AggregateRating` — always `'5'` (Google Rich Results renders /5 regardless).
- `Offer` without `priceValidUntil` (CDC §2.8 mandatory).
- Room sub-page emitting a canonical that points to the parent hotel (kills its indexability).
- `ImageObject` without `caption` (loses the SEO + a11y signal).

## References

- CDC v3.0 §6.4.
- Excel "Schema JSON-LD" sheet.
- Google Search Central — Structured Data docs.
- `seo-technical`, `geo-llm-optimization`, `content-modeling` skills.
- **`editorial-long-read-rendering`** — JSON-LD block composition for guides/rankings.
- **`security-engineering`** — full CSP policy details and middleware setup.
- **`nextjs-app-router`** — force-dynamic constraint when emitting JSON-LD.
