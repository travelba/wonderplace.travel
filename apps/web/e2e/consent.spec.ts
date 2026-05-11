import { expect, test, type Page } from '@playwright/test';

import { CONSENT_COOKIE_NAME } from './fixtures/consent';

/**
 * GDPR/CNIL cookie consent flows (skill: security-engineering §GDPR).
 *
 * Verifies:
 *  - The banner auto-opens on first visit (no decision cookie).
 *  - Each primary action (Accept all / Reject all / Customize → Save)
 *    persists a properly shaped cookie under `cct.consent.v1`.
 *  - The footer "Gérer les cookies" link re-opens the banner after a
 *    decision has been made.
 */

type StoredConsent = {
  readonly v: number;
  readonly ts: string;
  readonly essential: true;
  readonly analytics: boolean;
};

async function readConsentCookie(page: Page): Promise<StoredConsent | null> {
  const cookies = await page.context().cookies();
  const target = cookies.find((c) => c.name === CONSENT_COOKIE_NAME);
  if (!target) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(target.value)) as StoredConsent;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The banner has both `aria-labelledby` (the title) and `aria-label`
 * (the FR `dialog.label`). ARIA gives `aria-labelledby` precedence, so
 * the dialog's accessible name is the **title** ("Vos préférences
 * cookies"), not the `aria-label` value.
 */
const BANNER_ACCESSIBLE_NAME = /Vos préférences cookies/i;

test.describe('consent banner', () => {
  test('auto-opens for a first-time visitor', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');

    const banner = page.getByRole('dialog', { name: BANNER_ACCESSIBLE_NAME });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Tout accepter' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Tout refuser' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Personnaliser' })).toBeVisible();
  });

  test('"Tout accepter" persists analytics=true and closes the banner', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');

    const banner = page.getByRole('dialog', { name: BANNER_ACCESSIBLE_NAME });
    await banner.getByRole('button', { name: 'Tout accepter' }).click();
    await expect(banner).toBeHidden();

    const stored = await readConsentCookie(page);
    expect(stored).not.toBeNull();
    expect(stored?.v).toBe(1);
    expect(stored?.essential).toBe(true);
    expect(stored?.analytics).toBe(true);
    expect(typeof stored?.ts).toBe('string');
  });

  test('"Tout refuser" persists analytics=false', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');

    const banner = page.getByRole('dialog', { name: BANNER_ACCESSIBLE_NAME });
    await banner.getByRole('button', { name: 'Tout refuser' }).click();
    await expect(banner).toBeHidden();

    const stored = await readConsentCookie(page);
    expect(stored?.analytics).toBe(false);
    expect(stored?.essential).toBe(true);
  });

  test('"Personnaliser" → uncheck analytics → save → persists analytics=false', async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto('/');

    const banner = page.getByRole('dialog', { name: BANNER_ACCESSIBLE_NAME });
    await banner.getByRole('button', { name: 'Personnaliser' }).click();

    const analyticsCheckbox = banner.getByRole('checkbox', {
      name: /Mesure d'audience/i,
    });
    await expect(analyticsCheckbox).toBeVisible();
    // Default in the customize view is checked.
    await expect(analyticsCheckbox).toBeChecked();

    await analyticsCheckbox.uncheck();
    await banner.getByRole('button', { name: 'Enregistrer mes choix' }).click();
    await expect(banner).toBeHidden();

    const stored = await readConsentCookie(page);
    expect(stored?.analytics).toBe(false);
  });

  test('footer "Gérer les cookies" re-opens the banner after a decision', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');

    const banner = page.getByRole('dialog', { name: BANNER_ACCESSIBLE_NAME });
    await banner.getByRole('button', { name: 'Tout refuser' }).click();
    await expect(banner).toBeHidden();

    // Footer button is plain `<button>` with the localized label.
    const manage = page.getByRole('contentinfo').getByRole('button', { name: 'Gérer les cookies' });
    await manage.scrollIntoViewIfNeeded();
    await manage.click();

    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Tout accepter' })).toBeVisible();
  });
});
