# ADR 0002 — Monorepo Turborepo + pnpm workspaces

- Status: accepted
- Date: 2026-05-06
- Refs: cahier des charges v3.0 §2, §11

## Décision

Le projet est organisé en monorepo `pnpm workspaces` orchestré par **Turborepo**. Deux applications (`apps/web`, `apps/admin`) et 8 packages partagés (`packages/{db,domain,integrations,ui,seo,emails,observability,config}`).

## Contexte

- Le back-office Payload CMS et le front public sont deux applications Next.js distinctes mais doivent partager : modèle de données, types Zod, builders SEO, design system, configuration TS/ESLint, intégrations vendor (Amadeus, Brevo, Algolia, Cloudinary).
- Les contextes métier (DDD) doivent être implémentés en TypeScript pur, indépendamment de Next.js, pour rester testables.
- Builds incrémentaux requis pour la rapidité CI.

## Alternatives considérées

1. **Une seule app Next.js avec dossier `/admin`** — rejetée : Payload nécessite son propre contexte runtime, avec son routeur et ses dépendances. Les couplages auraient compromis la maintenabilité.
2. **Nx** — comparable, mais Turborepo est plus simple et suffit pour ce périmètre.

## Conséquences

- Exposition de packages internes via `@cct/*` paths (configurés dans `tsconfig.base.json`).
- Discipline d'imports : pas d'import direct entre apps ; tout passe par `packages/`.
- Cache Turborepo : significativement plus rapide en CI (`build`, `lint`, `typecheck` cachés par hash d'entrées).
- Une lockfile unique `pnpm-lock.yaml` à la racine.
