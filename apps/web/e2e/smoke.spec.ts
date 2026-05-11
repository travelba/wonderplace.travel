import { expect, test } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * Smoke: every public landing surface boots, renders the chrome
 * (skip-link / header / footer / consent), and the FR locale lives at
 * the root while EN lives under `/en` (routing.ts).
 *
 * The consent cookie is pre-set so the banner does not occlude the
 * footer/copy assertions. Banner-specific behaviour lives in
 * `consent.spec.ts`.
 */
test.describe('smoke / public landing', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('FR home renders header + footer + main landmark', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status(), 'home should return 200').toBe(200);

    await expect(page).toHaveTitle(/.+/);
    expect(await page.locator('html').getAttribute('lang')).toBe('fr');

    // Skip-link is the first focusable element on every page.
    await expect(page.getByRole('link', { name: 'Aller au contenu principal' })).toHaveAttribute(
      'href',
      '#main',
    );

    // Header brand + main landmark.
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Footer copyright + Manage cookies button.
    const footer = page.getByRole('contentinfo');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(new Date().getFullYear().toString());
    await expect(footer.getByRole('button', { name: 'Gérer les cookies' })).toBeVisible();
  });

  test('EN home is served under /en with correct lang', async ({ page }) => {
    const response = await page.goto('/en');
    expect(response?.status()).toBe(200);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('skip-link jumps to #main when activated', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('link', { name: 'Aller au contenu principal' });

    // Focus the skip link explicitly and press Enter to mimic a keyboard user.
    await skip.focus();
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');

    // The browser updates the URL hash; the #main element receives focus.
    await expect(page).toHaveURL(/#main$/);
    const mainFocused = await page.evaluate(
      () => document.activeElement?.id ?? document.activeElement?.tagName,
    );
    expect(mainFocused).toBe('main');
  });

  test('all four legal pages render with the expected H1', async ({ page }) => {
    const legalRoutes: ReadonlyArray<{ readonly path: string; readonly h1: RegExp }> = [
      { path: '/mentions-legales', h1: /Mentions légales/i },
      { path: '/confidentialite', h1: /Politique de confidentialité/i },
      { path: '/cgv', h1: /Conditions générales de vente/i },
      { path: '/cookies', h1: /Politique cookies/i },
    ];

    for (const { path, h1 } of legalRoutes) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} should return 200`).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();

      // Legal pages MUST stay indexable (no `noindex` meta). Querying
      // `head meta[*]` via the standard locator triggers Playwright's
      // visibility auto-wait — head children are not visible — so we
      // pierce via `evaluate` instead.
      const robots = await page.evaluate(() => {
        const el = document.querySelector('head meta[name="robots"]');
        return el?.getAttribute('content') ?? null;
      });
      if (robots !== null) {
        expect(robots.toLowerCase(), `${path} robots meta`).not.toContain('noindex');
      }
    }
  });
});
