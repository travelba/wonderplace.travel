# AGENTS.md — ConciergeTravel.fr

> Hi 👋. This file is for **AI coding agents** (Cursor, Claude, Codex CLI, …) that land in this repo.
> Read it once at the start of a session, then jump to the relevant skills/rules for the task.

## 1. What this project is

ConciergeTravel.fr is an **IATA-accredited online travel agency** for 5-star hotels and Palaces in France.
The product is split into:

- **`apps/web`** — the public Next.js 15 site (booking, search, editorial, account).
- **`apps/admin`** — the Payload CMS back-office.
- **`packages/`** — shared domain, integrations, SEO, emails, DB, observability, UI primitives.

The monorepo is **pnpm + Turborepo**. TypeScript is **strict** (no `any`, no `as` casts, no `!`).

## 2. Layering — the only architecture diagram you need

```
┌──────────────────────────────────────────────────────────────┐
│  apps/web         apps/admin                                 │
│       ↘             ↙                                        │
│   packages/seo, /emails, /ui, /db, /observability, /config   │
│                       ↑                                      │
│        packages/integrations/<vendor>/  ← Zod, HTTP, Redis   │
│                       ↑                                      │
│              packages/domain/  ← pure TS, no I/O             │
└──────────────────────────────────────────────────────────────┘
```

Lower layers **never** import from higher layers. See `.cursor/rules/architecture-layers.mdc`.

## 3. Where to look first

| Task                                          | Start here                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| Add a business rule                           | `packages/domain/` + `.cursor/rules/architecture-layers.mdc`                     |
| New vendor integration                        | `.cursor/skills/api-integration/SKILL.md` + `.cursor/rules/integrations-api.mdc` |
| New public route                              | `apps/web/src/app/[locale]/` + `.cursor/rules/nextjs-app-router.mdc`             |
| **Hotel detail page** (15 blocks)             | `.cursor/rules/hotel-detail-page.mdc` (CDC §2 checklist + ADR-0007/0008/0009)    |
| Room sub-page `/hotel/[slug]/chambres/[room]` | `.cursor/rules/hotel-detail-page.mdc` + ADR-0009                                 |
| New Supabase table / RLS policy               | `packages/db/migrations/` + `.cursor/rules/supabase-rls.mdc`                     |
| JSON-LD / robots / llms.txt                   | `packages/seo/` + `.cursor/rules/seo-geo.mdc`                                    |
| Payload collection / back-office hook         | `apps/admin/` + `.cursor/skills/backoffice-cms/SKILL.md`                         |
| E2E for a new journey                         | `apps/web/e2e/` + `.cursor/rules/e2e-testing.mdc`                                |
| Security / CSP / auth                         | `.cursor/rules/security-csp.mdc`                                                 |
| Perf, Sentry, logs                            | `.cursor/rules/observability-perf.mdc`                                           |

### Structural decisions already taken (don't relitigate without an ADR)

| Decision                                                               | Reference                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Hotel URL = `/hotel/<slug>` (flat slug, against CDC §3.3)              | [ADR-0008](docs/adr/0008-url-structure-hotel-flat.md)      |
| Room sub-pages `/hotel/<slug>/chambres/<room-slug>` indexable          | [ADR-0009](docs/adr/0009-hotel-room-subpages-indexable.md) |
| ISR via auth client island (hotel + destination = `revalidate = 3600`) | [ADR-0007](docs/adr/0007-isr-via-auth-client-island.md)    |
| Locales V1 = `fr` + `en` ; V2 = +es/de/it ; V3 = +ar/zh/ja             | `.cursor/skills/seo-technical/SKILL.md`                    |

## 4. Hard rules (non-negotiable)

### Code

1. **No `any`, no `as Foo`, no non-null `!`.** Narrow with Zod or type guards.
2. **No `dangerouslySetInnerHTML`** outside the `JsonLdScript` Server Component.
3. **No PII in logs.** Hash, omit, or summarise. Never email/phone/full name/payment.
4. **No new layer-crossing imports.** Domain never imports `fetch`, `next/*`, `@supabase/*`.
5. **Migrations are forward-only.** Don't edit applied SQL. Don't reorder filenames.
6. **i18n keys, not hard-coded strings.** Even error messages.
7. **Server Components by default.** `'use client'` requires real interactivity.
8. **One `Sentry.init` per runtime.** Use the existing `instrumentation*.ts` files.

### Hotel detail page (CDC §2 — `.cursor/rules/hotel-detail-page.mdc`)

9. **≥ 30 photos catégorisées** (10 categories required) avant publication. Validation Payload bloque.
10. **≥ 10 FAQ Q&A** (les 10 questions canoniques obligatoires). Validation Payload bloque.
11. **`AggregateRating.bestRating: '5'`** dans le JSON-LD. Jamais `'10'` (Google Rich Results affiche /5 quoi qu'il arrive).
12. **`Offer.priceValidUntil`** obligatoire (CDC §2.8).
13. **Indicateurs d'urgence** ("X personnes consultent", "stock restant") **interdits** sauf preuve Amadeus (`offer.availability: 'LimitedAvailability'` réelle) — DSA art. 25, DGCCRF.
14. **Awards** rendus en JSON-LD uniquement si `verified: true` côté Payload.
15. **Room sub-page canonical** strict vers elle-même, jamais vers la fiche parent.
16. **Alt enrichi** mots-clés + contexte sur toute image hôtel (`alt="piscine extérieure chauffée Hôtel X Nice"`).

## 5. Operational essentials

- **Database**: live Supabase project ID `fsmfozxgujskluxakeoq` (region eu-west). Currently empty (0 rows). Migrations applied via the Supabase MCP (`apply_migration`).
- **Vercel**: previews per PR, production = `main`. Sentry source maps uploaded on prod builds only (`SENTRY_AUTH_TOKEN`).
- **CI**: GitHub Actions runs lint → typecheck → unit → build → e2e. Husky `pre-commit` runs `lint-staged`, `pre-push` runs `tsc --noEmit`.
- **MCP servers** wired up locally: Supabase, Cloudinary, Sanity, Resend, Tavily, Datadog, Opsera, Vercel, GitHub, Superhuman, shadcn. Prefer MCP tools to manual shell when the task fits.

## 6. Commit / PR hygiene

- Conventional Commits: see `.cursor/rules/commit-conventions.mdc`.
- One concern per PR. Prefer 5 small PRs over a 60-file giant.
- Always update or add a test alongside a business-rule change.
- Reference an ADR (`docs/adr/0000-*.md`) when you change a layer boundary or rendering strategy.

## 7. When in doubt

- Check `.cursor/skills/<topic>/SKILL.md` — there are 30+ skills covering every vertical.
- Open `docs/adr/` for past decisions.
- Ask a human before disabling a CI check, lowering a Supabase RLS policy, or removing a Sentry init.

Welcome aboard.
