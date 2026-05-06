# ADR 0004 — Recherche Algolia

- Status: accepted
- Date: 2026-05-06
- Refs: cahier des charges v3.0 §2 (Algolia ou Meilisearch)

## Décision

La recherche interne (autocomplete + catalogue) est propulsée par **Algolia**.

## Contexte

Le cahier des charges laisse le choix entre Algolia et Meilisearch. Trois critères ont guidé la décision :

1. **Time-to-market MVP** — Algolia propose des SDKs Next.js mûrs (`react-instantsearch`, `@algolia/client-search`), une infrastructure managée, des analytics et A/B intégrés.
2. **Performance edge** — Latence ~50ms perçue sur l'autocomplete, conforme à l'objectif INP < 200ms (CDC §9.2).
3. **Coût opérationnel** — pas d'infra à exploiter (snapshots, scaling, sécurité). Coût Algolia maîtrisé pour un volume MVP (50k requêtes/mois ≈ 50–100€).

Meilisearch reste une option valide si le coût Algolia devient prohibitif au-delà de 1M req/mois, mais il faudrait alors prévoir l'opération (Meilisearch Cloud ou self-hosted Vercel/Render).

## Alternatives considérées

1. **Meilisearch Cloud** — moins cher à grande échelle mais écosystème Next.js moins riche.
2. **Meilisearch self-hosted** — moins cher mais charge ops importante (snapshots, monitoring, scaling).

## Conséquences

- Index `hotels_fr`, `hotels_en`, `cities_fr`, `cities_en` synchronisés depuis Payload via `afterChange` hooks.
- Clés API : `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` exposable, `ALGOLIA_ADMIN_API_KEY` server-only pour indexation.
- Synonymes FR/EN configurés (Côte d'Azur ↔ Riviera, Provence ↔ Sud, etc.).
- Ranking custom : `priority_score desc` (P0=100, P1=70, P2=40), `google_rating desc`, `google_reviews_count desc`.
- Au-delà de 500k requêtes/mois, lancer une revue coût et envisager bascule Meilisearch via un nouvel ADR.
