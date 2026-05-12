---
name: payment-orchestration
description: Payment orchestration via Amadeus Payments for ConciergeTravel.fr (PCI scope-out, hosted iframe, 3DS2, Apple/Google Pay, idempotency). Use for any payment-related code, webhook, or UI touching the payment iframe.
---

# Payment orchestration — ConciergeTravel.fr

Payment is **fully delegated to Amadeus Payments** (CDC §5.3, §7.3, §11). ConciergeTravel.fr is **out of PCI DSS scope**: no card data ever transits or is stored on our servers.

## Triggers

Invoke when:

- Touching the payment step UI or its server actions.
- Configuring Apple Pay / Google Pay.
- Implementing webhook handling for payment status changes.
- Reviewing any code path that handles `bookings.payment_*` fields.

## Non-negotiable rules

### PCI scope

- **No card data anywhere**: PAN, CVV, expiry, holder name in payment context. We accept holder name only as part of the booking guest data, separate from card flow.
- The payment form is an **Amadeus-hosted iframe** (Web Payment Form), equivalent to Stripe Elements. We render only the wrapper.
- We persist **only** `amadeus_payment_ref` and `payment_status`. No tokens that could decrypt to a PAN.

### Flow

1. Guest data collected and validated server-side (Zod).
2. Server action `initiatePayment({ offerId, bookingDraftId })`:
   - Calls Amadeus to create a payment session for the offer.
   - Returns `{ paymentSessionUrl, sessionId }` to the client.
3. Client renders the Amadeus iframe with `paymentSessionUrl`.
4. Apple Pay / Google Pay buttons are provided by Amadeus' SDK; we surface them in the recap.
5. 3DS2 is handled inside the iframe.
6. On success, Amadeus posts back via webhook OR client-side redirect with a signed `payment_ref` query.
7. Server validates the `payment_ref` (HMAC) and finalizes the booking (creates `amadeus-orders` or `little-reservations`), persists in `bookings`, sends Brevo confirmation.

### Idempotency

- The booking finalization endpoint requires an idempotency key bound to `(offerId, userId, bookingDraftId)`. Stored 24h in Redis.
- Replays return the previous result.

### Webhooks

- `/api/webhook/amadeus-payment`: HMAC signature validated against `AMADEUS_PAYMENT_WEBHOOK_SECRET`.
- Updates `bookings.payment_status` (`authorized → captured → refunded`) atomically.
- Idempotent: handler keyed on `payment_ref`.

### Apple Pay

- Domain verification file served from `/.well-known/apple-developer-merchantid-domain-association` (added Phase 9).
- Tested on Safari iOS as part of E2E.

### Refunds and cancellations

- Initiated from back-office (operator role) or by user within deadline.
- Server action calls Amadeus refund endpoint, updates `bookings.status = 'cancelled'`, `payment_status = 'refunded'`, sends customer email.

### Email-mode bookings

- For hotels with `booking_mode = 'email'`, payment is handled offline (bank transfer or Stripe Link in Phase 2 — explicitly deferred). Tunnel UI shows "Demande de réservation" CTA, not a payment form.

## UI rules

- "Paiement sécurisé Amadeus" badge with lock icon visible in the payment step.
- Cancellation policy block immediately above the payment iframe.
- No skeuomorphic credit-card form on our side — only the iframe and Apple/Google Pay buttons.

## Anti-patterns to refuse

- Adding any field that captures PAN/CVV/expiry on our pages.
- Logging request/response bodies of the payment session creation in plain text (must redact).
- Caching `paymentSessionUrl` or `sessionId`.
- Trusting client-side success without webhook or signed redirect verification.

## References

- CDC v3.0 §5.3, §7.3, §11.
- Amadeus Web Payment Form integration guide.
- `amadeus-gds`, `booking-engine`, `security-engineering`, `redis-caching` skills.
