# Modèle de données — ConciergeTravel.fr

Référence vivante CDC v3.0 §4, addendum v3.2 §B (Makcorps), skill `supabase-postgres-rls`.  
**DDL versionné :** [`packages/db/migrations/0001_init_core_schema.sql`](../packages/db/migrations/0001_init_core_schema.sql).

## ERD fonctionnel

```mermaid
erDiagram
  HOTELS ||--o{ HOTEL_ROOMS : contains
  HOTELS ||--o{ BOOKINGS : hosts
  HOTELS ||--o{ BOOKING_REQUESTS_EMAIL : receives
  HOTELS ||--o{ PRICE_COMPARISONS : benchmarked
  AUTH_USERS ||--o| PROFILES : extends
  AUTH_USERS ||--o| LOYALTY_MEMBERS : enrols
  AUTH_USERS ||--o{ BOOKINGS : places
  AUTHORS ||--o{ EDITORIAL_PAGES : writes
```

## Tables métier (`public`)

| Table | Objet principal |
| --- | --- |
| `authors` | Auteurs contenus (E‑E‑A‑T, pages éditoriales). |
| `hotels` | Fiche catalogue (slug FR/EN, connectivités Amadeus/Little/Makcorps, FAQ JSONB…). |
| `hotel_rooms` | Inventaire présentoir / mapping chambre côté contenu (non forcément 1‑pour‑1 ARI). |
| `editorial_pages` | Articles / hubs / classements (statut draft/published, `hotel_ids` dénormalisés). |
| `profiles` | Extension `auth.users` (locale newsletter, préférences). |
| `loyalty_members` | Snapshot fidélité (tier FREE/PREMIUM modélisé — vente PREMIUM reportée ADR 0005). |
| `bookings` | Réservations réseau (`booking_ref` `CT‑YYYYMMDD‑xxxxx`), politique annulation verbatim JSONB. |
| `booking_requests_email` | Demandes hors‑réseau (`booking_mode = email`). |
| `price_comparisons` | Persistences comparateur (TTL `expires_at`, options concurrents). |
| `redirects` | 301/302 Payload → middleware Next (anti‑cannibalisation). |
| `audit_logs` | Traçabilité opérateur (INSERT via service_role / jobs). |

Système : table interne **`_cct_sql_migrations`** (journal d’applications SQL), créée par `pnpm --filter @cct/db migrate`.

## RBAC — `auth.jwt() ->> 'role'`

Rôles métier **`customer` \| `editor` \| `seo` \| `operator` \| `admin`** (cf. [`auth-role-management`](../.cursor/skills/auth-role-management/SKILL.md)).  
À propager depuis `auth.users.app_metadata.role` avec un **Custom Access Token Hook** Supabase (`role` lisible dans le JWT).  
Politiques RLS de `0001` supposent ce claim présent ou absent (traité comme client pour les contrôles d’écriture restreinte).

Résumé d’intent :

| Ressource | Public / client | Équipe |
| --- | --- | --- |
| Hôtels + chambres publiées | Lecture | CRUD contenu + onboarding |
| Pages éditoriales publiées | Lecture | Rédaction / SEO |
| Réservations | Propriétaire `user_id` | Opérateur / admin |
| Demandes e‑mail | Propriétaire `submitted_by` | Opérateur / admin |
| Profils | Soi‑même | — |
| Fidélité | Lecture individuelle ; pas d’écriture directe client | Opérateur / admin |

## Indexes & JSONB

- Unicité **`hotels.slug`**, **`editorial_pages.slug_fr`**, partiel **`makcorps_hotel_id`**.  
- GIN `jsonb_path_ops` sur **`hotels.faq_content`**, **`hotels.amenities`**, **`editorial_pages.faq_content`**, **`hotel_rooms.amenities`**.  
- Recherche / reporting : composites `(bookings.user_id, status)`, `(hotel_id, dates)` pour `price_comparisons`.

## Schémas JSONB (couche applicative — Zod)

Documentés avant persistance depuis `packages/domain` + intégrations :

- `bookings.cancellation_policy` : objet verbatim fournisseur (Amadeus / Little).
- `bookings.loyalty_benefits` : snapshot avantages réservés.
- `hotels.highlight / amenities / spa_info / restaurant_info` : blobs éditoriaux.
- `hotels.faq_content` & `editorial_pages.faq_content` : liste Q/R pour JSON‑LD FAQPage.

## Procédures

### Migrations locales / CI

```bash
# Depuis https://console.supabase.com → Settings → Database (URI direct port 5432 de préférence)
export SUPABASE_DB_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres'
pnpm --filter @cct/db migrate
```

Rollback : fichier SQL inverse numéroté suivant convention `NNNN_rollback_xyz.sql`, rarement automatique ; PITR Supabase pour incident majeur.

### Prochain jalons DDL

Triggers `profiles`/`loyalty_members` post‑signup, vues agrégées reporting, enums dédiées si ergonomie Drizzle avantageuse.
