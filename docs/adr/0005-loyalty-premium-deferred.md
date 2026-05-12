# ADR 0005 — Tier PREMIUM (billing) reporté en Phase 2

- Status: accepted
- Date: 2026-05-06
- Refs: cahier des charges v3.0 §8 (programme fidélité), §13 (phasage)

## Décision

Le **tier PREMIUM** du programme de fidélité est **modélisé** dans la base de données, l'UI et la logique domain dès la Phase 1, mais **la souscription payante n'est pas vendue** au lancement MVP. Le bouton "S'abonner" affiche "Bientôt disponible" et le modèle économique est activé en Phase 2.

## Contexte

Le cahier des charges (CDC §8.1) prévoit :

- **Tier FREE** activé automatiquement à la 1ère réservation Little catalog → livré en Phase 1.
- **Tier PREMIUM** payant annuel → prix à définir, partenaires hôteliers à signer.

Le MVP §13 prévoit explicitement : "Tier FREE" pour Phase 1, "Tier PREMIUM" pour Phase 2. Le système de paiement récurrent (Stripe Link, Stripe Subscriptions, ou Amadeus Phase 2) n'est pas encore décidé.

## Alternatives considérées

1. **Implémenter Stripe Subscriptions dès le MVP** — rejeté : ouvre une dépendance hors-stack (Stripe non listé en CDC §2 pour le récurrent), risque produit (positionnement tarif).
2. **Ne pas afficher le tier PREMIUM** — rejeté : le cahier des charges (§8.2) demande l'affichage upsell dans le tunnel et la fiche.

## Conséquences

- `loyalty_members.tier` peut prendre `'free' | 'premium'` mais aucun parcours d'achat MVP.
- L'UI montre la carte upsell avec "Bientôt disponible" et un formulaire de notification d'intérêt (intégration Brevo).
- L'architecture (entités, services, badges) est prête à brancher un paiement récurrent en Phase 2.
- Documenté dans `docs/06-loyalty.md` comme simplification volontaire.
