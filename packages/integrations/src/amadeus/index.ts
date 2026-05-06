/**
 * Amadeus GDS Self-Service — public surface.
 * Concrete implementation in Phase 3 (skill: amadeus-gds, api-integration).
 *
 * Endpoints to implement:
 *   - GET  /v1/reference-data/locations/hotels/by-city
 *   - GET  /v3/shopping/hotel-offers           (Redis cache 15 min)
 *   - GET  /v3/shopping/hotel-offers/{offerId} (NO cache, pre-payment)
 *   - POST /v1/booking/hotel-orders            (idempotent)
 *   - GET  /v2/booking/hotel-orders/{orderId}  (5 min cache)
 *   - DELETE /v2/booking/hotel-orders/{orderId}
 */
export const AMADEUS_INTEGRATION_VERSION = '0.0.1' as const;
