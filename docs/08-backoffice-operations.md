# Opérations back-office — ConciergeTravel.fr

> Document rempli en Phase 8. Couvre :
>
> - Création / publication d'un hôtel (workflow : draft → photos ≥ 15 → connectivity → publish → reindex Algolia → revalidate ISR).
> - Workflow "Match Little" pour activer `is_little_catalog` et les avantages.
> - Création / publication d'une page éditoriale (slug, AEO ≥ 40 mots, FAQ ≥ 5 Q/A, last_updated, auteur, hôtels listés).
> - Gestion des demandes hors-réseau (`BookingRequestsEmail`) : nouveau → en cours → devis → réservé / refusé.
> - Gestion d'un membre fidélité (ajustement manuel + audit).
> - Reporting : top hôtels 30j, commissions par mois, funnel demandes e-mail.
> - Sync Google Reviews (manuel par hôtel + cron quotidien).
> - Gestion des redirects 301 (Payload → `next.config.ts`).

Skill : `backoffice-cms`, `content-modeling`.
