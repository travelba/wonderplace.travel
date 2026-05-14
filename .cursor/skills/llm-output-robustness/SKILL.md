---
name: llm-output-robustness
description: Engineering rules for robust LLM-generated JSON in ConciergeTravel.fr — multi-call single-concern pipelines, Zod schema design for LLM drift, allowlist post-validation, retry strategy, concurrency. Use when designing or modifying any LLM pipeline that produces structured output (editorial guides, rankings, hotel fiches, AEO blocks).
---

# LLM output robustness — ConciergeTravel.fr

The editorial pipelines (`scripts/editorial-pilot/src/guides/*-v2.ts`, `scripts/editorial-pilot/src/rankings/*-v2.ts`) generate ≥ 3 500-word JSON payloads from GPT-4o. Naive single-prompt designs fail in production with truncation, enum drift, and hallucinated entities. This skill encodes the patterns that get the pipelines from 30 % success rate to ≥ 95 %.

## Triggers

Invoke when:

- Designing or refactoring any LLM pipeline that returns structured JSON.
- Adding a new LLM-generated field to an editorial collection (guide, ranking, hotel, FAQ, ranking entry, callout).
- Debugging Zod `schema-fail` errors from `callLlm`.
- Adding a new "list-of-things" output where the LLM must produce ≥ N items.
- Integrating a new GPT/Claude/Mistral provider.

## Rule 1 — One prompt, one concern

GPT-4o silently truncates large multi-faceted JSON outputs to stay within an internal budget. The fix is architectural, not promptable.

**Decompose the work into single-concern calls:**

```
Call M (Meta)        → summary + meta + plan of section TITLES (no body)
Calls S₁..Sₙ (parallel, concurrency 4) → ONE call per section, body only
Call B (Blocks)      → tables + glossary + callouts
Call F (FAQ)         → all FAQ pairs
Call X (Sources)     → external_sources (post-validated against allowlist)
```

A pipeline that previously asked for "12 sections × 500 words + 6 tables + 25 FAQ + 8 sources" in one go now runs 16 parallel-or-sequential calls, each producing one part. Total wall-time decreases (parallelism) and success rate jumps to ≥ 95 %.

**Reference implementation:** `scripts/editorial-pilot/src/guides/generate-guide-v2.ts` (look at `generateGuideV2` orchestration).

## Rule 2 — Sequential batches when items depend on previous items

For ordered outputs where each item must avoid duplicates from previous items (e.g. ranked hotel entries), use **sequential batches**, not full parallelism:

```ts
const BATCH = 4;
const all: Entry[] = [];
for (let i = 0; i < target.length; i += BATCH) {
  const slice = target.slice(i, i + BATCH);
  const previouslyPicked = all.map((e) => e.hotel_slug);
  const batch = await callLlm(client, SYSTEM, buildPrompt(slice, previouslyPicked), Schema);
  all.push(...batch.entries);
}
```

Each batch sees the slugs already picked → zero duplicate ranking entries.

**Reference:** `scripts/editorial-pilot/src/rankings/generate-ranking-v2.ts` `generateEntries()`.

## Rule 3 — Zod schemas designed for LLM drift

LLMs occasionally produce synonyms, slightly fewer items than the prompt asked, or omit optional fields. Bake tolerance into the schema:

### 3a. `z.preprocess` + alias maps for enums

```ts
const SECTION_TYPES = ['intro', 'history', 'when_to_visit', 'gastronomy', 'practical'] as const;

const SectionSchema = z.object({
  type: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const alias: Record<string, string> = {
      overview: 'intro',
      introduction: 'intro',
      when_to_go: 'when_to_visit',
      best_time: 'when_to_visit',
      food: 'gastronomy',
      cuisine: 'gastronomy',
    };
    return alias[v] ?? v;
  }, z.enum(SECTION_TYPES)),
  title_fr: z.string().min(3),
});
```

LLMs _will_ output `overview`, `food`, `cuisine` even when the prompt says `intro`, `gastronomy`. Map them in `preprocess`, don't fight them in the prompt.

### 3b. Generous `min/max` headroom on arrays

```ts
// Prompt asks for "10-12 sections".
section_plan: z.array(PlanSchema).min(8).max(14),

// Prompt asks for "exactly 6 tables".
tables: z.array(TableSchema).min(4).max(8),

// Prompt asks for "≥ 4 rows".
rows: z.array(...).min(1).max(20),  // tolerate single-row tables
```

A hard `min(6)` on a "produce exactly 6 tables" prompt fails ~10 % of the time. `min(4)` makes the entire pipeline 10× more reliable. Adjust the **prompt** to ask for the high end, the **schema** to accept the low end.

### 3c. Optional English fields default to empty string

```ts
title_en: z.string().optional().default(''),
meta_desc_en: z.string().optional().default(''),
```

The LLM often skips `_en` variants when the prompt focuses on FR. `.default('')` keeps the pipeline running; the front-end falls back to the FR variant when EN is empty.

### 3d. `nullish()` for soft optional anchors

```ts
section_anchor: z.string().nullish(),  // null | undefined | string
```

`nullish()` covers both `null` (Supabase JSON) and `undefined` (LLM omission).

### 3e. `z.preprocess` for optional enum where LLM emits `null`

`z.enum([...]).optional()` accepts the value or `undefined` — but the
LLM regularly emits an explicit `null`, which fails. Don't switch to
`.nullable().optional()` (that pollutes downstream type narrowing); use
a preprocess that coerces `null` and any out-of-range string to
`undefined`:

```ts
align: z.preprocess(
  (v) => {
    if (v === null) return undefined;
    if (typeof v === 'string' && ['left', 'right', 'center'].includes(v)) return v;
    return undefined;
  },
  z.enum(['left', 'right', 'center']).optional(),
);
```

Real-world example: `TableHeaderSchema.align` in
[`scripts/editorial-pilot/src/rankings/generate-ranking-v2.ts`](mdc:scripts/editorial-pilot/src/rankings/generate-ranking-v2.ts).
Without the preprocess, `gpt-4o` failed ~3 % of `call-B` rankings with
`align: Expected 'left' | 'right' | 'center', received null`.

### 3f. Lenient `min` floors paired with post-validation drop

When a "minimum length" field (e.g. glossary `definition_fr.min(40)`)
fails the pipeline once a single entry clocks in below the floor, the
fix is **not** to drop the floor — quality matters. Instead:

1. Lower the schema `min` aggressively (40 → 20).
2. Add a post-validator that **drops** entries below the editorial
   floor and logs a warning.

```ts
function postValidateRichBlocks(callB, slug) {
  const FLOOR = 40;
  const filtered = callB.glossary.filter((g) => g.definition_fr.trim().length >= FLOOR);
  const dropped = callB.glossary.length - filtered.length;
  if (dropped > 0) console.warn(`  ⚠ [${slug}] dropped ${dropped} glossary entries`);
  return { ...callB, glossary: filtered };
}
```

Net effect: the run no longer fails because of a single 35-char
definition; the published page still respects the editorial floor; the
runlog flags the drop for human review.

## Rule 4 — Allowlist post-validation, not prompt-only

Prompt instructions like _"only cite Wikipedia, Atout France, UNESCO, Michelin"_ fail ~30 % of the time. The LLM cites a press article, an aggregator, or a hallucinated URL. **Always post-validate**:

```ts
// scripts/editorial-pilot/src/guides/external-sources-allowlist.ts
export const ALLOWLIST: readonly AllowlistEntry[] = [
  { suffix: 'wikipedia.org', type: 'wikipedia' },
  { suffix: 'atout-france.fr', type: 'atout_france' },
  { suffix: 'whc.unesco.org', type: 'unesco' },
  { suffix: 'guide.michelin.com', type: 'michelin' },
  // …
];

export function matchAllowlist(url: string): AllowlistEntry | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWLIST.find((e) => host.endsWith(e.suffix)) ?? null;
  } catch {
    return null;
  }
}

function postValidateSources(raw: ExternalSource[]): ExternalSource[] {
  return raw
    .map((s) => ({ ...s, _match: matchAllowlist(s.url) }))
    .filter((s) => s._match !== null)
    .map(({ _match, ...rest }) => ({ ...rest, type: _match!.type }));
}
```

The schema accepts a `string` for `type`; the post-validator overwrites it with the _canonical_ type from the allowlist. No hallucinated source ever reaches the DB.

## Rule 5 — Re-validate referenced IDs against the catalog

For rankings, the LLM must pick from a known list of hotel slugs. It will occasionally hallucinate one. Re-validate:

```ts
function postValidateEntries(raw: Entry[], catalog: ReadonlyArray<HotelCatalogRow>): Entry[] {
  const valid = new Set(catalog.map((h) => h.slug));
  return raw.filter((e) => valid.has(e.hotel_slug)).map((e, i) => ({ ...e, rank: i + 1 })); // re-rank after filtering
}
```

## Rule 6 — Continue-on-failure at the runner level

A multi-target runner (e.g. "regenerate 11 guides") must never abort the whole batch because one item failed:

```ts
let ok = 0,
  fail = 0;
for (const target of targets) {
  try {
    await runOne(target);
    ok += 1;
  } catch (err) {
    fail += 1;
    console.error(`[${target.slug}] ✗ ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`Done — ${ok} OK / ${fail} failed.`);
```

The failed ones get retried separately after a schema tweak.

## Rule 7 — Concurrency with explicit cap

Use a `runWithConcurrency` helper, never `Promise.all` for `N > 6` items:

```ts
async function runWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: concurrency }).map(async () => {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}
```

Default cap: **4** for OpenAI tier 1 (avoids 429 rate limits at ~10 k TPM gpt-4o).

## Rule 8 — `callLlm` with typed generic + JSON mode

```ts
async function callLlm<S extends z.ZodTypeAny>(
  client: OpenAI,
  system: string,
  user: string,
  schema: S,
  tag: string,
): Promise<z.infer<S>> {
  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });
  const raw = resp.choices[0]?.message.content ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[${tag}] invalid JSON: ${raw.slice(0, 200)}…`);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.errors.map((e) => `- ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`[${tag}] schema-fail:\n${msg}`);
  }
  return result.data;
}
```

The `<S extends z.ZodTypeAny>` generic gives perfect type inference at call sites. The `tag` prefix in errors makes log triage trivial (`[v2 paris call-B] schema-fail: tables.1.rows: …`).

## Rule 9 — Extraction is a different job (temperature 0, gpt-4o-mini)

Generation (4 000-word prose) and **extraction** (typed facts from web
markdown) are different LLM tasks. Use a separate code path:

| Concern            | Generation                  | Extraction                                     |
| ------------------ | --------------------------- | ---------------------------------------------- |
| Model              | `gpt-4o`                    | `gpt-4o-mini` (~10× cheaper)                   |
| Temperature        | `0.4` (creative variation)  | `0` (deterministic)                            |
| max_tokens         | up to 4 000                 | 1 500-2 000                                    |
| Prompt             | "Produce 500 words about X" | "Extract fields F, G from SOURCE_CONTENT"      |
| Anti-hallucination | Allowlist + post-validation | `evidence_quote` + "return null if not stated" |
| Failure mode       | Truncation, enum drift      | Wrong number, fabricated name                  |

Use the shared helper `llmExtract<Schema>` for any structured extraction
from Tavily markdown — see
[`content-enrichment-pipeline`](../content-enrichment-pipeline/SKILL.md).

The extraction system prompt MUST include:

```
1. Extract ONLY information explicitly stated in SOURCE_CONTENT.
2. If a field is not literally present → return null (never guess, never combine sources).
3. Numbers verbatim ("200+ rooms" → null because approximate).
4. For each non-null field, include the verbatim source phrase in an
   `evidence_quote` sibling when the schema asks for one.
```

## Rule 10 — `AUTO_DRAFT` sentinels for missing factual inputs

When the enrichment pipeline cannot fill a field, write the literal
string `'AUTO_DRAFT'` — never empty string, never invented placeholder.
The generation pipeline's prompts are taught to detect sentinels and:

- Skip the dependent sentence/section if too central.
- Use a generic phrasing ("informations à confirmer") if optional.
- Flag the output for fact-check pass review.

This pairs with the "evidence quote" extraction rule (Rule 9): every
fact reaches the generation LLM either with a verbatim source quote
**or** as a sentinel — the LLM is never asked to invent.

## Rule 11 — Pilot → validate → scale workflow

Never batch-generate before validating on a small pilot. The cost of
a corrupted scale run is ~50× the cost of a 3-item pilot.

```
1. Pilot — generate 3 items with `--slug=a,b,c` (PowerShell: quote the arg)
2. Inspect — open the page in dev, run `scripts/.../inspect-*.ts <slug>`
3. Audit — word counts, section coverage, allowlist matches, dead links
4. Iterate — relax schema mins, add z.preprocess aliases, fix prompts
5. Scale — run on full list with `runWithConcurrency` (cap 4)
6. Re-audit — re-run inspect on a random 10 % sample
```

Reference: `scripts/editorial-pilot/src/guides/{run-guides-v2,audit-v2-status,inspect-guide}.ts`.

Always run the runner with **continue-on-failure** (Rule 6) so a partial
scale run still leaves successfully-generated content in place.

## Rule 12 — Word-count gates as warnings, not blockers

The generation pipeline computes word counts and warns under thresholds
(3 500 for guides/rankings, 600-1000 for hotel long descriptions). It
NEVER auto-truncates or auto-extends. Under-target → human re-runs
with a different prompt seed, or the runner is invoked with a higher
`maxSectionWords` target.

```ts
const total = words(body) + words(highlights) + words(faq);
if (total < 3500) console.warn(`${tag} ⚠ total ${total} < 3500 — consider re-running.`);
```

The rule prevents the worst pathology: a pipeline silently producing
1 200-word "long-reads" because a single section truncated.

## Anti-patterns

- ❌ Asking one prompt for "sections + tables + FAQ + sources + glossary + callouts" → token starvation → truncation.
- ❌ Hard `z.enum([…])` without `z.preprocess` alias → ~10 % schema failures per pipeline.
- ❌ `z.array(X).min(N)` matching the prompt's exact ask → fails when LLM produces N-1.
- ❌ Allowlist enforced only in the prompt → hallucinated sources reach the DB.
- ❌ `Promise.all(items.map(call))` for > 6 items → 429 from OpenAI.
- ❌ `as Foo` to silence a schema mismatch → bypasses Zod safety, defeats the point.
- ❌ `gpt-4o` for extraction → 10× cost, no quality gain.
- ❌ Generation pipeline that retries on schema-fail without changing input → wastes credits, hits same drift.
- ❌ Empty string `''` instead of `'AUTO_DRAFT'` for missing facts → invisible in DB, no fact-check signal.
- ❌ Scaling on 100 items before piloting on 3 → 100× the cost of any mistake.

## References

- CDC §4 (qualité éditoriale 3 500+ mots).
- `typescript-strict-zod-interop` skill (Zod ↔ React props).
- `geo-llm-optimization` skill (allowlist EEAT signals).
- **`content-enrichment-pipeline`** — the multi-source brief that feeds generation.
- **`editorial-long-read-rendering`** — how the generated JSON renders.
- Reference impls: `scripts/editorial-pilot/src/guides/generate-guide-v2.ts`, `…/rankings/generate-ranking-v2.ts`, `…/enrichment/llm-extract.ts`.
