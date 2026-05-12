import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { E2E_FAKE_HOTEL_ID } from './fixtures/env';
import { setConsentCookie } from './fixtures/consent';

/**
 * Accessibility scans (skill: test-strategy §a11y, accessibility skill).
 *
 * We target WCAG 2.1 AA + best-practice rules and assert **zero
 * serious-or-critical violations**. The skill mandates this on home,
 * hotel detail, booking step 3, account and editorial classement —
 * each new public surface added to the app must land here too.
 *
 * Coverage
 * --------
 *
 * Static surfaces (no upstream data needed) — these were the
 * original four scans:
 *   - FR / EN home
 *   - Cookies policy + legal notice
 *
 * Dynamic surfaces (rely on the dev-fake seam) — added Phase 11.7:
 *   - FR / EN hotel detail (`hotel-de-test-e2e`) — exercises the
 *     hero, gallery, fact-sheet, AEO answer, FAQ, rooms grid, MICE
 *     section, breadcrumb, freshness pill, JSON-LD scripts.
 *   - `/recherche` (FR + EN) — search form landmark + empty state.
 *   - `/compte/connexion`, `/compte/inscription` (FR + EN) — auth
 *     forms with `?error=…` / `?sent=1` banners.
 *   - `/reservation/start` — booking step 1 (guest form,
 *     email-mode CTA).
 *
 * Skipped intentionally
 * ---------------------
 *
 *   - `/compte` dashboard — requires a real Supabase session; the
 *     unauth redirect path is the one that surfaces public,
 *     covered by the unauthenticated `/compte/connexion` scan.
 *   - `/compte/nouveau-mot-de-passe` — requires a valid reset
 *     token; the public "missing token" branch renders the same
 *     banner shape as the others.
 *
 * Why two locales for hotel detail / recherche / compte
 * -----------------------------------------------------
 *
 * The locale switch swaps every visible string and the `<html lang>`
 * attribute. axe's `html-has-lang` and `valid-lang` rules verify
 * that explicitly; running both locales catches a regression that
 * would only surface on EN copy without affecting FR (or vice versa).
 */

const SERIOUS_IMPACTS = new Set(['serious', 'critical']);

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] as const;

interface AxeScanCase {
  readonly name: string;
  readonly path: string;
  /**
   * CSS selectors of regions to **exclude** from the scan. Used
   * sparingly — only for known-noisy third-party widgets we cannot
   * remediate (none today). Each exclusion MUST carry a comment at
   * the call site explaining why; new exclusions need PR review.
   */
  readonly exclude?: readonly string[];
}

async function runAxeScan(page: Page, scan: AxeScanCase): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  if (scan.exclude !== undefined) {
    for (const sel of scan.exclude) {
      builder = builder.exclude(sel);
    }
  }
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => SERIOUS_IMPACTS.has(v.impact ?? ''));
  if (blocking.length > 0) {
    // Surface the offenders in the test report. The shape mirrors
    // axe-core's own JSON output so the failure trace is grep-able.

    console.error(
      `${scan.name} axe violations:`,
      JSON.stringify(
        blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            html: n.html.slice(0, 200),
          })),
        })),
        null,
        2,
      ),
    );
  }
  expect(blocking, `Serious/critical axe violations on ${scan.name}`).toEqual([]);
}

test.describe('a11y / axe scan', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass the consent banner so the dialog overlay does not pollute
    // the scan (the banner is a non-modal `aria-modal="false"` element
    // but is exercised separately in `consent.spec.ts`).
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  for (const scan of [
    // ----- Static surfaces (original four scans) ---------------
    { name: 'FR home', path: '/' },
    { name: 'EN home', path: '/en' },
    { name: 'Cookies policy', path: '/cookies' },
    { name: 'Legal notice', path: '/mentions-legales' },
    // ----- Dynamic surfaces (Phase 11.7) -----------------------
    { name: 'FR hotel detail', path: '/hotel/hotel-de-test-e2e' },
    { name: 'EN hotel detail', path: '/en/hotel/hotel-de-test-e2e-en' },
    { name: 'FR search', path: '/recherche' },
    { name: 'EN search', path: '/en/recherche' },
    { name: 'FR sign-in', path: '/compte/connexion' },
    { name: 'EN sign-in', path: '/en/compte/connexion' },
    { name: 'FR sign-up', path: '/compte/inscription' },
    { name: 'EN sign-up', path: '/en/compte/inscription' },
    { name: 'FR forgot password', path: '/compte/mot-de-passe-oublie' },
    {
      name: 'FR reservation start',
      path: `/reservation/start?hotelId=${E2E_FAKE_HOTEL_ID}`,
    },
  ] as readonly AxeScanCase[]) {
    test(`${scan.name} has no serious/critical violations`, async ({ page }) => {
      await page.goto(scan.path);
      await runAxeScan(page, scan);
    });
  }

  test('FR hotel detail exposes the MICE section landmark and CTA', async ({ page }) => {
    // Smoke check that the recently-shipped MICE section
    // (Phase 11.5 + 11.6) wires its accessibility primitives the way
    // axe expects — the broader scan above asserts zero violations
    // *globally*; this case anchors on the specific affordances we
    // care about (landmark labelled via `aria-labelledby`, mailto
    // CTA with descriptive `aria-label`).
    await page.goto('/hotel/hotel-de-test-e2e');

    const section = page.locator('section[aria-labelledby="mice-title"]');
    await expect(section).toBeVisible();
    await expect(page.locator('#mice-title')).toBeVisible();

    const cta = section.getByRole('link', { name: /MICE.*Hôtel de Test/i });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute('href');
    expect(href?.startsWith('mailto:')).toBe(true);
    // The local part / domain stay un-encoded (mailto: scheme allows
    // `@` and `.`); only the `subject` query string is URI-encoded.
    expect(href).toContain('mailto:events@hoteldetest.example?subject=');
  });
});
