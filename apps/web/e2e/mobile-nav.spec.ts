import { expect, test } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * Mobile drawer (skill: accessibility §dialogs).
 *
 * The hamburger only renders below the `md` breakpoint (768 px) — we
 * scope these checks to the `mobile-chromium` project where the
 * viewport is 393 × 851 (Pixel 5). On desktop the same trigger is
 * `display: none` and the assertions would fail, so we skip there.
 */
test.describe('mobile drawer', () => {
  test.beforeEach(async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 768, 'mobile-only test');
    await setConsentCookie(page, { essential: true, analytics: false });
    await page.goto('/');
  });

  test('opens, traps focus and closes via Escape', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Ouvrir le menu' });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Menu mobile' });
    await expect(dialog).toBeVisible();

    // The first focusable element inside the panel is the close-icon
    // button (rendered before the nav). We don't pin to a specific
    // element — we only assert focus has moved *inside* the dialog,
    // which is the actual a11y contract.
    await expect
      .poll(async () => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);

    // Body scroll is locked while the drawer is open.
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Body scroll is restored after closing.
    const restored = await page.evaluate(() => document.body.style.overflow);
    expect(restored).not.toBe('hidden');

    // Focus returns to the trigger.
    await expect(trigger).toBeFocused();
  });

  test('closes when clicking the backdrop', async ({ page }) => {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Menu mobile' });
    await expect(dialog).toBeVisible();

    // The backdrop is uniquely identified by `tabindex="-1"` on a
    // button with `aria-label="Fermer le menu"`. It is absolute-
    // positioned across the whole viewport, but Playwright's default
    // centre-click would land inside the slide-over panel that
    // overlays the right side of the screen. Click at the top-left
    // corner instead, where only the backdrop covers the surface.
    const backdrop = page.locator('button[aria-label="Fermer le menu"][tabindex="-1"]');
    await backdrop.click({ position: { x: 10, y: 10 } });
    await expect(dialog).toBeHidden();
  });

  test('closes after navigating via a link', async ({ page }) => {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Menu mobile' });
    await dialog.getByRole('link', { name: 'Destinations' }).click();

    await expect(page).toHaveURL(/\/destination$/);
    await expect(dialog).toBeHidden();
  });
});
