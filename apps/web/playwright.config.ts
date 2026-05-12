import { defineConfig, devices } from '@playwright/test';

import { E2E_FAKE_HOTEL_ID, E2E_FAKE_PAID_HOTEL_ID } from './e2e/fixtures/env';

const PORT = Number(process.env['PLAYWRIGHT_PORT'] ?? 3100);
const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? `http://127.0.0.1:${PORT}`;
const CI = !!process.env['CI'];

/**
 * Placeholder `NEXT_PUBLIC_*` env baked into the client bundle at
 * **build time**. Required because `@t3-oss/env-nextjs` validates
 * lazily on first property access in the browser — without these,
 * the first React hydration in the test browser throws "Invalid
 * environment variables", the global error boundary catches it,
 * and every page reports as `GlobalError` to axe (visible as a
 * `document-title` violation on every URL).
 *
 * Values are intentionally syntactically valid but semantically
 * meaningless — the public surface code paths exercised by E2E
 * specs use graceful fallbacks (`env.NEXT_PUBLIC_SITE_URL ??
 * FALLBACK_SITE_URL`) or feature-flag against the absent server
 * credentials they would normally pair with.
 */
const TEST_PUBLIC_ENV = {
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  NEXT_PUBLIC_SITE_NAME: 'ConciergeTravel',
  NEXT_PUBLIC_DEFAULT_LOCALE: 'fr',
  // Real Supabase URLs/keys aren't needed: the test build skips Auth and
  // `getOptionalUser()` returns null when the request lacks a Supabase cookie.
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-jwt',
  NEXT_PUBLIC_ALGOLIA_APP_ID: 'test-app-id',
  NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: 'test-search-key',
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'test-cloud',
};

/**
 * Playwright E2E config (skill: test-strategy §E2E).
 *
 * - Boots `next start` on a dedicated port (3100 by default) so it does
 *   not collide with `pnpm dev`.
 * - Runs every spec against desktop Chromium **and** a mobile Chromium
 *   project (skill requires journeys to be covered on both viewports).
 * - Relies on `SKIP_ENV_VALIDATION=true` so the build/start succeed
 *   without real Supabase/Algolia/Amadeus credentials — the graceful
 *   fallbacks added in the server helpers keep public pages renderable.
 * - Retries once in CI to absorb startup jitter; zero locally.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  ...(CI ? { workers: 2 } : {}),
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    // FR is the default locale (routing.ts) and we mostly assert the
    // FR root surface — set the browser locale so next-intl's
    // Accept-Language negotiation lands `/` on FR. EN-specific specs
    // navigate to `/en` explicitly.
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    // `next build` runs first so the **client** bundle gets the
    // placeholder `NEXT_PUBLIC_*` baked in (see `TEST_PUBLIC_ENV`
    // above). Locally `reuseExistingServer: true` lets developers
    // skip the rebuild by pre-starting a server — the configured
    // command only runs when the port is free.
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    cwd: '.',
    port: PORT,
    reuseExistingServer: !CI,
    // Build + start in CI: factor in ~80s of `next build` cost on
    // top of the previous 120s start budget.
    timeout: 240_000,
    env: {
      // Smoke build / preview: the public pages must render without
      // real upstream credentials thanks to the graceful fallbacks.
      SKIP_ENV_VALIDATION: 'true',
      NODE_ENV: 'production',
      ...TEST_PUBLIC_ENV,
      // E2E seam — surface a synthetic hotel for the email-mode tunnel
      // specs. Never set in real deployments; see `dev-fake-hotel.ts`.
      CCT_E2E_FAKE_HOTEL_ID: E2E_FAKE_HOTEL_ID,
      // Paid-tunnel counterpart — synthetic `booking_mode = 'amadeus'`
      // hotel for the `booking-paid.spec` (offer-lock → invite → recap
      // → payment). Pairs with the in-memory Redis stub activated when
      // either seam env var is present.
      CCT_E2E_FAKE_PAID_HOTEL_ID: E2E_FAKE_PAID_HOTEL_ID,
    },
  },
});
