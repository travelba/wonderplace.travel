# Déploiement — ConciergeTravel.fr

> Document rempli en Phase 10. Couvre :
>
> - Environnements : `dev` (local + Supabase local), `preview` (PR Vercel + DB staging), `staging` (`develop`), `production` (`main`).
> - Vercel : `apps/web` et `apps/admin` = deux projets séparés, `rootDirectory` distincts.
> - Build cache Turborepo (TURBO_TOKEN/TURBO_TEAM en CI).
> - Supabase : projets distincts staging/production, migrations versionnées via `supabase db push`.
> - Secrets : Vercel + GitHub Actions (jamais dans le repo).
> - Sentry releases : tag `cct-web@<sha>`, source maps uploadées en CI.
> - Rollback : Vercel Promote previous + Supabase PITR (Point-in-Time-Recovery).
> - Health endpoint : `/api/health` ping Supabase / Redis / Algolia / Amadeus.

## Runbooks ops

- [`docs/runbooks/vercel-setup.md`](runbooks/vercel-setup.md) — setup et reconfiguration du projet Vercel `wonderplace-travel` (Root Directory, Node version, env vars, redeploy, rollback, diagnostic).

Skill : `cicd-release-management`.
