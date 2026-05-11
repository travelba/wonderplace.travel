# ADR 0007 — ISR via client island pour la zone d'authentification

- Status: accepted
- Date: 2026-05-11
- Refs: skill `nextjs-app-router`, skill `performance-engineering`, Sprint 4.1 du plan post-audit Phase 9

## Décision

On extrait la lecture de session Supabase de `SiteHeader` (Server Component) vers un **client island** `<AuthArea />` (`apps/web/src/components/layout/auth-area.tsx`).
Conséquence directe : le layout `/[locale]/layout.tsx` ne lit plus `cookies()`, l'arbre redevient statique, et toutes les pages publiques peuvent passer en **ISR (`export const revalidate = 3600`)**.

Pages basculées :

- `apps/web/src/app/[locale]/hotel/[slug]/page.tsx` — `force-dynamic` → `revalidate = 3600`
- `apps/web/src/app/[locale]/destination/[citySlug]/page.tsx` — `force-dynamic` → `revalidate = 3600`

Pages laissées en `force-dynamic` à dessein :

- `compte/*` (zone authentifiée, jamais cacheable)
- `reservation/*` (tunnel transactionnel avec offre verrouillée 10 minutes)
- `auth/callback`, `compte/deconnexion`, route handlers Supabase
- API routes (`/api/health`, `/api/search/suggest`, `/api/price-comparison`)

## Contexte

Avant Sprint 4.1, `SiteHeader` était un Server Component qui appelait `getOptionalUser()` (lecture cookie + Supabase). Le layout partagé étant lui-même un Server Component, Next.js considérait l'intégralité de l'arbre comme dynamique : chaque rendu de `/hotel/<slug>` ou `/destination/<city>` exigeait `force-dynamic`, et `revalidate` n'avait aucun effet (erreur `DYNAMIC_SERVER_USAGE` en build).

Conséquences sur la performance :

- **LCP fragile** sur fiches hôtel et hubs destination (chaque visite = SSR fresh)
- **Coût Vercel** : chaque rendu déclenche les requêtes Supabase / Amadeus sentiments / batch ratings, malgré une cacheabilité naturelle élevée
- **CDN** sous-utilisé : `s-maxage` ne suffit pas à compenser l'absence d'ISR build-time

## Alternative considérée

**Conserver la session côté serveur via un endpoint dédié `/api/session`** consommé par un client island. Rejeté : ajoute un round-trip réseau supplémentaire (≈ 60–150 ms perçus sur l'auth area) là où le browser Supabase client (`@supabase/ssr`) lit la session de manière synchrone après hydratation grâce au cookie déjà présent.

## Conséquences

### Positives

- **ISR effective** sur les deux gros types de pages indexables → LCP attendu < 1.5 s sur CDN chaud.
- **Coûts Supabase** réduits : pour les hubs, on passe de 1 lecture par visite à 1 lecture par revalidation (3600 s).
- **Layout stable** : le placeholder `bg-muted/30` réserve la box de l'auth area pendant l'hydratation, pas de CLS perceptible.
- **Aligne le code avec la skill `nextjs-app-router`** : Server Components par défaut, client islands réservées à l'interactivité réelle (ici : connaître l'utilisateur courant).

### Négatives

- L'auth area "flashe" brièvement (placeholder pulsant) lors de la première visite. Atténué par : (1) skeleton de la même largeur que le CTA résolu, (2) la session Supabase est en cookie → la résolution est instantanée après hydratation, (3) ne concerne que les bots / utilisateurs non authentifiés (les bots ne voient jamais l'auth area car la session est nulle, ils stabilisent immédiatement).
- Le bundle JS de `AuthArea` ajoute ~3 KB gzipped (déjà couvert par le client Supabase, partagé avec d'autres pages compte/réservation).

## Impacts sur le pipeline

- `apps/web/e2e/smoke.spec.ts` continue à passer : le placeholder n'occulte pas les assertions du header.
- Le typecheck `tsc --noEmit` et le lint Next 15 passent sans modification supplémentaire.
- Aucun changement de schéma DB, aucun changement RLS, aucun nouveau secret.

## Plan de rollback

En cas de régression, retourner le commit qui introduit `auth-area.tsx` et ré-ajouter `export const dynamic = 'force-dynamic'` sur les deux pages. Aucune migration ni provisioning à revert.

## Suivi

- Vérifier en preview Vercel que les rapports Lighthouse remontent un score Perf > 90 sur `/hotel/<slug>` (avant : variable selon la charge Supabase).
- Surveiller le hit-ratio CDN dans Vercel Analytics — attendu > 80 % sur les fiches hôtel à J+7.
