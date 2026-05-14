---
name: editorial-long-read-rendering
description: Rendering pattern for ≥ 3500-word editorial pages on ConciergeTravel.fr (guides destinations, classements de palaces, articles éditoriaux longs). Sticky TOC with scroll-spy, auto-linked entity bodies, interleaved callouts, comparison tables, glossary, EEAT sources footer, two-level FAQ. Use when designing or modifying any long-read page or its supporting Server Components.
---

# Editorial long-read rendering — ConciergeTravel.fr

Long-form editorial (destination guides ≥ 3 500 mots, classements ≥ 3 500 mots, articles thématiques) follows a single composable rendering architecture. Every component plays a specific role for **SEO** (structure HTML), **GEO** (LLM ingestion), **AEO** (Answer Engine Optimization) and **EEAT** (sources & expertise). This skill is the blueprint.

## Triggers

Invoke when:

- Creating or modifying any page under `apps/web/src/app/[locale]/{guide,classement,article}/`.
- Adding a new editorial Server Component or client island in
  `apps/web/src/components/editorial/`.
- Changing the JSONB schema of `editorial_guides` or `editorial_rankings`.
- Designing a new long-form editorial collection in Payload.
- Reviewing a long-read for ≥ 3 500 word target compliance.

## Rule 1 — Two-column desktop, single column mobile

The canonical layout puts the article in a generous column and the
**sticky TOC** in a 240 px aside. Mobile collapses to a single column;
the TOC is hidden because IntersectionObserver behaves poorly on small
viewports without a separate horizontal-scroll variant.

```tsx
<main className="container mx-auto max-w-7xl px-4 py-10 sm:py-14">
  …breadcrumb, hero…
  <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-10">
    <div className="min-w-0 max-w-4xl">{/* article body */}</div>
    <aside className="hidden lg:block">
      <TocSidebar anchors={guide.toc_anchors} locale={locale} />
    </aside>
  </div>
</main>
```

Reference: `apps/web/src/app/[locale]/guide/[citySlug]/page.tsx`,
`apps/web/src/app/[locale]/classement/[slug]/page.tsx`.

## Rule 2 — Precompute TOC anchors at write-time, not render-time

`TocSidebar` is a client island that uses `IntersectionObserver` to
highlight the active section. It MUST receive a precomputed array — no
DOM scraping, no string-matching at render.

The pipeline (`scripts/editorial-pilot/src/{guides,rankings}/push-*-v2.ts`)
computes the anchors when persisting the article:

```ts
function buildTocAnchors(guide: GeneratedGuideV2): TocAnchor[] {
  const out: TocAnchor[] = [];
  for (const s of guide.sections) {
    out.push({ anchor: s.key, label_fr: s.title_fr, label_en: s.title_en, level: 2 });
  }
  if (guide.tables.length > 0) {
    out.push({
      anchor: 'tableaux',
      label_fr: 'Tableaux comparatifs',
      label_en: 'Comparison tables',
      level: 2,
    });
  }
  // …glossary, faq, sources, palaces…
  return out;
}
```

Stored in the JSONB `toc_anchors` column. The TocSidebar is dumb.

## Rule 3 — Auto-link entities with `<EnrichedText />`

Every long-form body text is wrapped in `<EnrichedText body={…} linkMap={…} />`
which auto-links the **first occurrence** of each known entity per
paragraph. This delivers the "maillage interne très puissant" SEO requirement
without any manual `<Link>` editing.

```tsx
import { EnrichedText } from '@/components/editorial/enriched-text';

<EnrichedText body={section.body_fr} locale={locale} linkMap={linkMapAsMap} />;
```

The `linkMap` is built **server-side** in parallel with the page data:

```ts
const [palaces, linkMap] = await Promise.all([
  getHotelsForDestination(cityKeys),
  buildEditorialLinkMap({ excludeGuideSlug: citySlug }),
]);
```

Reference: `apps/web/src/server/editorial/build-link-map.ts`.

**Caps** (enforced by the component):

- 1 link per entity per paragraph (no over-linking).
- Default 4 links max per paragraph (configurable via prop, drop to 2
  on ranking entry justifications which are shorter).
- Skip self-links: pass `excludeGuideSlug` / `excludeRankingSlug` to
  the map builder.

## Rule 4 — Interleave callouts inside sections, don't append

Editorial callouts (`did_you_know`, `concierge_tip`, `warning`,
`pro_tip`, `fact`) work best when they sit **inside** a section, near
the content they amplify. The pattern:

```ts
const inlineCallouts = guide.editorial_callouts.slice(0, Math.min(3, guide.editorial_callouts.length));

{guide.sections.map((section, idx) => {
  const callout = inlineCallouts[idx] ?? null;
  return (
    <section key={section.key} id={section.key}>
      <h2>{section.title_fr}</h2>
      <EnrichedText … />
      {callout !== null ? <EditorialCallout callout={callout} locale={locale} /> : null}
    </section>
  );
})}

{/* Remaining callouts (if more than sections) sit in a block at the bottom */}
{guide.editorial_callouts.length > inlineCallouts.length ? (
  <section className="my-10 space-y-4">
    {guide.editorial_callouts.slice(inlineCallouts.length).map((c, i) => (
      <EditorialCallout key={`cb-${i}`} callout={c} locale={locale} />
    ))}
  </section>
) : null}
```

## Rule 5 — Two-level FAQ (global + contextual)

The FAQ JSONB column stores ALL questions. At render time, split by
`section_anchor`:

```ts
const contextualFaqByAnchor = new Map<string, typeof faqItems>();
const globalFaq: typeof faqItems = [];
for (const f of faqItems) {
  if (typeof f.section_anchor === 'string' && f.section_anchor.length > 0) {
    const arr = contextualFaqByAnchor.get(f.section_anchor) ?? [];
    arr.push(f);
    contextualFaqByAnchor.set(f.section_anchor, arr);
  } else {
    globalFaq.push(f);
  }
}
```

- **Contextual FAQs** render inside their target section, styled smaller
  (`<details>` cards with tighter padding).
- **Global FAQs** render in a single `#faq` block near the bottom.
- The `FAQPage` JSON-LD includes **all** FAQs (the duplication is fine
  for AEO — Google de-duplicates).

## Rule 6 — Tables, glossary, sources are first-class components

Each editorial concern has a dedicated, accessible Server Component:

| Concern           | Component                   | Markup                                  |
| ----------------- | --------------------------- | --------------------------------------- |
| Comparison tables | `<EditorialTable />`        | `<table>` + `<caption>` + scoped `<th>` |
| Glossary          | `<EditorialGlossary />`     | `<dl>` + sorted `<dt>`/`<dd>`           |
| Callouts          | `<EditorialCallout />`      | `<aside role="note">` styled per kind   |
| External sources  | `<ExternalSourcesFooter />` | grouped by source type, EEAT signal     |
| Auto-linked body  | `<EnrichedText />`          | `<p>` with `<Link>` inside              |
| Sticky TOC        | `<TocSidebar />` (client)   | `<nav>` + IntersectionObserver          |

All live in `apps/web/src/components/editorial/`. Don't roll new
markup — extend the existing components.

## Rule 7 — JSON-LD: at least 4 graphs per long-read

Every long-read emits **four** `JsonLdScript` blocks via the page-level
nonce read:

```tsx
const nonce = (await headers()).get('x-nonce') ?? undefined;

<JsonLdScript data={breadcrumbJsonLd} nonce={nonce} />     {/* 1. BreadcrumbList */}
<JsonLdScript data={articleJsonLd} nonce={nonce} />        {/* 2. Article */}
{faqJsonLd !== null ? <JsonLdScript data={faqJsonLd} nonce={nonce} /> : null}  {/* 3. FAQPage */}
{itemListJsonLd !== null ? <JsonLdScript data={itemListJsonLd} nonce={nonce} /> : null}  {/* 4. ItemList[Hotel] */}
```

Calling `headers()` at the page level marks the route as dynamic — see
[`structured-data-schema-org`](../structured-data-schema-org/SKILL.md) and
[`nextjs-app-router`](../nextjs-app-router/SKILL.md) §CSP-nonce-and-dynamic.

## Rule 8 — Schemas in `apps/web/src/server/{guides,rankings}/get-*-by-slug.ts`

The Zod schemas mirror the JSONB shapes produced by the editorial pipeline.
Two columns added in a JSONB migration → two new Zod fields here, with
`.default([])` for arrays so an old row still parses while the column
backfills.

```ts
export const GuideRowSchema = z.object({
  // …existing…
  tables: z.array(TableSchema).default([]),
  glossary: z.array(GlossaryEntrySchema).default([]),
  external_sources: z.array(ExternalSourceSchema).default([]),
  editorial_callouts: z.array(CalloutSchema).default([]),
  toc_anchors: z.array(TocAnchorSchema).default([]),
});
```

The components consume `z.infer<typeof GuideRowSchema>` — see
[`typescript-strict-zod-interop`](../typescript-strict-zod-interop/SKILL.md)
for the prop-type interop rules.

## Rule 9 — Word-count gates at write-time, not render-time

The generation runners log word counts and warn under 3 500:

```ts
const wordsTotal = wordsBody + wordsHighlights + wordsFaq;
if (wordsTotal < 3500) {
  console.warn(`${tag} ⚠ total words ${wordsTotal} < 3500 — consider re-running.`);
}
```

A renderer NEVER tries to lengthen content. If the generation undershoots,
re-run the generator (see [`llm-output-robustness`](../llm-output-robustness/SKILL.md)).

## Anti-patterns

- ❌ Building the TOC by querying the rendered DOM client-side.
- ❌ Auto-linking on the client (re-runs on every render, jank). Server only.
- ❌ Reading `headers()` inside `JsonLdScript` (caused PR #56/#57 regressions).
- ❌ Hand-rolling `<table>` markup instead of `<EditorialTable />`.
- ❌ Appending callouts to the bottom of the article only — kill the
  reading flow benefit.
- ❌ FAQ as a single flat list when the LLM provides `section_anchor`
  → wastes the two-level UX.
- ❌ External sources as a generic "References" list without grouping
  by source type — undermines EEAT visual signal.
- ❌ Re-introducing `revalidate = N` on a long-read page — strips CSP
  nonce, browser blocks JSON-LD.

## References

- `llm-output-robustness` — the pipeline that produces the JSONB.
- `typescript-strict-zod-interop` — Zod ↔ React prop typing.
- `structured-data-schema-org` — JSON-LD + CSP nonce contract.
- `seo-technical`, `geo-llm-optimization` — SEO/GEO surface design.
- `content-modeling` — Payload collections that source the editorial.
- Reference impls: `apps/web/src/app/[locale]/guide/[citySlug]/page.tsx`,
  `apps/web/src/app/[locale]/classement/[slug]/page.tsx`,
  `apps/web/src/components/editorial/*.tsx`.
