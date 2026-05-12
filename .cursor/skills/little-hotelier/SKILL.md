---
name: little-hotelier
description: Little Hotelier API integration for ConciergeTravel.fr — properties, availability, rates, reservations. Used for hotels in the Little catalog (eligible to loyalty tier FREE benefits). Invoke for any code touching Little Hotelier endpoints or its data mapping.
---

# Little Hotelier API — ConciergeTravel.fr

Little Hotelier is the **secondary booking channel** for hotels in the Little catalog. These hotels are eligible to the **tier FREE loyalty benefits** (breakfast, late check-out, hotel credit per CDC §8.1).

## Triggers

Invoke when:

- Touching `packages/integrations/little-hotelier/`.
- Mapping a hotel between Amadeus and Little Hotelier (back-office onboarding).
- Implementing booking creation through Little channel.
- Computing loyalty benefits (which depend on `is_little_catalog`).

## Endpoints (CDC v3.0 §5.2)

| Endpoint                            | Purpose                        |
| ----------------------------------- | ------------------------------ |
| `GET /properties`                   | List Little catalog properties |
| `GET /properties/{id}/availability` | Real-time availability         |
| `GET /properties/{id}/rates`        | Rates                          |
| `POST /reservations`                | Create reservation             |
| `GET /reservations/{id}`            | Status                         |
| `PUT /reservations/{id}`            | Modify                         |

## Non-negotiable rules

### Eligibility flag

- `hotels.is_little_catalog = true` is the source of truth for loyalty eligibility.
- This flag is set **only** when `little_hotel_id` is populated and validated against the Little API.

### Availability

- Cache `little:availability:<propId>:<checkin>:<checkout>:<adults>` for 15 min, mirroring the Amadeus short cache.
- Reservation creation always re-validates availability on the wire.

### Booking creation

- Use idempotency key.
- Persist `bookings.little_booking_id` and `booking_channel = 'little'`.
- Cancellation policy: read from Little Hotelier rate plan and persist verbatim into `bookings.cancellation_policy` (same JSONB shape as Amadeus, normalized).

### Reservation modifications

- Limited to date or guest-name changes when policy permits. Surface a typed `Result` in domain layer.
- Cancellations call DELETE-equivalent (`PUT` with `status: 'cancelled'`) and update `bookings.status`.

### Loyalty linkage

- On confirmed booking with `booking_channel = 'little'`, server action calls `loyalty/grant-free-tier` if user has no tier yet, persists `bookings.loyalty_tier = 'free'` and `loyalty_benefits` (breakfast, late check-out, hotel credit) per the Little catalog metadata.

### Error mapping

- `auth_failed`, `not_found`, `unavailable`, `rate_limited`, `validation`, `parse_failure`.
- Network/5xx: retry via `httpRequest` wrapper.

## Mapping flow (back-office onboarding)

1. Hotel created in Payload with `amadeus_hotel_id` filled.
2. Operator runs "Match Little" action: queries Little properties by name + city.
3. Confirms match → sets `little_hotel_id`, `is_little_catalog = true`, persists Little catalog benefits in `hotels.loyalty_benefits_meta` (JSONB).
4. Triggers Algolia reindex.

## Anti-patterns to refuse

- Treating `is_little_catalog` as derived without a verified `little_hotel_id`.
- Storing different cancellation policy shapes per channel without a common parser.
- Booking via Little for a hotel that has both `amadeus_hotel_id` and `little_hotel_id` without checking `booking_mode`. Single source of truth: `hotels.booking_mode`.

## References

- CDC v3.0 §5.2, §8 (loyalty), §11 (security).
- `amadeus-gds`, `loyalty-program`, `api-integration` skills.
