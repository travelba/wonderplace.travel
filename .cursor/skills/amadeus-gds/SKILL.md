---
name: amadeus-gds
description: Amadeus GDS Self-Service Hotels integration (search, offers, booking, status, cancellation) for ConciergeTravel.fr. Use for any code touching Amadeus endpoints, OAuth, offer locks, booking creation, or PNR handling.
---

# Amadeus GDS — ConciergeTravel.fr

Amadeus is the **primary booking channel** for in-network hotels (CDC §5.1). The cahier des charges enumerates the exact endpoints to consume.

## Triggers

Invoke when:

- Touching `packages/integrations/amadeus/`.
- Calling Amadeus-related logic from booking domain.
- Mapping `cancellation_policy` from Amadeus response.

## Endpoints used (CDC v3.0 §5.1)

| Endpoint                                          | Purpose                            | Cache        |
| ------------------------------------------------- | ---------------------------------- | ------------ |
| `GET /v1/reference-data/locations/hotels/by-city` | Hotel search by city               | 24 h         |
| `GET /v3/shopping/hotel-offers`                   | Real-time availability + price     | 15 min Redis |
| `GET /v3/shopping/hotel-offers/{offerId}`         | Pre-payment offer detail           | **No cache** |
| `POST /v1/booking/hotel-orders`                   | Create booking                     | No cache     |
| `GET /v2/booking/hotel-orders/{orderId}`          | Order status                       | 5 min        |
| `DELETE /v2/booking/hotel-orders/{orderId}`       | Cancel                             | No cache     |
| `GET /v2/e-reputation/hotel-sentiments`           | Sentiment scores (0–100) per hotel | 24 h         |

OAuth2 Client Credentials. Two environments: `api.test.amadeus.com` (test) and `api.amadeus.com` (production), driven by `AMADEUS_ENV`.

## Non-negotiable rules

### OAuth token caching

- Cache token in Redis at `amadeus:auth:token` with TTL = `expires_in - 60s`.
- One global mutex (`amadeus:auth:lock`) avoids concurrent token refreshes.
- On 401, force-refresh token once and retry the request.

### Search and offers

- `searchHotelsByCity({ cityCode, radius, ratings: ['5'] })` — use IATA city code.
- `getHotelOffers({ hotelIds, checkInDate, checkOutDate, adults, children, currency: 'EUR' })`.
- Cache key `amadeus:offers:hotel-by-city:<city>:<checkin>:<checkout>:<adults>:<children>` for 15 min.
- Persist `commission_rate` if present in offer response (commission BSP IATA).

### Offer detail (pre-payment)

- `getOfferById(offerId)` — **never cached**. The price returned here is the price at payment.
- If response is `OFFER_EXPIRED`, return `Result.err({ kind: 'offer_expired' })` and surface to UI to re-fetch.

### Booking creation

- Always uses an `Idempotency-Key` (UUID v7 generated server-side, stored 24h in Redis).
- Persist `bookings.amadeus_pnr` and `bookings.cancellation_policy` (verbatim JSONB from Amadeus).
- Compute `cancellation_deadline` from `policies.cancellations[0].deadline`.

### Cancellation policy (CDC §5.1, §6.2)

- Always display the **native** Amadeus policy. Never overlay an internal policy.
- Render in tunnel before payment + on hotel page when offer is locked.
- Parser `parseCancellationPolicy(rawPolicies, locale)` lives in `packages/domain/booking/cancellation.ts` and produces a UI-friendly summary while keeping raw JSON for legal clarity.

### Errors

- Map Amadeus error codes to typed kinds (`offer_expired`, `hotel_unavailable`, `pricing_changed`, `payment_required`, `validation`, `auth_failed`).
- 4xx: log with PII redacted. 5xx: retry once via the `httpRequest` wrapper.

### Webhooks

- If Amadeus webhook is configured, route handler `/api/webhook/amadeus` validates signature (HMAC) and updates `bookings.status` / `payment_status`.

### Sentiment ratings

- `getHotelSentiments({ hotelIds })` calls `/v2/e-reputation/hotel-sentiments`. Each score (`overallRating`, per-category `service`, `location`, …) is a 0–100 integer.
- Cached 24h at `amadeus:sentiments:<sorted-hotel-ids>`. `hotelIds` are normalised (sorted) so call ordering doesn't fragment the cache.
- Use the `amadeusSentimentToAggregateRating(entry)` mapper to feed `packages/seo/`'s `aggregateRatingJsonLd` — it converts 0–100 → 0–5 (Google rich-results scale), prefers `numberOfReviews` over `numberOfRatings`, and **returns `null` when there are zero reviews** (synthetic ratings violate Google's structured-data policy).
- Only render the rating block when the mapper produces a non-null result. Never invent counts.

## Test environment specifics

- Test environment has limited inventory; `apps/web` uses `AMADEUS_ENV=test` in dev/preview.
- CI nightly runs a smoke test booking against test env.

## Anti-patterns to refuse

- Caching offer detail response.
- Storing card-related fields from Amadeus response (none should be exposed; if any leak, drop and report).
- Custom cancellation policy text overriding the vendor's.
- Calling Amadeus directly from a Server Component.
- Assuming `offerId` is stable beyond the lock TTL (~few minutes).

## References

- CDC v3.0 §5.1 (Amadeus GDS), §7 (booking flow).
- Amadeus Self-Service docs (Hotels Search v3, Hotel Booking, Authentication).
- `api-integration`, `redis-caching`, `booking-engine`, `payment-orchestration` skills.
