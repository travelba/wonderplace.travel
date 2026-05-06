# Booking flow — ConciergeTravel.fr

> Document rempli en Phase 6. Couvre :
>
> - State machine (idle → offer_locked → guest_collected → payment_pending → confirmed | failed)
> - Persistence des drafts (cookie + DB), TTL 1h
> - Cancellation policy verbatim Amadeus / Little (jamais d'override maison)
> - Idempotency keys (création de booking)
> - Mode email pour hôtels hors-réseau (`booking_mode = 'email'`)
> - Emails confirmations + J-3 + post-stay + loyalty
> - Erreurs : OFFER_EXPIRED, PAYMENT_FAILED, BOOKING_CONFLICT
> - SSR no-cache, `force-dynamic`, runtime nodejs

Skills : `booking-engine`, `payment-orchestration`, `amadeus-gds`, `little-hotelier`.
