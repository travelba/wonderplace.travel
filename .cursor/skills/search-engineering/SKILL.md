---
name: search-engineering
description: Algolia-based internal search engineering for ConciergeTravel.fr (autocomplete destinations, hotel catalog facets, indexing pipeline, relevance tuning, synonyms). Use for any code touching Algolia indices, search UI, or search-related domain logic.
---

# Search engineering — ConciergeTravel.fr

We use **Algolia** for instant typo-tolerant search on destinations and hotels (CDC §2). Indices are kept in sync from Payload via `afterChange` hooks. Search powers autocomplete on the homepage and the catalog facet pages, while real-time prices come from Amadeus.

## Triggers

Invoke when:
- Designing or modifying Algolia indices (`hotels_fr`, `hotels_en`, `cities_fr`, `cities_en`).
- Adding searchable attributes, ranking, synonyms, rules.
- Implementing search UI components (`<SearchBox/>`, `<Hits/>`, `<RefinementList/>`).
- Touching the indexer pipeline.

## Indices

### `hotels_<locale>`
- Records: one per published hotel.
- `objectID` = hotel UUID.
- Searchable: `name`, `city`, `district`, `region`, `landmarks`, `aliases`, `description_excerpt` (200 chars), `amenities_top` (top 10).
- Facets: `region`, `city`, `is_palace`, `stars`, `themes`, `amenities`, `is_little_catalog`, `priority`.
- Custom ranking: `priority asc` (P0 first), `google_rating desc`, `priority_score desc`.
- Synonyms: Côte d'Azur ↔ Riviera, Provence ↔ Sud, Alpes ↔ Mountain (en), Spa ↔ Wellness (en).

### `cities_<locale>`
- Records: cities + landmarks for autocomplete.
- Searchable: `name`, `region`, `landmarks`.

## Non-negotiable rules

### Indexing pipeline
- Single source of truth: Postgres + Payload.
- Indexer in `packages/integrations/algolia-admin/`:
  - Function `indexHotel(hotelId, { locale })` rebuilds the record from Postgres.
  - `bulkReindex(filter)` runs from a CLI script or Payload custom button.
  - Concurrency limited to 5 in-flight requests; rate-limited.
- Trigger on Payload `afterChange` for `Hotels`, `EditorialPages`, `Authors`. Skip if status not `published`.
- Skip on draft creation; only index on publish or republish.

### Atomic updates
- `partialUpdateObject` for incremental changes (rating sync, photos add).
- Full `saveObject` only when many fields change.
- On unpublish: `deleteObject`.

### Relevance
- `searchableAttributes` ordered: `name > city > district > region > landmarks > aliases > description_excerpt > amenities_top`.
- `attributesForFaceting`: include `searchable(themes)` for filtering UX.
- `customRanking`: `desc(priority_score)` (computed: P0=100, P1=70, P2=40), `desc(google_rating)`, `desc(google_reviews_count)`.

### Synonyms and rules
- One-way and two-way synonyms for FR/EN destination spellings.
- Rule: if query matches a city name, boost `cities_<locale>` results above hotels.

### Search UI
- `react-instantsearch` with **server-side rendering** of initial results for SEO on `/recherche`.
- Mobile autocomplete: bottom-sheet with categorical sections (Destinations / Hôtels).
- Empty states actionable: suggest top regions or popular hotels.

### Privacy
- No personally identifiable information indexed.
- Search-as-you-type telemetry (Algolia Insights) anonymized; consent banner-gated.

### Performance
- Initial autocomplete payload < 30KB.
- Edge-cached fallback list for popular cities (`cache:popular-cities:fr`) served if Algolia is unreachable.

## Anti-patterns to refuse

- Calling Algolia client-side with the admin API key. **Only the search-only key is exposed.**
- Reindexing on every hotel update without checking publication status.
- Performing real-time price filtering on Algolia (prices live in Amadeus; Algolia stores categorical price band only).
- Flooding the index with internal-only fields (keep payload lean).

## Algolia keys

- `NEXT_PUBLIC_ALGOLIA_APP_ID` (public)
- `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` (public, search-only)
- `ALGOLIA_ADMIN_API_KEY` (server-only, indexing)
- `ALGOLIA_INDEX_PREFIX` (`prod_`, `staging_`, `dev_`)

## References

- CDC v3.0 §2 (stack), §5 (intégrations), §6 (architecture).
- Algolia docs (instant search, ranking, synonyms).
- `backoffice-cms`, `nextjs-app-router`, `performance-engineering` skills.
