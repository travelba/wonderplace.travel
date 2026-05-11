import { expect, test } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * `/destination` — destination directory + city hub (skill: seo-technical,
 * test-strategy §E2E #4).
 *
 * In CI the test server boots without Supabase credentials, so
 * `listPublishedCities` returns `[]`. The directory page renders its
 * chrome + empty state. We do not navigate into a city hub here: that
 * path is exercised in `hotel-detail.spec.ts` via the dev-fake breadcrumb.
 */
test.describe('destination directory (/destination)', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('FR renders the H1 + subtitle + empty state', async ({ page }) => {
    const res = await page.goto('/destination');
    expect(res?.status()).toBe(200);

    await expect(
      page.getByRole('heading', { level: 1, name: /Toutes nos destinations/i }),
    ).toBeVisible();

    // With 0 cities the directory falls back to the localized empty
    // message ("Aucun hôtel publié pour cette destination…"). Match a
    // forgiving regex because the copy ends in a non-breaking space.
    await expect(page.getByText(/Aucun h.tel publi/i)).toBeVisible();
  });

  test('emits ItemList JSON-LD (even when empty)', async ({ page }) => {
    await page.goto('/destination');

    const itemList = await page.evaluate(() => {
      const scripts = Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
      );
      for (const s of scripts) {
        try {
          const parsed = JSON.parse(s.textContent ?? 'null');
          if (parsed && parsed['@type'] === 'ItemList') return parsed;
        } catch {
          /* ignore */
        }
      }
      return null;
    });

    expect(itemList, 'ItemList JSON-LD should be present').not.toBeNull();
    expect(itemList['@context']).toBe('https://schema.org');
    // `itemListElement` may legitimately be empty; the field itself must exist.
    expect(Array.isArray(itemList.itemListElement)).toBe(true);
  });

  test('canonical + hreflang point to /destination', async ({ page }) => {
    await page.goto('/destination');
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
    expect(meta.canonical).toMatch(/\/destination$/);
    expect(meta.hreflangFr).toMatch(/\/destination$/);
    expect(meta.hreflangEn).toMatch(/\/en\/destination$/);
    expect(meta.hreflangDefault).toMatch(/\/destination$/);
  });

  test('EN renders the localized destination directory', async ({ page }) => {
    const res = await page.goto('/en/destination');
    expect(res?.status()).toBe(200);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
  });

  test('unknown city slug returns a 404', async ({ page }) => {
    // The slug is well-formed but no city matches → notFound().
    const res = await page.goto('/destination/ville-inexistante');
    expect(res?.status()).toBe(404);
  });
});
