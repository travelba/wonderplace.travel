# Editorial pilot — Sprint 1B

> Standalone 4-pass AI editorial pipeline to produce premium hotel fiches matching the **Condé Nast Traveler + IATA insider** quality bar defined in `docs/editorial/style-guide.md`.
>
> **Sprint 1B scope** : 2 pilot hotels (Plaza Athénée Paris + Hôtel du Cap-Eden-Roc). Validation of the pipeline on representative cases before scaling to 700+ fiches.

---

## Pipeline overview

```
brief.json
    │
    ▼
┌──────────────────────────┐
│ Pass 1 — Draft factuel   │  Junior IATA voice, dry prose, ≥10 numbers, ≥4 named sources.
│ temp=0.3                 │  Marks unknowns with [TBD-FACT-CHECK : ...].
└──────────────────────────┘
    │ 01-draft.md
    ▼
┌──────────────────────────┐
│ Pass 2 — Variation       │  Le Monde copy editor. Removes 75 banned terms,
│ syntaxique anti-IA       │  varies sentence length (≥30% short, ≥15% long),
│ temp=0.85                │  inserts em dashes, semicolons, nominal sentences.
└──────────────────────────┘
    │ 02-variation.md
    ▼
┌──────────────────────────┐
│ Pass 3 — Humanisation    │  Condé Nast deputy editor + IATA senior advisor.
│ magazine premium         │  Adds sensorial scene-opening, past simple, attributed
│ temp=0.9                 │  IATA verbatim, measured recommendation with honest caveat.
└──────────────────────────┘
    │ 03-humanisation.md
    ▼
┌──────────────────────────┐
│ Pass 4 — Fact-check      │  AFP-grade fact checker. Verifies every number, date,
│ critique                 │  proper noun against the brief. Returns structured JSON
│ temp=0.1                 │  report with READY_TO_PUBLISH / NEEDS_PASS_2BIS verdict.
└──────────────────────────┘
    │ 04-fact-check.json
    ▼
final.md → docs/editorial/pilots/{slug}.md
```

---

## Prerequisites

### 1. Environment variables

Set in `.env.local` at the **monorepo root** (gitignored):

```bash
# pick at least one provider
OPENAI_API_KEY="sk-..."           # https://platform.openai.com/api-keys
ANTHROPIC_API_KEY="sk-ant-..."    # https://console.anthropic.com/settings/keys

# optional overrides
EDITORIAL_PILOT_PROVIDER="openai" # 'openai' | 'anthropic' (default: openai if both present)
EDITORIAL_PILOT_OPENAI_MODEL="gpt-4o-2024-11-20"
EDITORIAL_PILOT_ANTHROPIC_MODEL="claude-sonnet-4-5-20250929"
```

> The pipeline reads `.env.local` (or `.env`) from the monorepo root automatically.

### 2. Install dependencies

From the **monorepo root** (this package is a pnpm workspace):

```bash
pnpm install
```

---

## Run

From the monorepo root :

```bash
# Generate both pilot fiches
pnpm --filter @cct/editorial-pilot run run:all

# Or one at a time
pnpm --filter @cct/editorial-pilot run run:plaza
pnpm --filter @cct/editorial-pilot run run:cap-eden-roc
```

Or from this folder :

```bash
cd scripts/editorial-pilot
pnpm run:all
```

---

## Outputs

For each hotel slug :

```
scripts/editorial-pilot/output/{slug}/
├── 01-draft.md            # Pass 1 raw output
├── 02-variation.md        # Pass 2 raw output
├── 03-humanisation.md     # Pass 3 raw output
├── 04-fact-check.json     # Pass 4 structured fact-check report
├── final.md               # Same as 03-humanisation.md (or pass-2bis if escalated)
└── summary.json           # Token counts, durations, fact-check verdict
```

And the publication-ready markdown is copied to :

```
docs/editorial/pilots/{slug}.md
```

---

## Cost estimate (sprint 1B — 2 fiches)

- ~80 000 tokens total across 8 LLM calls (4 passes × 2 hotels)
- OpenAI GPT-4o: ~$0.40 input + $0.60 output ≈ **$1.00**
- Anthropic Claude Sonnet 4.5: ~$0.25 input + $1.20 output ≈ **$1.45**

Negligible. Designed to fail cheap if the pipeline is wrong.

---

## Files map

| File                                  | Role                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `briefs/{slug}.json`                  | Fact-verified input (Wikipedia, Wikidata, official site, Atout France, Michelin) |
| `prompts/01-draft-factuel.md`         | Pass 1 system prompt                                                             |
| `prompts/02-variation-syntaxique.md`  | Pass 2 system prompt                                                             |
| `prompts/03-humanisation-magazine.md` | Pass 3 system prompt                                                             |
| `prompts/04-fact-check.md`            | Pass 4 system prompt                                                             |
| `src/env.ts`                          | Zod-validated env loading                                                        |
| `src/llm.ts`                          | OpenAI + Anthropic abstraction                                                   |
| `src/schemas.ts`                      | Zod schemas (Brief + FactCheckReport)                                            |
| `src/pipeline.ts`                     | 4-pass orchestrator                                                              |
| `src/run.ts`                          | CLI entry                                                                        |

---

## Validation criteria (manual review)

After generation, both fiches must pass a **side-by-side human read** against the latest Condé Nast Traveler France hotel article. The reader must NOT be able to tell which is editorial pro and which is generated.

Specific gates :

- ✓ No banned term from `docs/editorial/style-guide.md` §4
- ✓ No banned pattern from §5
- ✓ All required signatures from §6 present (scene-opening lead, past simple sentence, attributed IATA verbatim, measured recommendation with honest caveat, ≥1 cultural reference)
- ✓ Fact-check report = `READY_TO_PUBLISH` or `MANUAL_REVIEW_REQUIRED` with explicit external sources
- ✓ Zero hallucination (proper noun, number, date)
- ✓ Sentence rhythm: ≥30% short (<12 w), ≥15% long (>25 w)

If any of these fail on a pass : iterate on the failing prompt only, not the others.
