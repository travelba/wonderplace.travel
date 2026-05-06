# Programme de fidélité — ConciergeTravel.fr

> Document rempli en Phase 7. Couvre :
>
> - Tier **FREE** ("Essentiel") — auto à la 1ère réservation Little, durée 1 an, avantages (petit-déjeuner 2 pers, late check-out 14h, crédit hôtel par hôtel).
> - Tier **PREMIUM** ("Prestige") — souscription annuelle (modèle économique en Phase 2, cf. ADR 0005), avantages tous hôtels (petit-déjeuner, upgrade selon dispo, late check-out, transfert aéroport préférentiel).
> - Règles d'éligibilité (`hotels.is_little_catalog`).
> - Display rules tunnel + fiche : badge "Avantages Essentiel inclus" vs upsell "Passez au tier Prestige".
> - Persistence sur `bookings.loyalty_tier` + `loyalty_benefits` (snapshot).
> - Back-office : ajustement manuel du tier avec audit log.
> - E-mails : `loyalty-welcome`, `loyalty-renewal-reminder`.

Skills : `loyalty-program`, `email-workflow-automation`.
