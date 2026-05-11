import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * Accessibility scans (skill: test-strategy §a11y, accessibility skill).
 *
 * We target WCAG 2.1 AA + best-practice rules and assert **zero
 * serious-or-critical violations**. The skill mandates this on home,
 * hotel detail, booking step 3, account and editorial classement —
 * tests for the surfaces that are not yet seedable will be added with
 * each new domain.
 */

const SERIOUS_IMPACTS = new Set(['serious', 'critical']);

test.describe('a11y / axe scan', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass the consent banner so the dialog overlay does not pollute
    // the scan (the banner is a non-modal `aria-modal="false"` element
    // but is exercised separately in `consent.spec.ts`).
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  for (const { name, path } of [
    { name: 'FR home', path: '/' },
    { name: 'EN home', path: '/en' },
    { name: 'Cookies policy', path: '/cookies' },
    { name: 'Legal notice', path: '/mentions-legales' },
  ] as const) {
    test(`${name} has no serious/critical violations`, async ({ page }) => {
      await page.goto(path);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
        // Tailwind's CSS custom properties for theme colours sometimes
        // confuse the contrast checker on muted utility classes. Keep
        // colour-contrast enabled but exclude the global decorative
        // gradient on `<body>` if one is added later — for now no
        // exclusion is necessary.
        .analyze();

      const blocking = results.violations.filter((v) => SERIOUS_IMPACTS.has(v.impact ?? ''));
      if (blocking.length > 0) {
        // Surface the offenders in the test report.

        console.error(
          `${name} axe violations:`,
          JSON.stringify(
            blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
            null,
            2,
          ),
        );
      }
      expect(blocking, `Serious/critical axe violations on ${name}`).toEqual([]);
    });
  }
});
