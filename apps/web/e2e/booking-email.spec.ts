import { expect, test } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';
import { E2E_FAKE_HOTEL_ID } from './fixtures/env';

/**
 * Email-mode booking tunnel — public UX surface.
 *
 * Skill: test-strategy §E2E #2 (email-mode booking request).
 *
 * Coverage scope:
 *  - `/recherche` chrome (FR + EN) — search form, date and guest
 *    inputs, accessible labels, results-empty prompt.
 *  - `/reservation/start` states:
 *      * No `hotelId` → "missing params" page.
 *      * Unknown hotelId (Supabase returns null / unreachable) →
 *        "unbookable" page.
 *      * Known hotelId (resolved via the `CCT_E2E_FAKE_HOTEL_ID` dev
 *        seam) → full guest-details form with hotel head, stay
 *        summary and required fields.
 *      * Error query params (`?error=validation` and
 *        `?error=rate_limited&retryAfter=…&scope=…`) → localized
 *        alert.
 *  - `/reservation/confirmation/<unknown-ref>` → graceful 404 (the
 *    page must not crash when Supabase is unreachable).
 *
 * Submitting the server action requires Supabase + Brevo + Redis and
 * is covered by integration tests in `apps/web/src/server/**` and
 * vitest specs with MSW. The E2E here locks the **rendered** tunnel
 * surface.
 */

const FAKE_HOTEL_ID = E2E_FAKE_HOTEL_ID;

const RESERVATION_START_FR = '/reservation/start';
const RESERVATION_START_EN = '/en/reservation/start';

function startUrl(base: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs.length > 0 ? `${base}?${qs}` : base;
}

test.describe('booking — email mode', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  test('/recherche renders the search form with all stay controls (FR)', async ({ page }) => {
    const res = await page.goto('/recherche');
    expect(res?.status()).toBe(200);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Rechercher un hôtel' }),
    ).toBeVisible();

    const form = page.getByRole('search');
    await expect(form).toBeVisible();
    await expect(form.getByLabel('Votre recherche')).toBeVisible();
    await expect(form.getByLabel('Arrivée')).toBeVisible();
    await expect(form.getByLabel('Départ')).toBeVisible();
    await expect(form.getByLabel('Adultes')).toBeVisible();
    await expect(form.getByLabel('Enfants')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Rechercher' })).toBeVisible();
  });

  test('/recherche (EN) preserves the search form with translated labels', async ({ page }) => {
    const res = await page.goto('/en/recherche');
    expect(res?.status()).toBe(200);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/reservation/start without hotelId shows the "missing" state', async ({ page }) => {
    const res = await page.goto(RESERVATION_START_FR);
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Paramètres manquants' }),
    ).toBeVisible();
    // The page is marked `noindex` (see generateMetadata).
    const robots = await page.evaluate(() => {
      const el = document.querySelector('head meta[name="robots"]');
      return el?.getAttribute('content') ?? null;
    });
    expect(robots?.toLowerCase()).toContain('noindex');
  });

  test('/reservation/start with an unknown hotelId shows the "unbookable" state', async ({
    page,
  }) => {
    const res = await page.goto(
      startUrl(RESERVATION_START_FR, {
        hotelId: '00000000-0000-0000-0000-000000000000',
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
        adults: '2',
        children: '0',
      }),
    );
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Hôtel non disponible' }),
    ).toBeVisible();
  });

  test('/reservation/start with the fake hotelId renders the full guest form', async ({ page }) => {
    const res = await page.goto(
      startUrl(RESERVATION_START_FR, {
        hotelId: FAKE_HOTEL_ID,
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
        adults: '2',
        children: '0',
      }),
    );
    expect(res?.status()).toBe(200);

    // Hotel head from the seam.
    await expect(page.getByRole('heading', { level: 1, name: /Hôtel de Test/i })).toBeVisible();

    // Stay summary echoes the query string.
    await expect(page.getByText('2026-08-01', { exact: false })).toBeVisible();
    await expect(page.getByText('2026-08-03', { exact: false })).toBeVisible();

    // Form legend and the five required fields. We assert by visible
    // text labels (`<label><span>…</span><input/></label>`) to mirror
    // a real user filling the form, not by `name=` attribute. Exact
    // matching is required so that "Nom" does not match "Prénom".
    const form = page.locator('form').filter({ hasText: 'Vos coordonnées' });
    await expect(form).toBeVisible();
    await expect(form.getByLabel('Prénom', { exact: true })).toBeVisible();
    await expect(form.getByLabel('Nom', { exact: true })).toBeVisible();
    await expect(form.getByLabel('Adresse e-mail', { exact: true })).toBeVisible();
    await expect(form.getByLabel('Téléphone', { exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Envoyer la demande' })).toBeVisible();

    // The required fields must report `required` (HTML5 client-side
    // first line of defence — the server action revalidates).
    for (const name of ['firstName', 'lastName', 'email', 'phone']) {
      await expect(form.locator(`input[name="${name}"]`)).toHaveAttribute('required', '');
    }

    // The page is non-indexable.
    const robots = await page.evaluate(() => {
      const el = document.querySelector('head meta[name="robots"]');
      return el?.getAttribute('content') ?? null;
    });
    expect(robots?.toLowerCase()).toContain('noindex');
  });

  test('/reservation/start surfaces the validation error from the query', async ({ page }) => {
    await page.goto(
      startUrl(RESERVATION_START_FR, {
        hotelId: FAKE_HOTEL_ID,
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
        adults: '2',
        children: '0',
        error: 'validation',
      }),
    );
    // Scope to the page alert — Next.js injects a global
    // `<div id="__next-route-announcer__" role="alert">` that also
    // matches `getByRole('alert')` and would trigger strict-mode.
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Certains champs ne sont pas valides/i);
  });

  test('/reservation/start surfaces the rate-limited error with the correct scope and delay', async ({
    page,
  }) => {
    await page.goto(
      startUrl(RESERVATION_START_FR, {
        hotelId: FAKE_HOTEL_ID,
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
        adults: '2',
        children: '0',
        error: 'rate_limited',
        retryAfter: '120',
        scope: 'ip',
      }),
    );
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toBeVisible();
    // ICU plural: "depuis votre connexion" + "2 minutes".
    await expect(alert).toContainText(/depuis votre connexion/i);
    await expect(alert).toContainText(/2 minutes/);
  });

  test('/reservation/start (EN) renders the form for the fake hotel', async ({ page }) => {
    await page.goto(
      startUrl(RESERVATION_START_EN, {
        hotelId: FAKE_HOTEL_ID,
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
        adults: '2',
        children: '0',
      }),
    );
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    // The English form legend lives in `en.json` — assert the role
    // structure rather than a hard-coded translation so this spec
    // doubles as a guard against i18n drift.
    await expect(page.locator('form')).toBeVisible();
    await expect(
      page.locator('form').getByRole('button', { name: /send|submit|request/i }),
    ).toBeVisible();
  });

  test('/reservation/confirmation/<unknown-ref> renders a graceful 404', async ({ page }) => {
    // Ref must match the canonical pattern `CT-YYYYMMDD-XXXXX` so we
    // get past the format guard; the lookup will then return null and
    // Next.js falls back to its not-found page.
    const res = await page.goto('/reservation/confirmation/CT-20260101-TEST1');
    expect(res?.status()).toBe(404);
  });
});
