# Checklist QA pré-lancement — ConciergeTravel.fr

Mirror du CDC v3.0 §12.2.

## Fonctionnel

- [ ] Recherche → résultats → fiche → tunnel → confirmation (mobile + desktop)
- [ ] Mode email (booking_mode = 'email') : demande envoyée, accusé reçu, ticket back-office créé
- [ ] Connexion / inscription / reset mot de passe en FR + EN
- [ ] Espace client : réservations, profil, fidélité affichent les bonnes données
- [ ] Programme fidélité : tier FREE auto à la 1ère réservation Little, badge "Avantages Essentiel inclus"
- [ ] Comparateur prix affiche scénarios cheaper / equal_with_benefits / more_expensive
- [ ] Politique d'annulation Amadeus rendue verbatim avant paiement et dans email
- [ ] Confirmation reçue dans les 30s post-capture

## Technique

- [ ] CI verte sur `main` (lint, typecheck, unit, e2e, lighthouse)
- [ ] Aucun `any`, `as`, `!`, `console.log` introduit
- [ ] Aucun secret commité (`gh secret list` à jour)
- [ ] Migrations appliquées staging puis production
- [ ] Source maps Sentry uploadées
- [ ] Health `/api/health` répond OK
- [ ] Webhooks Amadeus Payment validés (HMAC + replay protection)

## Sécurité

- [ ] CSP / HSTS / Referrer-Policy / Permissions-Policy headers actifs
- [ ] RLS Supabase : test anon ne lit que published, customer ne lit que ses bookings
- [ ] Rate limit sur `/api/price-comparison`, `/api/auth/*`, `/api/recherche`
- [ ] `dangerouslySetInnerHTML` réservé aux scripts JSON-LD trustés
- [ ] Audit log accessible aux admins

## Légal

- [ ] CGV publiées
- [ ] Politique RGPD + cookies + droit à l'oubli
- [ ] Mentions légales (IATA, ASPST, APST, contact)
- [ ] Comparateur : mention "Prix observés à titre indicatif, susceptibles de varier"
