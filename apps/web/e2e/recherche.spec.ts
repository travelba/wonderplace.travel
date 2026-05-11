import { expect, test } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * `/recherche` — public search surface (skill: search-engineering,
 * test-strategy §E2E #2).
 *
 * In CI the test server boots without Algolia credentials, so
 * `searchHotelsCatalogOnServer` returns `[]`. That's intentional: this
 * spec exercises the **structure** of the page (form, accessibility,
 * SEO metadata, JSON-LD-free state) so it stays green regardless of
 * upstream data. Specs that need real hits live alongside the booking
 * funnel and use the dev-fake seam.
 */
test.describe('search page (/recherche)', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('FR renders the search form, stay inputs and empty prompt', async ({ page }) => {
    const res = await page.goto('/recherche');
    expect(res?.status()).toBe(200);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Rechercher un hôtel' }),
    ).toBeVisible();

    // The form is a `role="search"` landmark with a single text input
    // and a submit button — same affordances used by the header search.
    const form = page.getByRole('search');
    await expect(form).toBeVisible();
    await expect(form.getByLabel('Votre recherche')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Rechercher' })).toBeVisible();

    // The four stay inputs land on the page even when no query is set
    // (they let the user pre-fill dates before searching).
    for (const label of ['Arrivée', 'Départ', 'Adultes', 'Enfants']) {
      await expect(form.getByLabel(label)).toBeVisible();
    }

    // Empty state messaging.
    await expect(page.getByText(/Commencez par saisir une recherche/i)).toBeVisible();
  });

  test('typing in the input updates the query string on submit', async ({ page }) => {
    await page.goto('/recherche');

    const input = page.getByLabel('Votre recherche');
    await input.fill('ritz');
    await page.getByRole('button', { name: 'Rechercher' }).click();

    await expect(page).toHaveURL(/[?&]q=ritz/);
    // After the submit the search input retains the value (uncontrolled
    // form posts back the URL → `defaultValue` is the query string).
    await expect(page.getByLabel('Votre recherche')).toHaveValue('ritz');
  });

  test('EN serves the localized surface under /en/recherche', async ({ page }) => {
    const res = await page.goto('/en/recherche');
    expect(res?.status()).toBe(200);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    await expect(page.getByRole('heading', { level: 1, name: 'Search for a hotel' })).toBeVisible();
    await expect(page.getByRole('search').getByRole('button', { name: 'Search' })).toBeVisible();
  });

  test('canonical + hreflang alternates point to /recherche', async ({ page }) => {
    await page.goto('/recherche');
    const meta = await page.evaluate(() => {
      const getHref = (sel: string): string | null =>
        document.querySelector(sel)?.getAttribute('href') ?? null;
      return {
        canonical: getHref('link[rel="canonical"]'),
        hreflangFr: getHref('link[rel="alternate"][hreflang="fr-FR"]'),
        hreflangEn: getHref('link[rel="alternate"][hreflang="en"]'),
        hreflangDefault: getHref('link[rel="alternate"][hreflang="x-default"]'),
      };
    });
    expect(meta.canonical).toMatch(/\/recherche$/);
    expect(meta.hreflangFr).toMatch(/\/recherche$/);
    expect(meta.hreflangEn).toMatch(/\/en\/recherche$/);
    expect(meta.hreflangDefault).toMatch(/\/recherche$/);
  });
});
