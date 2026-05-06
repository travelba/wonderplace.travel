# ADR 0003 — Back-office Payload CMS 3

- Status: accepted
- Date: 2026-05-06
- Refs: cahier des charges v3.0 §11.2 (option recommandée)

## Décision

Le back-office est implémenté avec **Payload CMS 3** (`@payloadcms/db-postgres`) déployé en application Next.js séparée (`apps/admin`) et pointant la même base Supabase que `apps/web`.

## Contexte

Le cahier des charges propose explicitement deux options : Payload CMS ou Supabase Studio + admin custom. Payload est l'option recommandée par le CDC (§11.2) car elle apporte nativement :

- WYSIWYG (Lexical) avec contrôle des éléments autorisés.
- Versioning et drafts.
- RBAC fin.
- Intégration TypeScript native + génération de types.
- Adapter Postgres compatible Supabase.
- Hooks `afterChange` pour déclencher la revalidation ISR + reindex Algolia.

L'option custom aurait exigé un effort de développement initial très important (CRUD, drafts, médias, revue de contenu, RBAC) sans valeur différenciante.

## Alternatives considérées

1. **Supabase Studio + admin Next.js custom** — rejetée : trop coûteux, pas de gain produit.
2. **Sanity / Strapi** — rejetées : SaaS externe (Sanity) ou maturité Postgres limitée (Strapi).

## Conséquences

- Schéma Postgres reste source de vérité ; Payload reflète les colonnes existantes via collections.
- Authentification Payload distincte de Supabase Auth en MVP. Phase 2 : possibilité de fédération.
- `apps/admin` est déployé séparément sur Vercel, sur un sous-domaine `admin.conciergetravel.fr`.
- `revalidateTag` côté `apps/web` appelé via endpoint signé HMAC depuis les hooks Payload.
