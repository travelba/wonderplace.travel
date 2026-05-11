import { expect, test, type Page } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * Locale switcher preserves the current path AND query string when
 * toggling between FR (root) and EN (/en/...).
 *
 * Skill: seo-technical §hreflang — the rendered `<a>` is the crawler's
 * primary alternate-locale signal alongside the `<link rel="alternate">`
 * tags emitted in metadata.
 *
 * Notes on URL shapes:
 *  - `localePrefix: 'as-needed'` (routing.ts) serves FR at `/` and EN
 *    at `/en/...`. When *leaving* an EN page, next-intl 3.x emits the
 *    explicit `/fr/...` href for the FR alternate. The middleware then
 *    redirects to the canonical prefix-less FR URL, so we assert the
 *    end-state URL (post-navigation) rather than the raw `href`.
 *  - The switcher is the single `<a hreflang>` inside the global header,
 *    which gives a locale-agnostic selector (its aria-label is
 *    translated).
 */
function localeSwitcher(page: Page) {
  return page.locator('header a[hreflang]').first();
}

test.describe('locale switcher', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('FR → EN on the home page', async ({ page }) => {
    await page.goto('/');
    const switcher = localeSwitcher(page);
    await expect(switcher).toHaveAttribute('href', '/en');
    await switcher.click();
    await expect(page).toHaveURL(/\/en\/?$/);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
  });

  test('EN → FR on the home page', async ({ page }) => {
    await page.goto('/en');
    const switcher = localeSwitcher(page);
    const href = await switcher.getAttribute('href');
    // Either the canonical `/` or the explicit `/fr` is acceptable.
    expect(['/', '/fr']).toContain(href);

    await switcher.click();
    // The destination is the FR home — either at `/` (middleware
    // strips the prefix) or at `/fr` (literal prerendered route).
    // Both are valid; assert via the `lang` attribute instead of URL.
    await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('fr');
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/(fr\/?)?$/);
  });

  test('preserves path: /destination ↔ /en/destination', async ({ page }) => {
    await page.goto('/destination');
    await expect(page).toHaveURL(/\/destination$/);

    await localeSwitcher(page).click();
    await expect(page).toHaveURL(/\/en\/destination$/);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');

    await localeSwitcher(page).click();
    // Accept either `/destination` or `/fr/destination` (see note above).
    await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('fr');
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/(?:fr\/)?destination$/);
  });

  test('preserves query string on /recherche', async ({ page }) => {
    await page.goto('/recherche?q=paris');
    const href = await localeSwitcher(page).getAttribute('href');
    expect(href).toBe('/en/recherche?q=paris');
  });
});
