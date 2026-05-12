---
name: cicd-release-management
description: CI/CD and release management for ConciergeTravel.fr — GitHub Actions, Vercel previews, Supabase migrations, Sentry releases, environment promotion. Use whenever you add or modify CI workflows, release processes, or environment handling.
---

# CI/CD and release management — ConciergeTravel.fr

The pipeline must support **fast iteration**, **safe migrations**, and **one-click rollback**. We use GitHub Actions + Vercel + Supabase CI.

## Triggers

Invoke when:

- Editing `.github/workflows/*.yml`.
- Changing Vercel project settings, environment variables, or build commands.
- Adding a Supabase migration that needs ordered application.
- Setting up Sentry release tracking, source maps, or environment promotion.

## Environments

| Env          | Branch / source        | URL                                |
| ------------ | ---------------------- | ---------------------------------- |
| `dev`        | local + Supabase local | `localhost:3000`, `localhost:3001` |
| `preview`    | every PR               | `<pr>.cct-preview.vercel.app`      |
| `staging`    | `develop` branch       | `staging.conciergetravel.fr`       |
| `production` | `main` branch          | `conciergetravel.fr`               |

Database environments map to **separate Supabase projects** for `staging` and `production`. Preview deployments use the staging DB unless an `e2e/` tag triggers an ephemeral schema (Phase 2 enhancement).

## Workflows

### `ci.yml` — every PR

1. Setup Node 20, pnpm 9, Turborepo cache.
2. `pnpm install --frozen-lockfile`.
3. `pnpm turbo run lint typecheck test:unit` (parallel).
4. `pnpm turbo run build` for `apps/web` and `apps/admin`.
5. Comment Vercel preview URL.

### `e2e.yml` — PR + push to main

- Spin up `apps/web` against staging DB + Algolia staging index.
- Run Playwright with mobile + desktop projects.
- Upload trace on failure.

### `lighthouse.yml` — push to main + weekly

- Run Lighthouse CI against 5 strategic URLs in production.
- Fail on regression beyond thresholds.

### `migrate.yml` — push to main

1. Download Supabase CLI.
2. `supabase db push` against staging first; on success, against production.
3. Tag deployment in Sentry as a release marker.

### `sentry-release.yml` — push to main

- Upload source maps for `apps/web` and `apps/admin`.
- Set `SENTRY_RELEASE = github.sha`.
- Mark deploy.

### Cron / scheduled

- Nightly `e2e-amadeus-smoke.yml` against Amadeus test env.
- Weekly `dependency-audit.yml` (`pnpm audit`, `npm-check-updates`).

## Non-negotiable rules

### Branch protection

- `main` and `develop` protected. Required: PR review (1 approver), passing CI, `lint`, `typecheck`, `test:unit`, `e2e`.
- No force pushes. No direct commits to `main`.

### Migrations

- All schema changes via SQL files in `packages/db/migrations/`. Never via Supabase Studio in non-dev envs.
- Migrations are forward-compatible (additive when possible).
- Backwards-incompatible migrations require an ADR + downtime window.

### Vercel

- `apps/web` and `apps/admin` are separate Vercel projects pointing to the same monorepo with different `rootDirectory`.
- Build command leverages Turborepo cache.
- Env vars per environment in Vercel UI; `.env.example` lists every variable.

### Releases

- SemVer for the monorepo (changesets optional Phase 2).
- Each merge to `main` generates a Sentry release `cct-web@<sha>` and `cct-admin@<sha>`.

### Rollback

- Vercel "Promote previous deployment" for app rollback.
- Supabase backups daily + PITR enabled. Migration rollback via reverse SQL files when feasible.

### Secrets

- Stored in GitHub Actions and Vercel only. Never in repo.
- `gh secret list` audited weekly.

## Anti-patterns to refuse

- Skipping CI with `[skip ci]` on production-bound PRs.
- Long-lived feature branches without rebasing.
- Manual deploys to production from a developer machine.
- Migrations applied manually without going through `migrate.yml`.

## References

- CDC v3.0 §13 (phasage), §15 (livrables).
- Vercel + Supabase docs.
- `test-strategy`, `observability-monitoring`, `security-engineering` skills.
