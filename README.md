# ConciergeTravel.fr

> OTA luxe — réservation et éditorial premium pour les hôtels 5 étoiles et Palaces en France.

ConciergeTravel.fr combine une couche éditoriale référence (modèle Tablet Hotels), un moteur de réservation temps réel connecté à Amadeus GDS et Little Hotelier, un programme de fidélité différenciant, et un comparateur de prix non-affilié. Le projet est cadré par le cahier des charges v3.0 (mai 2026) et respecte strictement la stack imposée.

## Stack

| Couche                | Technologie                                   |
| --------------------- | --------------------------------------------- |
| Framework             | Next.js 15 App Router (React 19, RSC)         |
| Langage               | TypeScript strict                             |
| Base de données       | Supabase PostgreSQL + RLS                     |
| Auth                  | Supabase Auth (`@supabase/ssr`)               |
| Cache & rate limiting | Upstash Redis                                 |
| Recherche             | Algolia                                       |
| CMS / Back-office     | Payload CMS 3                                 |
| GDS / Inventaire      | Amadeus Self-Service Hotels + Little Hotelier |
| Paiement              | Amadeus Payments (PCI géré, hors scope)       |
| Comparateur prix      | Makcorps (principal) + Apify (fallback)       |
| E-mails               | Brevo (React Email + API)                     |
| Observabilité         | Sentry + pino + Vercel Analytics              |
| Hébergement           | Vercel                                        |

## Architecture monorepo

```
.
├── apps/
│   ├── web/                # Front public + booking + compte client (Next.js 15)
│   └── admin/              # Back-office Payload CMS 3
├── packages/
│   ├── db/                 # Migrations SQL + RLS + Drizzle schema
│   ├── domain/             # Logique métier pure (DDD bounded contexts)
│   ├── integrations/       # Clients vendor (Amadeus, Little, Makcorps, Brevo, Algolia, …)
│   ├── ui/                 # Design system shadcn/ui + tokens restylables
│   ├── seo/                # JSON-LD builders, llms.txt, sitemaps, agent-skills
│   ├── emails/             # React Email templates Brevo
│   ├── observability/      # Sentry + logger pino + helpers
│   └── config/             # ESLint / TS / Tailwind / env
├── tests/                  # E2E Playwright + unit/integration partagés
├── docs/                   # Documentation produit + technique
├── .cursor/skills/         # 29 skills agent (architecture, sécurité, SEO, …)
└── .github/workflows/      # CI / migrations / e2e / Sentry release
```

## Démarrage rapide

> **Pré-requis** : Node ≥ 20.11, pnpm ≥ 10, Docker (pour Supabase local), un compte Supabase, Upstash, Algolia, Brevo, Cloudinary, Amadeus Self-Service.

```bash
# 1. Installation
pnpm install

# 2. Variables d'environnement
cp .env.example .env.local
# Remplir les valeurs — voir docs/10-environment-variables.md

# 3. Base de données (Supabase local OU projet cloud)
pnpm --filter @cct/db migrate

# 4. Développement
pnpm dev               # web + admin en parallèle
pnpm dev:web           # uniquement front
pnpm dev:admin         # uniquement back-office
```

URLs locales :

- Front public : http://localhost:3000
- Back-office Payload : http://localhost:3001

## Scripts

| Script           | Action                                  |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Démarre `apps/web` + `apps/admin`       |
| `pnpm build`     | Build de tout le monorepo (Turborepo)   |
| `pnpm lint`      | ESLint sur l'ensemble                   |
| `pnpm typecheck` | TypeScript strict sur tous les packages |
| `pnpm test`      | Vitest unit + integration               |
| `pnpm test:e2e`  | Playwright (mobile + desktop)           |
| `pnpm format`    | Prettier sur tout le repo               |

## Documentation

- [`docs/00-conception-et-phasage.md`](docs/00-conception-et-phasage.md) — phasage CDC, cartographie docs ↔ phases, MVP vs post-MVP, reprise conception
- [`docs/01-architecture.md`](docs/01-architecture.md) — couches, monorepo, rendu hybride
- [`docs/02-data-model.md`](docs/02-data-model.md) — schéma Supabase + RLS
- [`docs/03-integrations/`](docs/03-integrations/) — runbooks par vendor
- [`docs/04-seo-geo-aeo.md`](docs/04-seo-geo-aeo.md) — topic clusters, anti-cannibalisation, JSON-LD, llms.txt
- [`docs/05-booking-flow.md`](docs/05-booking-flow.md) — état machine, tunnel, paiement, idempotence
- [`docs/06-loyalty.md`](docs/06-loyalty.md) — tiers FREE / PREMIUM
- [`docs/07-deployment.md`](docs/07-deployment.md) — environnements et rollback
- [`docs/08-backoffice-operations.md`](docs/08-backoffice-operations.md) — opérations Payload
- [`docs/09-checklists/`](docs/09-checklists/) — SEO / launch QA / sécurité
- [`docs/10-environment-variables.md`](docs/10-environment-variables.md) — référence env complète
- [`docs/adr/`](docs/adr/) — Architecture Decision Records

## Skills agent (Cursor)

Les 29 skills sous [`.cursor/skills/`](.cursor/skills/) encadrent l'agent : architecture produit, DDD, Next.js, TypeScript strict, Supabase RLS, auth, Redis, intégrations API, Amadeus, Little Hotelier, paiement, booking engine, SEO/GEO/AEO, structured data, content modeling, search, back-office CMS, fidélité, comparateur prix, e-mail workflow, UI responsive, accessibilité, performance, observabilité, tests, CI/CD, documentation, sécurité.

## Licences et statut

Code propriétaire — `UNLICENSED`. Cahier des charges v3.0 (mai 2026) est la référence contractuelle ; toute déviation passe par un ADR.
