---
name: content-enrichment-pipeline
description: Multi-source factual enrichment pipeline for ConciergeTravel.fr — DATAtourisme + Wikidata + Wikipedia + Tavily, layered by trust, with anti-hallucination sentinels and structured extraction via LLM. Use when fetching, normalising, or expanding factual content for hotels, destinations, POIs, awards, or any editorial entity where source attribution and EEAT matter.
---

# Content enrichment pipeline — ConciergeTravel.fr

The editorial copy on this site competes on **factual depth**, not on AI fluency. The enrichment pipeline (`scripts/editorial-pilot/src/enrichment/`) is what turns a hotel name into a fact-grounded brief that the generation LLM can safely expand into 4 000-word prose without hallucinating. Every source is layered, every fact has an audit trail, every missing value is sentineled — never invented.

## Triggers

Invoke when:

- Adding a new factual field to a hotel / guide / ranking / POI / brand.
- Wiring a new external data source (vendor API, open dataset, knowledge graph).
- Designing a structured extraction step that turns Tavily / web content
  into typed records.
- Debugging "hallucinated fact" issues in editorial output.
- Reviewing the freshness or provenance of any published editorial fact.

## Rule 1 — Layer sources by trust, fall through gracefully

The enrichment cascade goes from **most-structured / highest-trust** to
**least-structured / lowest-trust**:

```
DATAtourisme (official FR tourism registry, structured RDF)
   ↓ fill structural facts (address, GPS, official URL, stars, isPalace)
Wikidata (curated knowledge graph)
   ↓ fill encyclopedic facts (architect, inception year, owner, heritage)
Wikipedia REST (lead paragraph + first picture)
   ↓ fill narrative anchors (history opening sentence, hero alt text)
Tavily Search/Extract (web markdown, queryable)
   ↓ fill awards, signature experiences, dining, wellness, capacity
GPT-4o-mini structured extraction
   ↓ extract typed facts from each Tavily document
```

Each layer **only writes what the layer above did not provide**. Reference
implementation: `scripts/editorial-pilot/src/enrichment/brief-builder.ts`
(`buildBriefFromSources`).

## Rule 2 — Use `AUTO_DRAFT` sentinels for missing facts

When a layer cannot fill a field, **do not invent** and do not leave the
field empty. Write a sentinel:

```ts
const AUTO_DRAFT = 'AUTO_DRAFT' as const;

const brief = {
  history_year: wd.inception?.year ?? AUTO_DRAFT,
  architect: wd.architects[0] ?? AUTO_DRAFT,
  dining_outlets: extracted?.outlets ?? [AUTO_DRAFT],
};
```

The generation LLM (pass 4) is prompted to **detect sentinels and degrade
gracefully** (skip the affected sentence, prefer a generic phrasing). The
fact-check pass flags every sentinel-derived sentence as low-confidence.

This is the _single most effective_ anti-hallucination mechanism in the
pipeline. Reference: `brief-builder.ts` comment block.

## Rule 3 — DATAtourisme is the system of record for addresses

When a hotel exists in DATAtourisme, its address, GPS, postal code, and
official URL **win** over any other source. Never override DATAtourisme
fields with Wikipedia or Tavily content — those sources are out of date
more often than they are accurate.

```ts
const hotel: HotelCore =
  dt !== null
    ? hotelCoreFromDt(dt)
    : hotelCoreFromManual({
        /* … */
      });
```

If DATAtourisme returns no match, fall back to a **manual entry** path
(`--no-datatourisme` CLI flag) with explicit source labels:
`"Manual entry — Atout France Palace registry"`.

## Rule 4 — Wikidata: SPARQL is the API, not REST

Wikidata's REST has rate limits and incomplete property coverage. Always
use **`query.wikidata.org/sparql`** with:

- A custom `User-Agent` (Wikimedia policy — anonymous UAs get throttled).
- All requested properties in one query (architects, owner, operator,
  Wikipedia URLs, Commons, TripAdvisor ID, Booking ID, MERIMÉE).
- Zod validation on every binding (responses are loose JSON).

```ts
const USER_AGENT =
  'ConciergeTravelEditorialPilot/0.1 (https://conciergetravel.fr; reservations@conciergetravel.fr)';

const r = await fetch(`${WIKIDATA_SPARQL}?format=json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': USER_AGENT,
    Accept: 'application/sparql-results+json',
  },
  body: `query=${encodeURIComponent(SPARQL)}`,
});
```

Reference: `scripts/editorial-pilot/src/enrichment/wikidata.ts`.

## Rule 5 — Tavily: pair Search → Extract, never raw scrape

The Tavily client provides two endpoints (`/search` and `/extract`) plus
a combined `tavilySearchAndExtract` helper. Pattern:

1. **Search** with `searchDepth: 'advanced'` (2 credits, much better
   recall) and a tight `query` like
   `"Plaza Athénée Avenue Montaigne dining restaurants Alain Ducasse"`.
2. **Pick the top 2-3 results** by `score`, filter by `includeDomains`
   if you can predict the authoritative source (e.g. `*.michelin.com`).
3. **Extract** with `extractDepth: 'advanced'` (handles JS-rendered
   sites). Use `query=…` + `chunksPerSource: 3` to get only the
   relevant chunks.
4. **Feed each result's markdown** into `llmExtract` (see rule 6).

Never `fetch()` a third-party URL directly: you'll fight bot-protection,
JavaScript rendering, and dirty HTML. Tavily abstracts all of that and
returns clean LLM-ready markdown.

## Rule 6 — Structured extraction with `gpt-4o-mini`, temperature 0

Generation uses `gpt-4o` at `temperature: 0.4`. **Extraction** is a
different job and uses `gpt-4o-mini` at `temperature: 0` — ~10× cheaper,
sufficient for pulling typed facts out of clean markdown.

Use the `llmExtract<Schema>` helper, never roll your own:

```ts
const result = await llmExtract({
  content: tavilyMarkdown, // clean markdown from Tavily
  context: 'Plaza Athénée — dining outlets',
  schemaDescription: '…', // human-readable for the LLM
  schema: DiningOutletsSchema, // Zod schema for parsing
});
// result.data is z.infer<typeof DiningOutletsSchema> | null
```

The helper:

- Injects the **anti-hallucination contract** (return null for missing
  fields, no inference, verbatim quotes, no markdown fences).
- Requires `evidence_quote` siblings on every populated field where the
  schema asks for one — auditable proof the LLM did not invent.
- Returns `null` on JSON parse failure or Zod failure — caller falls
  back to `AUTO_DRAFT`.

Reference: `scripts/editorial-pilot/src/enrichment/llm-extract.ts`.

## Rule 7 — Persist provenance alongside every fact

Every record written to Supabase MUST include:

```ts
{
  sourceUri: 'https://www.datatourisme.fr/…',  // canonical record URL
  sourceLabel: 'DATAtourisme catalog',         // human-readable
  enrichmentVersion: '2024-05',                // when this snapshot was taken
  evidenceQuote?: '…',                         // for LLM-extracted facts
}
```

Provenance is what allows the back-office to flag stale facts, support
"see source" UI on contested values, and survive a vendor schema change.

## Rule 8 — Cache aggressively, idempotent re-runs

External-source calls are cached at two levels:

1. **HTTP layer** — Tavily/Wikidata/Wikipedia responses cached on disk
   (`scripts/editorial-pilot/.cache/`) keyed by query+args. Re-running
   the same brief locally is ~free.
2. **DB layer** — `enrich-wikidata-ids.ts` and similar batch scripts
   skip hotels that already have the target columns populated, unless
   the `--force` flag is passed.

Pipelines must be **idempotent** — re-running on the same input MUST NOT
produce different output (apart from non-deterministic LLM extraction,
which is gated to temperature 0).

## Rule 9 — Wikidata external IDs unlock secondary integrations

When you have a Wikidata Q-ID for a hotel, you also typically get:

- `P856` official website
- `P3134` TripAdvisor ID → reviews
- `P5694` Booking.com ID → competitor data
- `P969` street address (street-level fallback)
- `P380` MERIMÉE ID → French heritage registry
- `P373` Commons category → free photos

The `fetchHotelExternalIds` helper pulls all of these in one SPARQL. The
batch enrichment script (`enrich-wikidata-ids.ts`) writes them to
dedicated columns on `public.hotels` — those columns then power
booking, reviews, image fallback, JSON-LD `sameAs[]`, …

## Anti-patterns

- ❌ Calling `fetch()` directly on a third-party hotel website — bot
  protection, JS rendering, dirty HTML. Use Tavily.
- ❌ `gpt-4o` for extraction tasks — 10× cost for no quality gain over
  `gpt-4o-mini` at temperature 0.
- ❌ Empty string `''` for missing facts — invisible in the DB, hard to
  audit. Use `AUTO_DRAFT` or `null`.
- ❌ Overwriting DATAtourisme address with Wikipedia content.
- ❌ Wikidata SPARQL without a custom `User-Agent` — Wikimedia throttles.
- ❌ Tavily without `includeDomains` when you know the authoritative
  source — wastes credits and lowers signal-to-noise.
- ❌ Writing facts without `sourceUri` + `sourceLabel`.
- ❌ Non-idempotent enrichment scripts (re-running corrupts data).

## References

- `llm-output-robustness` — generation pipeline that consumes the enriched briefs.
- `api-integration` — base HTTP / Zod / retry pattern.
- `supabase-postgres-rls` — destination tables and migrations.
- `geo-llm-optimization` — EEAT + source attribution surface in `llms.txt`.
- Reference impls: `scripts/editorial-pilot/src/enrichment/{brief-builder,datatourisme,wikidata,wikipedia,tavily-client,llm-extract}.ts`.
