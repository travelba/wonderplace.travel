# ADR 0010 — Payload Hotels: dual-table mirror (`cms.hotels` + `public.hotels`)

- Status: accepted
- Date: 2026-05-11
- Refs:
  - ADR 0003 (Payload CMS retenu)
  - cahier des charges v3.0 §11.2 (back-office)
  - `apps/admin/src/collections/hotels.ts`
  - `packages/db/migrations/0009_create_cms_schema.sql`

## Décision

L'édition back-office des hôtels via Payload CMS 3 utilise un **schéma Postgres dédié `cms`**, hermétiquement séparé du schéma `public` qui héberge la base canonique applicative.

Concrètement :

- Toutes les tables auto-créées par `@payloadcms/db-postgres` (users, payload_migrations, payload_locked_documents, hotels, etc.) vivent sous `cms.*`.
- La table `public.hotels`, gérée par les migrations SQL (`packages/db/migrations/*.sql`), reste la **source de vérité** lue par `apps/web`.
- Le sync `cms.hotels → public.hotels` est un **hook `afterChange`** côté Payload (Phase 8.1) qui :
  1. Mappe les champs Payload vers les colonnes `public.hotels`.
  2. Effectue un `UPSERT` SQL idempotent par `slug`.
  3. Appelle l'endpoint signé `/api/revalidate?tag=hotel-<slug>` côté `apps/web` (skill: `nextjs-app-router`, ISR).
  4. Pousse l'index Algolia via `syncHotelPublicationToAlgolia` (skill: `search-engineering`).

Aujourd'hui (Phase 8 chantier D), seul le mirror éditorial est en place. L'`afterChange` logge l'opération mais ne fait **pas** encore le UPSERT — édit aveugle volontaire pour permettre à l'éditorial de jouer avec l'UI sans risque de corruption de la production.

## Contexte

ADR 0003 a tranché : Payload CMS 3. Reste à choisir comment Payload coexiste avec un schéma Postgres déjà peuplé et régi par des contraintes strictes (RLS, triggers, FKs, indices GIN, CHECK constraints).

Trois architectures envisagées :

| #   | Stratégie                                                                                  | Avantages                                                                                                | Inconvénients                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Payload owne directement `public.hotels`** (Drizzle introspection + `beforeSchemaInit`). | Une seule table, pas de sync.                                                                            | Réécriture complète de l'introspection ; Payload risque d'ALTER les contraintes existantes ; rétro-compatibilité fragile lors de chaque montée de version Payload. **Risque élevé sur données réelles.** |
| B   | **Payload gère sa propre table `cms.hotels`** + hook de sync vers `public.hotels`.         | Isolation totale, Payload reste « stupide », rollback trivial, indépendant des breaking changes Payload. | Double écriture en mémoire (1 ligne `cms`, 1 ligne `public`), sync à maintenir.                                                                                                                          |
| C   | **Pas d'adapter DB pour les hôtels** (REST custom directement vers Supabase).              | Pas de duplication.                                                                                      | Perte des drafts/versioning/RBAC granulaire Payload — annule l'intérêt même de Payload.                                                                                                                  |

## Alternatives rejetées

- **A** rejetée : trop risquée pour le MVP. Les contraintes `hotels_booking_mode_ck`, `hotels_priority_ck`, `hotels_stars_ck`, l'index unique `hotels_slug_unique`, le trigger `hotels_set_updated_at`, les RLS `hotels_select_published` et les FKs `hotel_rooms.hotel_id → hotels.id` ne survivraient pas à un `drizzle push` malheureux. La règle « jamais skipper les hooks » de l'écosystème Cursor s'applique ici symétriquement : ne pas laisser Payload skipper nos garanties Postgres.
- **C** rejetée : viderait Payload de sa proposition de valeur (Lexical, drafts, RBAC). On retombe sur le rejet de l'option custom de l'ADR 0003.

## Conséquences

### Positives

- **Sécurité opérationnelle** : un bug dans Payload, un breaking change, ou une mauvaise migration ne touche jamais les données vivantes.
- **Évolutivité de Payload** : on peut désormais monter de version Payload sans audit complet du schéma `public`.
- **Surface de test claire** : le sync `cms → public` est testable unitairement (un seul hook).
- **Rollback** : `DROP SCHEMA cms CASCADE` est sûr ; aucune donnée applicative perdue.

### Négatives

- **Double écriture** : chaque save Payload coûte 2 commits (un dans `cms.hotels`, un dans `public.hotels`) — acceptable au volume éditorial palace (~50-200 fiches max).
- **Sync à écrire** : Phase 8.1 doit livrer le hook complet + ses tests d'intégration.
- **Pas d'édition tant que la 8.1 n'est pas livrée** : les édits dans le back-office restent invisibles sur le site public. **Critique : l'UI doit afficher un bandeau « scaffolding Phase 8 »** (déjà fait via `admin.description` de la collection).

## Plan de Phase 8.1

1. Implémenter le hook `afterChange` complet avec un service `packages/integrations/cms-sync/` qui :
   - Mappe les champs (renommages, conversions de types `cms` ↔ `public`).
   - Effectue le UPSERT via la connexion `SUPABASE_DB_URL` (jamais via PostgREST, RLS à bypass).
   - Idempotent et résistant aux échecs partiels.
2. Endpoint `POST /api/revalidate-hotel` côté `apps/web` (HMAC-signé via `REVALIDATE_SECRET`) — appelé par le hook après UPSERT réussi.
3. Tests d'intégration (MSW pour le HMAC, Postgres test container pour le UPSERT).
4. Bannière « live » côté admin une fois le sync vert.
5. Backfill : script one-shot qui hydrate `cms.hotels` depuis `public.hotels` pour que l'éditorial démarre avec des fiches pré-remplies.

## Risques résiduels

- **Drift de schéma `cms` vs `public`** : si la migration SQL ajoute une colonne à `public.hotels` mais pas le mirror Payload, l'éditorial ne pourra pas remplir cette colonne. **Mitigation** : checklist obligatoire dans `docs/audits/` à chaque migration touchant les hôtels.
- **Dual-write inconsistency** : si le UPSERT vers `public.hotels` échoue après que `cms.hotels` ait été commité, désynchro. **Mitigation** : retry idempotent + alerting Sentry (skill: `observability-monitoring`).
