/**
 * Constants shared between the Playwright config (`playwright.config.ts`)
 * and individual specs. Keeping the values in a leaf fixture file avoids
 * pulling the whole `defineConfig` graph into spec collection.
 */

/**
 * Stable UUID v4 used by the dev-fake-hotel seam
 * (`apps/web/src/server/booking/dev-fake-hotel.ts`). Surface a
 * synthetic email-mode hotel for `/reservation/start` so the E2E suite
 * can exercise the form without seeded Supabase data.
 */
export const E2E_FAKE_HOTEL_ID = '11111111-2222-4333-8444-555555555555';

/**
 * Stable UUID v4 used by the dev-fake-hotel paid seam
 * (`getFakePaidHotelHead`). Triggers a synthetic `booking_mode = 'amadeus'`
 * hotel snapshot from `lock-offer.ts`, used by the `booking-paid.spec`
 * to exercise the offer-lock → invite → recap → payment state machine
 * without a live GDS or Supabase.
 */
export const E2E_FAKE_PAID_HOTEL_ID = '22222222-3333-4444-8555-666666666666';
