# ADR 0006 — Seams E2E (in-memory Redis + dev-fake hotels/offers)

- Status: accepted
- Date: 2026-05-11
- Refs: skill `test-strategy` (§E2E + §"Test seams"), skill `redis-caching` (§quotas et idempotence), CDC §6 (booking) et §10 (comparateur)

## Décision

Pour permettre à la suite Playwright de couvrir le **tunnel paid Amadeus** (offer-lock → invite → recap → payment), le tunnel **email-mode** complet et les **fiches hôtel** dans un environnement CI **sans Supabase, Redis, Algolia, Amadeus ni Brevo réels**, on introduit quatre seams cumulables, activables uniquement via variables d'environnement explicites :

1. **`apps/web/src/lib/redis-memory.ts`** — store Upstash-Redis in-process (Map + TTL absolu), implémentant strictement le sous-ensemble consommé : `get / set (ex, nx) / del / incr / expire`. Substitué dans `lib/redis.ts` dès que `CCT_E2E_FAKE_HOTEL_ID` est posé.
2. **`getFakeHotelHead(id)`** (`server/booking/dev-fake-hotel.ts`) — hôtel `booking_mode = 'email'` synthétique, ciblé par UUID configuré dans `CCT_E2E_FAKE_HOTEL_ID`.
3. **`getFakePaidHotelHead(id)`** (même fichier) — variante `booking_mode = 'amadeus'`, ciblée par `CCT_E2E_FAKE_PAID_HOTEL_ID`. Branchée dans `lock-offer.ts::fetchHotelSnapshot` avant l'appel Supabase.
4. **`createFakeOfferForDev` + `isFakeOffersEnabled`** (`server/booking/dev-fake-offer.ts`) — offre Amadeus synthétique (€250/nuit, EUR, 10 min TTL, cancellation verbatim). Activé en `production` uniquement si le seam paid est configuré.

Tous les seams sont **inactifs en l'absence** de leurs variables d'environnement respectives — il n'y a aucun mode "automatique" qui pourrait fuir en production.

## Contexte

La skill `test-strategy` impose une suite Playwright qui couvre les journeys clé (booking, recherche, compte). Le tunnel paid pose trois difficultés :

- **Persistance d'état entre étapes** : `lockOffer → /invite → /recap → /payment` repose sur un cookie de draft + un store Redis. Sans Redis CI, chaque étape isole.
- **Données hôtel** : `fetchHotelSnapshot` exige une ligne `hotels` publiée et `booking_mode IN ('amadeus','little')` côté Supabase. Sans Supabase CI, on n'a pas d'hôtel "réservable".
- **Crédits GDS** : `priceOffer` appelle Amadeus. Aucun compte sandbox CI provisionné aujourd'hui (cf. ADR 0001 §"Amadeus" — déjà signalé comme Phase 2).

Les contraintes du projet :

- Tests E2E doivent **tourner en CI gratuite GitHub Actions** (pas de service container Redis/Postgres tournant).
- Le build `next start` (production NODE_ENV) doit être exercé pour ne pas masquer de bugs SSR.
- Le code de production **ne doit pas** être pollué par des `if (env.NODE_ENV === 'test')` partout.

## Alternatives considérées

1. **Service containers GitHub Actions (postgres + redis)** — rejeté : ~120 s de boot, dépendances pnpm pour seed Supabase, équivalent rotatif d'un environnement preview qui complique la diagnostic des flakes. Le seam in-memory est < 5 ms.
2. **Mock global via Vitest** — rejeté : un test E2E par définition exerce le bundle Next.js construit; aucun hook MSW disponible côté Node Edge ou App Router.
3. **`@upstash/redis-mock`** — rejeté : couvre `eval`/`evalsha` mais devient une dépendance npm tierce non maintenue. Notre stub fait < 130 lignes et couvre exactement ce qu'on utilise.
4. **Mode "fake" branché en runtime via header HTTP** — rejeté : un attaquant qui découvre le header obtient un by-pass des contrôles métier en production. Les env vars sont une frontière de configuration, pas un input réseau.
5. **Skipper le tunnel paid en E2E** — rejeté : le state-machine `BookingDraft` est la partie la plus sujette aux régressions. Les tests unitaires couvrent les transitions mais pas le câblage cookie/Redis/route handlers.

## Conséquences

### Positives

- 22 tests Playwright additionnels (11 cas × 2 projets chromium/mobile) couvrant le tunnel paid complet jusqu'à l'écran de paiement stub.
- Le seam Redis in-memory est **réutilisable** pour toute future spec exerçant `idempotency.ts`, `quota.ts`, `service.ts (price-comparison cache)`, etc.
- La harderisation `try/catch` autour de `getSupabaseAdminClient()` dans `fetchHotelSnapshot` apporte **un bénéfice production** : Supabase down ne renvoie plus 500 sur la lock route mais redirige proprement vers `/recherche?error=hotel_not_bookable_online`.
- Le bypass explicite `isE2EBypass()` dans `rate-limit.ts` documente le contrat E2E sans changer la sémantique production (Ratelimit reste actif quand l'env var n'est pas posée).

### Négatives

- **Surface API stub à maintenir** : si un caller introduit `eval` / `scriptLoad` / `zadd`, le stub jette `unimplemented method`. Le code lance un test E2E qui exhibera l'erreur dans les logs WebServer — c'est volontaire, mieux que des défauts silencieux.
- **Pas de garantie de comportement identique à Upstash** sur les cas tordus (atomicité multi-clés, transactions). Aucun de nos usages n'en a besoin aujourd'hui.
- **Deux UUIDs E2E à mémoriser** : `11111111-…-555555555555` (email) et `22222222-…-666666666666` (paid). Centralisés dans `apps/web/e2e/fixtures/env.ts`.

### Garde-fous

- Toutes les variables d'environnement seam (`CCT_E2E_*`) sont préfixées de manière reconnaissable et **uniquement positionnées par `playwright.config.ts`**. Aucun fichier `.env*` ne les contient.
- Les seams logiques (paid hotel, fake offer) ne se déclenchent que quand l'UUID demandé correspond exactement à la valeur configurée — un appel avec un UUID arbitraire retombe sur le chemin Supabase normal.
- Le stub Redis utilise un `Proxy` qui jette une erreur claire pour toute méthode non implémentée, garantissant qu'un changement de surface côté `@upstash/redis` se manifeste tout de suite plutôt que par un comportement silencieux divergent.

## Trace de validation

- `pnpm -r typecheck` : 0 erreur sur les 4 nouveaux modules et leurs callers.
- `pnpm -r test` : 114 unit tests Vitest verts, aucune régression.
- `pnpm --filter @cct/web test:e2e` : 128 tests Playwright (125 passed + 3 skipped intentionnels) sur Chromium desktop + Pixel 5 mobile, build Next.js production.
- Job CI `e2e` ajouté à `.github/workflows/ci.yml` avec cache `~/.cache/ms-playwright` keyé sur la version Playwright pour ramener le run à ~3 min sur cache hit.
