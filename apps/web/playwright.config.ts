import { defineConfig, devices } from '@playwright/test';

import { E2E_FAKE_HOTEL_ID, E2E_FAKE_PAID_HOTEL_ID } from './e2e/fixtures/env';

const PORT = Number(process.env['PLAYWRIGHT_PORT'] ?? 3100);
const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? `http://127.0.0.1:${PORT}`;
const CI = !!process.env['CI'];

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
    command: `pnpm exec next start --port ${PORT}`,
    cwd: '.',
    port: PORT,
    reuseExistingServer: !CI,
    timeout: 120_000,
    env: {
      // Smoke build / preview: the public pages must render without
      // real upstream credentials thanks to the graceful fallbacks.
      SKIP_ENV_VALIDATION: 'true',
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      NODE_ENV: 'production',
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
