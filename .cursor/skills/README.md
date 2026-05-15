# Skills catalogue — ConciergeTravel.fr

> 34 agent skills covering every vertical. Each skill is a `SKILL.md` file
> with YAML frontmatter (`name`, `description`) that Cursor reads at session
> start; the body is loaded into context only when the agent decides the
> skill is relevant to the current task.
>
> **Convention** : SKILL.md ≤ 500 lines, third person, concrete code
> examples, explicit "Triggers" section.

## 1. How to use this file

| You are…                            | Read…                                                      |
| ----------------------------------- | ---------------------------------------------------------- |
| A new agent landing on the repo     | [`AGENTS.md`](../../AGENTS.md) first, then this catalogue. |
| About to work on a specific feature | The "Problem → skill" matrix below.                        |
| Designing cross-cutting infra       | The "Categories" section.                                  |
| Capturing a new pattern             | Section 4 — capitalisation workflow.                       |

## 2. Problem → skill matrix

Use this when you don't know where to start.

| Problem / Feature                                                                             | Skill                                                                            |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Booking tunnel (search → offer → payment → confirmation)                                      | [`booking-engine`](booking-engine/SKILL.md)                                      |
| Hotel detail page, room sub-pages, editorial fiches                                           | [`content-modeling`](content-modeling/SKILL.md)                                  |
| Long-read editorial guides / rankings — **LLM pipeline**                                      | [`llm-output-robustness`](llm-output-robustness/SKILL.md) ⭐                     |
| Long-read editorial guides / rankings — **rendering** (TOC, auto-link, callouts)              | [`editorial-long-read-rendering`](editorial-long-read-rendering/SKILL.md) ⭐ NEW |
| **Factual enrichment** (DATAtourisme + Wikidata + Wikipedia + Tavily)                         | [`content-enrichment-pipeline`](content-enrichment-pipeline/SKILL.md) ⭐ NEW     |
| Amadeus Hotels API (search, offers, booking, PNR)                                             | [`amadeus-gds`](amadeus-gds/SKILL.md)                                            |
| Little Hotelier API (loyalty FREE tier eligibility)                                           | [`little-hotelier`](little-hotelier/SKILL.md)                                    |
| Price comparator widget (Makcorps + Apify, no affiliate links)                                | [`competitive-pricing-comparison`](competitive-pricing-comparison/SKILL.md)      |
| Algolia search (autocomplete, facets, indexing)                                               | [`search-engineering`](search-engineering/SKILL.md)                              |
| **Any vendor / LLM integration** (HTTP, Zod, retries, errors)                                 | [`api-integration`](api-integration/SKILL.md)                                    |
| Amadeus Payments iframe, 3DS2, Apple/Google Pay                                               | [`payment-orchestration`](payment-orchestration/SKILL.md)                        |
| Brevo transactional emails + lifecycle automations                                            | [`email-workflow-automation`](email-workflow-automation/SKILL.md)                |
| Loyalty FREE / PREMIUM tier rules                                                             | [`loyalty-program`](loyalty-program/SKILL.md)                                    |
| Supabase Auth (customer / editor / operator / admin / seo)                                    | [`auth-role-management`](auth-role-management/SKILL.md)                          |
| Payload CMS 3 collections, hooks, ISR revalidation                                            | [`backoffice-cms`](backoffice-cms/SKILL.md)                                      |
| Next.js 15 App Router (routes, metadata, caching, middleware) + **force-dynamic for JSON-LD** | [`nextjs-app-router`](nextjs-app-router/SKILL.md) ✏️                             |
| **Zod schemas ↔ React props** under `exactOptionalPropertyTypes`                              | [`typescript-strict-zod-interop`](typescript-strict-zod-interop/SKILL.md) ⭐ NEW |
| TypeScript strict baseline (no `any`, no `as`, no `!`)                                        | [`typescript-strict`](typescript-strict/SKILL.md)                                |
| Pure domain logic, branded types, bounded contexts                                            | [`domain-driven-design`](domain-driven-design/SKILL.md)                          |
| Supabase Postgres schema, migrations, RLS                                                     | [`supabase-postgres-rls`](supabase-postgres-rls/SKILL.md)                        |
| Upstash Redis (ARI cache, comparator cache, rate limit, idempotency)                          | [`redis-caching`](redis-caching/SKILL.md)                                        |
| RLS, secrets, **CSP nonce + JSON-LD wrapper**, GDPR, rate limiting                            | [`security-engineering`](security-engineering/SKILL.md) ✏️                       |
| WCAG 2.2 AA — forms, modals, dialogs, color contrasts                                         | [`accessibility`](accessibility/SKILL.md)                                        |
| Mobile-first responsive UI (Tailwind + shadcn + tokens)                                       | [`responsive-ui-architecture`](responsive-ui-architecture/SKILL.md)              |
| Metadata, hreflang, sitemaps, robots, anti-cannibalisation                                    | [`seo-technical`](seo-technical/SKILL.md)                                        |
| llms.txt, AEO blocks, JSON-LD agent-skills, FAQ extraction                                    | [`geo-llm-optimization`](geo-llm-optimization/SKILL.md)                          |
| JSON-LD builders (Hotel, Article, FAQ, ItemList, BreadcrumbList) + **CSP nonce contract**     | [`structured-data-schema-org`](structured-data-schema-org/SKILL.md) ✏️           |
| Core Web Vitals, image / font optim, code splitting, edge runtime                             | [`performance-engineering`](performance-engineering/SKILL.md)                    |
| Sentry, structured logs, Web Vitals, alerts, dashboards                                       | [`observability-monitoring`](observability-monitoring/SKILL.md)                  |
| Unit (Vitest) + integration (MSW) + E2E (Playwright) + axe + Lighthouse                       | [`test-strategy`](test-strategy/SKILL.md)                                        |
| GitHub Actions, Vercel previews, Supabase migrations, release flow                            | [`cicd-release-management`](cicd-release-management/SKILL.md)                    |
| **PowerShell / Windows dev commands, Supabase SSL strip**                                     | [`windows-dev-environment`](windows-dev-environment/SKILL.md) ⭐ NEW             |
| README, ADRs, runbooks, integration docs                                                      | [`technical-documentation`](technical-documentation/SKILL.md)                    |
| Layer boundaries, rendering strategy, new bounded context                                     | [`product-architecture`](product-architecture/SKILL.md)                          |

## 3. Categories

### Foundations (apply everywhere)

- [`typescript-strict`](typescript-strict/SKILL.md) — base TS strict rules.
- [`typescript-strict-zod-interop`](typescript-strict-zod-interop/SKILL.md) ⭐ — Zod ↔ React props under `exactOptionalPropertyTypes`.
- [`domain-driven-design`](domain-driven-design/SKILL.md) — bounded contexts, pure domain.
- [`product-architecture`](product-architecture/SKILL.md) — layer boundaries, rendering strategy.
- [`api-integration`](api-integration/SKILL.md) — vendor / LLM HTTP client pattern.
- [`llm-output-robustness`](llm-output-robustness/SKILL.md) ⭐ — multi-call pipelines, schema drift tolerance, extraction patterns, pilot→scale workflow.
- [`content-enrichment-pipeline`](content-enrichment-pipeline/SKILL.md) ⭐ — multi-source factual enrichment (DATAtourisme + Wikidata + Wikipedia + Tavily).

### Vendor integrations

- [`amadeus-gds`](amadeus-gds/SKILL.md), [`little-hotelier`](little-hotelier/SKILL.md), [`competitive-pricing-comparison`](competitive-pricing-comparison/SKILL.md), [`search-engineering`](search-engineering/SKILL.md), [`payment-orchestration`](payment-orchestration/SKILL.md), [`email-workflow-automation`](email-workflow-automation/SKILL.md).

### Data & persistence

- [`supabase-postgres-rls`](supabase-postgres-rls/SKILL.md), [`redis-caching`](redis-caching/SKILL.md), [`content-modeling`](content-modeling/SKILL.md), [`auth-role-management`](auth-role-management/SKILL.md), [`backoffice-cms`](backoffice-cms/SKILL.md).

### Front-end & UX

- [`nextjs-app-router`](nextjs-app-router/SKILL.md), [`responsive-ui-architecture`](responsive-ui-architecture/SKILL.md), [`accessibility`](accessibility/SKILL.md), [`performance-engineering`](performance-engineering/SKILL.md), [`editorial-long-read-rendering`](editorial-long-read-rendering/SKILL.md) ⭐.

### SEO, GEO, structured data

- [`seo-technical`](seo-technical/SKILL.md), [`geo-llm-optimization`](geo-llm-optimization/SKILL.md), [`structured-data-schema-org`](structured-data-schema-org/SKILL.md).

### Quality, security, ops

- [`security-engineering`](security-engineering/SKILL.md), [`test-strategy`](test-strategy/SKILL.md), [`observability-monitoring`](observability-monitoring/SKILL.md), [`cicd-release-management`](cicd-release-management/SKILL.md), [`windows-dev-environment`](windows-dev-environment/SKILL.md) ⭐.

### Documentation

- [`technical-documentation`](technical-documentation/SKILL.md).

### Business verticals

- [`booking-engine`](booking-engine/SKILL.md), [`loyalty-program`](loyalty-program/SKILL.md).

## 4. Capitalisation workflow — every session adds value

The system improves only if each agent contributes the lesson they paid
for. **At the end of any non-trivial task, before closing it:**

### When to update an existing skill

Add a subsection to an existing skill when:

- You found a new edge case in a covered topic (vendor returned an
  unexpected shape, schema needed a new alias, etc.).
- You discovered a new anti-pattern.
- You found a better default value (timeouts, concurrency caps, retry
  windows).

### When to create a new skill

Create a new skill when:

- You discovered an entire new topic that took multiple iterations to
  solve and isn't covered by any existing skill.
- The pattern crosses ≥ 3 existing skills (sign that it's a foundation,
  not a detail).

### Creation checklist

```
Task progress:
- [ ] Pick the right scope: project (`.cursor/skills/`) vs personal (`~/.cursor/skills/`)
- [ ] Name: lowercase, hyphens, ≤ 64 chars, specific (not "helper" or "utils")
- [ ] Description: third person, includes WHAT + WHEN, ≤ 1024 chars
- [ ] Body ≤ 500 lines, "Triggers" section explicit
- [ ] Concrete code examples from the repo (path references)
- [ ] Anti-patterns explicit ("don't do X" with reason)
- [ ] References section cross-links related skills
- [ ] Reverse-link: add to the related skills' "References" section too
- [ ] Update this README — matrix + categories
- [ ] Update AGENTS.md "Where to look first" table if the topic is new
```

### Template

Use `~/.cursor/skills-cursor/create-skill/SKILL.md` as the authoring guide.
Each project skill in `.cursor/skills/` follows the same pattern:

```markdown
---
name: skill-name
description: >-
  One-line WHAT + WHEN. Use when <trigger 1>, <trigger 2>, or
  <user mention of X / Y / Z>.
---

# Skill name — ConciergeTravel.fr

[One paragraph: what problem this solves, why it exists.]

## Triggers

Invoke when:

- …

## Rule 1 — [Pattern name]

[Concrete code, ≤ 30 lines.]

## Rule 2 — …

## Anti-patterns

- ❌ …

## References

- Related skill 1, related skill 2.
- Reference impls: `path/to/file.ts`.
```

## 5. Discovery mechanics (for the curious)

When a Cursor session starts, the agent receives:

- **Always-applied rules** (`.cursor/rules/*.mdc` with `alwaysApply: true`)
  injected verbatim into the system prompt.
- **Skill frontmatter** (name + description only) for every `SKILL.md` in
  `.cursor/skills/`. The body is **not** loaded yet.
- **AGENTS.md** mentioned as a top-level file to read first.

The agent then decides — based on the user's task — which skill bodies to
read in full via the `Read` tool. **A good description is therefore the
single most important field**: it determines whether the skill is ever
discovered or not.

Cross-references inside skill bodies act as a discovery graph: an agent
reading `api-integration` learns about `llm-output-robustness`, which
links to `typescript-strict-zod-interop`, etc.

---

**Legend** : ⭐ = added in May 2026 sessions ; ✏️ = significantly extended in May 2026.

## 6. May 2026 — capitalisation log

This batch capitalised the editorial v2 launch:

| Pattern paid for                                                          | Capture                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| LLM truncation on multi-faceted prompts → multi-call architecture         | `llm-output-robustness`                                                                  |
| LLM extraction vs generation (temperature 0, gpt-4o-mini, evidence_quote) | `llm-output-robustness` rule 9                                                           |
| `AUTO_DRAFT` sentinels for missing facts                                  | `llm-output-robustness` rule 10                                                          |
| Pilot → validate → scale workflow                                         | `llm-output-robustness` rule 11                                                          |
| Word-count gates as warnings, not blockers                                | `llm-output-robustness` rule 12                                                          |
| `exactOptionalPropertyTypes` ↔ Zod ↔ React props interop                  | `typescript-strict-zod-interop`                                                          |
| PowerShell quoting, Supabase SSL strip, Unix commands                     | `windows-dev-environment`                                                                |
| DATAtourisme + Wikidata + Wikipedia + Tavily cascade                      | `content-enrichment-pipeline` ⭐                                                         |
| TOC sidebar + EnrichedText auto-link + callouts + sources footer          | `editorial-long-read-rendering` ⭐                                                       |
| **CSP nonce ↔ `JsonLdScript` ↔ `force-dynamic` contract** (PR #56 / #57)  | `structured-data-schema-org`, `nextjs-app-router`, `security-engineering` (all extended) |
