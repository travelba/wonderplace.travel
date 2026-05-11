import { expect, test, type Route } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * Price comparator widget — UX / legal contract.
 *
 * Skill: competitive-pricing-comparison (no affiliate links, no
 * logos, plain-text providers, mandatory legal mention, prices TTC
 * EUR). The widget is a client island that calls
 * `/api/price-comparison?…` after hydration. The E2E mocks that
 * single endpoint so we exercise the rendered states without
 * Makcorps/Apify/Supabase.
 *
 * The comparator only renders when stay dates are selected — the
 * hotel page provides defaults (D+30 → D+33) so a bare URL is
 * enough.
 */

const HOTEL_PATH = '/hotel/hotel-de-test-e2e';

interface MockResponseAvailable {
  readonly ok: true;
  readonly available: true;
  readonly cached: boolean;
  readonly competitors: ReadonlyArray<{ readonly provider: string; readonly amountMinor: number }>;
  readonly benefitsValueMinor: number;
  readonly stay: { readonly checkIn: string; readonly checkOut: string; readonly adults: number };
}

interface MockResponseUnavailable {
  readonly ok: true;
  readonly available: false;
  readonly reason: string;
}

type MockResponse = MockResponseAvailable | MockResponseUnavailable;

async function fulfilWith(route: Route, body: MockResponse): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test.describe('price comparator widget', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('renders the available scenario with provider list, legal mention and no logos', async ({
    page,
  }) => {
    let calls = 0;
    await page.route('**/api/price-comparison**', async (route) => {
      calls += 1;
      await fulfilWith(route, {
        ok: true,
        available: true,
        cached: false,
        competitors: [
          { provider: 'booking_com', amountMinor: 45000 },
          { provider: 'expedia', amountMinor: 47000 },
          { provider: 'hotels_com', amountMinor: 49000 },
        ],
        benefitsValueMinor: 0,
        stay: { checkIn: '2026-08-01', checkOut: '2026-08-03', adults: 2 },
      });
    });

    await page.goto(`${HOTEL_PATH}?checkIn=2026-08-01&checkOut=2026-08-03&adults=2`);

    const section = page.getByRole('region', { name: 'Comparaison des prix' });
    await expect(section).toBeVisible();

    // Wait until the client island has hydrated and consumed the mock.
    await expect.poll(() => calls, { timeout: 10_000 }).toBeGreaterThan(0);

    // Scenario headline carries `data-scenario` — without a concierge
    // price, scenario falls through to `unavailable`. Either way the
    // widget MUST render an informational headline.
    const headline = section.locator('[data-scenario]');
    await expect(headline).toBeVisible();

    // The three competitor rows show, each labelled by `<th
    // scope="row">` with the localized provider name. No `<a>` tag,
    // no `<img>` tag is allowed inside the section.
    const table = section.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('rowheader', { name: 'Booking.com' })).toBeVisible();
    await expect(table.getByRole('rowheader', { name: 'Expedia' })).toBeVisible();
    await expect(table.getByRole('rowheader', { name: 'Hotels.com' })).toBeVisible();

    // Prices are formatted in EUR (no decimals). fr-FR uses the
    // narrow non-breaking space (U+202F) between number and symbol.
    // Match flexibly so the spec tolerates locale tweaks.
    await expect(table).toContainText(/450\s?€/);
    await expect(table).toContainText(/470\s?€/);
    await expect(table).toContainText(/490\s?€/);

    // Legal mention (mandatory per skill).
    await expect(section).toContainText(/à titre indicatif/i);
    await expect(section).toContainText(/TTC/i);

    // Hard UX contract: zero competitor LOGOS, zero AFFILIATE links.
    await expect(section.locator('img')).toHaveCount(0);
    await expect(section.locator('a')).toHaveCount(0);
  });

  test('renders the "unavailable" state when the API reports no competitor', async ({ page }) => {
    await page.route('**/api/price-comparison**', async (route) => {
      await fulfilWith(route, { ok: true, available: false, reason: 'no_data' });
    });

    await page.goto(`${HOTEL_PATH}?checkIn=2026-08-01&checkOut=2026-08-03&adults=2`);

    const section = page.getByRole('region', { name: 'Comparaison des prix' });
    await expect(section).toBeVisible();

    // No table when unavailable — only the informational paragraph.
    await expect(section).toContainText(/à titre informatif/i);
    await expect(section.getByRole('table')).toHaveCount(0);

    // Still no logos / external links — the legal-UX contract holds in
    // every state.
    await expect(section.locator('img')).toHaveCount(0);
    await expect(section.locator('a')).toHaveCount(0);
  });

  test('cached responses surface the cached notice', async ({ page }) => {
    await page.route('**/api/price-comparison**', async (route) => {
      await fulfilWith(route, {
        ok: true,
        available: true,
        cached: true,
        competitors: [{ provider: 'booking_com', amountMinor: 45000 }],
        benefitsValueMinor: 0,
        stay: { checkIn: '2026-08-01', checkOut: '2026-08-03', adults: 2 },
      });
    });

    await page.goto(`${HOTEL_PATH}?checkIn=2026-08-01&checkOut=2026-08-03&adults=2`);
    const section = page.getByRole('region', { name: 'Comparaison des prix' });
    await expect(section).toContainText(/en cache/i);
  });

  test('network failure degrades gracefully (still no logos, no links)', async ({ page }) => {
    await page.route('**/api/price-comparison**', async (route) => {
      await route.abort('failed');
    });

    await page.goto(`${HOTEL_PATH}?checkIn=2026-08-01&checkOut=2026-08-03&adults=2`);

    const section = page.getByRole('region', { name: 'Comparaison des prix' });
    await expect(section).toBeVisible();
    // Fallback state — single paragraph (no table, no clickable refs).
    await expect(section.getByRole('table')).toHaveCount(0);
    await expect(section.locator('img')).toHaveCount(0);
    await expect(section.locator('a')).toHaveCount(0);
  });
});
