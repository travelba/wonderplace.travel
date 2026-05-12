# Vercel — Setup et déploiement monorepo

> Runbook ops. Cible : un mainteneur qui (re)configure le projet Vercel `wonderplace-travel` après import ou refonte du monorepo.

## Contexte

Le repo est un monorepo pnpm + Turborepo avec deux apps déployables :

- `apps/web` → front public (Next.js 15 App Router) — projet Vercel `wonderplace-travel`
- `apps/admin` → back-office Payload CMS 3 — projet Vercel séparé à créer (cf. §3)

Le `package.json` à la racine **ne contient pas** `next` (il décrit le monorepo, pas une app), donc Vercel doit recevoir explicitement le chemin de l'app via **Root Directory**. Sans ça, Vercel cherche `next` à la racine, ne le trouve pas, et plante avec :

```
Error: No Next.js version detected. Make sure your package.json has "next" in either "dependencies" or "devDependencies".
```

C'est le mode d'échec observé sur les 20+ premiers déploiements (preview comme production) du projet `wonderplace-travel` jusqu'à ce que ce runbook soit appliqué.

## 1 — Configurer le projet existant `wonderplace-travel` (front public)

### 1.1 Root Directory

1. Vercel Dashboard → équipe **Travelba** → projet **wonderplace-travel**
2. Onglet **Settings → Build & Development Settings**
3. **Root Directory** : passer de `(vide)` à `apps/web`
4. Cocher **Include source files outside of the Root Directory in the Build Step** (sinon les packages workspace `@cct/*` ne sont pas accessibles à la build)
5. **Save**

### 1.2 Node version

Le repo CI pin Node `20.19.4` (cf. `.nvmrc` et `.github/workflows/ci.yml`). Pour éviter les divergences runtime entre Vercel et CI :

1. Settings → **General → Node.js Version**
2. Choisir **20.x** (Vercel résout vers la dernière LTS 20)
3. Save

### 1.3 Variables d'environnement

Variables obligatoires côté Vercel (Settings → Environment Variables). Référence complète : [`docs/10-environment-variables.md`](../10-environment-variables.md).

Pour un premier déploiement preview rapide sans wirer tous les vendors, on peut shunter la validation Zod du package `@cct/config/env` en ajoutant :

| Variable               | Scope           | Valeur                                                                                               |
| ---------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `SKIP_ENV_VALIDATION`  | Preview + Build | `true`                                                                                               |
| `NEXT_PUBLIC_SITE_URL` | Preview, Prod   | `https://wonderplace-travel-travelba.vercel.app` (preview) / `https://www.conciergetravel.fr` (prod) |

Pour un vrai déploiement production, retirer `SKIP_ENV_VALIDATION` et fournir toutes les variables listées dans `.env.example` (Supabase, Cloudinary, Upstash, Algolia, Brevo, Amadeus, Sentry, Makcorps).

### 1.4 Build Command

Le fichier `apps/web/vercel.json` ajouté par ce PR force déjà les bonnes commandes via :

```jsonc
{
  "framework": "nextjs",
  "regions": ["cdg1"],
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=@cct/web",
  "outputDirectory": ".next",
  "ignoreCommand": "cd ../.. && npx turbo-ignore @cct/web",
}
```

- `installCommand` remonte à la racine pour installer tout le workspace (les `@cct/*` consommés par `apps/web` doivent être présents).
- `buildCommand` passe par Turborepo pour respecter l'ordre des builds des packages dépendants (`@cct/db`, `@cct/domain`, `@cct/seo`, etc.) — gère aussi le remote cache si `TURBO_TOKEN`/`TURBO_TEAM` sont définis côté Vercel.
- `outputDirectory` reste `.next` parce que Vercel évalue ce chemin **relatif au Root Directory** (donc `apps/web/.next`).
- `ignoreCommand` court-circuite la build quand le diff PR ne touche ni `apps/web` ni ses packages dépendants. Évite de cramer des minutes Vercel pour un PR qui ne modifie que la doc.

Aucune modification de Build Command côté dashboard n'est requise — laisser Vercel lire le `vercel.json`. Le champ "Build Command" dans Settings doit rester sur **(Auto-détecté)**.

### 1.5 Trigger redeploy

1. Settings → **Deployments** → cliquer sur le dernier déploiement → **Redeploy** (sans cache)
2. Ou pousser un commit no-op sur `main` (ex : `git commit --allow-empty -m "chore: trigger vercel redeploy"`)

Vérifier que l'état passe à `READY` (pas `ERROR`). Tester l'URL preview, vérifier les routes `/fr`, `/en`, `/api/health`, `/llms.txt`, `/sitemap.xml`, `/.well-known/agent-skills.json`.

## 2 — Créer le projet Vercel `apps/admin` (back-office Payload)

Le back-office Payload est volontairement isolé sur un projet distinct (sécurité, scaling, domaine séparé). Procédure :

1. Vercel Dashboard → **Add New → Project**
2. Sélectionner le repo `travelba/conciergetravel.fr`
3. **Project Name** : `conciergetravel-admin` (ou `wonderplace-travel-admin` pour cohérence avec le nom legacy de l'autre projet)
4. **Root Directory** : `apps/admin`
5. **Include source files outside of the Root Directory** : coché
6. **Framework Preset** : Next.js
7. Node version : 20.x
8. Variables d'environnement : copier celles du projet `wonderplace-travel` + ajouter `PAYLOAD_SECRET` (clé Payload) + `PAYLOAD_DATABASE_URI` (URL Postgres directe, pas le pooler — Payload a besoin de connexions longue durée).
9. **Deploy**.

Un `apps/admin/vercel.json` symétrique pourra être ajouté plus tard pour la Build Command Turbo (`pnpm turbo run build --filter=@cct/admin`).

## 3 — Domaines

| Projet                  | Branche prod | Domaine cible              |
| ----------------------- | ------------ | -------------------------- |
| `wonderplace-travel`    | `main`       | `www.conciergetravel.fr`   |
| `conciergetravel-admin` | `main`       | `admin.conciergetravel.fr` |

Setup DNS (chez le registrar) :

- `CNAME www → cname.vercel-dns.com`
- `CNAME admin → cname.vercel-dns.com`
- `A @ → 76.76.21.21` (apex domain redirect Vercel)

Activer **HTTPS automatique** côté Vercel (Let's Encrypt, géré par défaut).

## 4 — Rollback

Vercel garde 20+ deploys par projet. En cas de régression production :

1. Project → **Deployments**
2. Sélectionner le dernier déploiement sain (état `READY`, target `production`)
3. Menu `⋯` → **Promote to Production**
4. Le DNS bascule en quelques secondes.

Pour la DB Supabase, voir le runbook PITR à venir (`docs/runbooks/supabase-pitr.md`, TODO).

## 5 — Diagnostic en cas d'échec build

| Symptôme                                           | Cause probable                                                                           | Fix                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `No Next.js version detected`                      | Root Directory non défini ou pointe sur la racine du monorepo                            | §1.1 — set Root Directory = `apps/web`                                        |
| `Cannot find module '@cct/db'` (ou autre `@cct/*`) | "Include source files outside of the Root Directory" non coché                           | §1.1 — cocher la case                                                         |
| `Cannot find matching keyid` (corepack)            | Vercel Node trop ancien, clés pnpm périmées                                              | §1.2 — Node 20.x (ou bumper à 22.x si pnpm 11+)                               |
| `Invalid environment variables: ...`               | `@cct/config/env` Zod validation échoue (variables manquantes)                           | §1.3 — soit définir les variables, soit `SKIP_ENV_VALIDATION=true` en preview |
| Build OK mais 500 runtime au premier hit           | Variables d'env runtime (Supabase URL, etc.) manquantes côté Vercel (différent du build) | §1.3 — vérifier scope "Runtime" en plus de "Build" sur chaque variable        |
| Preview marche, prod plante                        | Variables présentes en `Preview` mais pas en `Production`                                | §1.3 — couvrir les trois scopes (Production, Preview, Development)            |

## Références

- [Docs Vercel — Monorepos](https://vercel.com/docs/monorepos)
- [Docs Vercel — Turborepo guide](https://vercel.com/docs/monorepos/turborepo)
- [Docs Vercel — Build & Development Settings](https://vercel.com/docs/projects/project-configuration#build-development-settings)
- Skill ConciergeTravel : `.cursor/skills/cicd-release-management/SKILL.md`
- Doc env vars : [`docs/10-environment-variables.md`](../10-environment-variables.md)
