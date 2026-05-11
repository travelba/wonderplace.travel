import { expect, test } from '@playwright/test';

import { E2E_FAKE_PAID_HOTEL_ID } from './fixtures/env';

/**
 * End-to-end coverage of the **paid Amadeus tunnel** (offer-lock →
 * invite → recap → payment).
 *
 * This spec deliberately stops before the final confirm-payment leaf,
 * because that step writes to Supabase (`bookings`) and calls Brevo —
 * neither of which has an in-process seam yet. The state-machine and
 * draft-cookie propagation are exercised end-to-end through the four
 * surfaces a visitor actually sees.
 *
 * Seams activated by the Playwright webserver:
 *   - `CCT_E2E_FAKE_PAID_HOTEL_ID` → synthetic `booking_mode = 'amadeus'`
 *     hotel snapshot served by {@link getFakePaidHotelHead}.
 *   - `CCT_E2E_FAKE_HOTEL_ID`     → switches the Upstash Redis client
 *     to an in-memory store (`apps/web/src/lib/redis-memory.ts`) for
 *     deterministic draft storage in CI.
 *   - `fake=1` form field         → bypasses Amadeus `priceOffer` and
 *     synthesises an offer with stay/guest inputs.
 */

const HOTEL_NAME = 'Hôtel Amadeus (E2E)';
const CHECK_IN = '2099-06-01';
const CHECK_OUT = '2099-06-04';
const OFFER_ID = `TEST-OFFER-${E2E_FAKE_PAID_HOTEL_ID}`;
const LOCK_PATH = `/reservation/offer/${encodeURIComponent(OFFER_ID)}/lock`;

async function postLockAndFollow(
  page: import('@playwright/test').Page,
  overrides: {
    hotelId?: string;
    fake?: string;
    checkIn?: string;
    checkOut?: string;
    adults?: string;
    children?: string;
  } = {},
): Promise<void> {
  await page.goto('/');

  await page.evaluate(
    async ({ url, body }) => {
      const form = new URLSearchParams(body);
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        redirect: 'manual',
      });
    },
    {
      url: LOCK_PATH,
      body: {
        hotelId: overrides.hotelId ?? E2E_FAKE_PAID_HOTEL_ID,
        fake: overrides.fake ?? '1',
        checkIn: overrides.checkIn ?? CHECK_IN,
        checkOut: overrides.checkOut ?? CHECK_OUT,
        adults: overrides.adults ?? '2',
        children: overrides.children ?? '0',
      },
    },
  );

  // Cookie is set on the lock response; navigate to the redirect target.
  await page.goto('/reservation/invite');
}

test.describe('paid tunnel — expired states (no cookie)', () => {
  test('invite page renders the expired notice when no draft cookie is present', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto('/reservation/invite');

    await expect(
      page.getByRole('heading', { name: /session de réservation a expiré/i }),
    ).toBeVisible();
    // Robots are excluded for tunnel surfaces.
    const robots = await page.evaluate(
      () => document.querySelector('head > meta[name="robots"]')?.getAttribute('content') ?? null,
    );
    expect(robots).toMatch(/noindex/i);
  });

  test('recap page renders the expired notice when no draft cookie is present', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto('/reservation/recap');

    await expect(page.getByRole('heading', { name: /session expirée/i })).toBeVisible();
  });

  test('payment page renders the expired notice when no draft cookie is present', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto('/reservation/payment');

    await expect(
      page.getByRole('heading', { name: /session de paiement indisponible/i }),
    ).toBeVisible();
  });

  test('invite page treats an unknown draft id as expired', async ({ page, context }) => {
    await context.clearCookies();
    await context.addCookies([
      {
        name: 'cct.bk_draft',
        value: 'unknown-draft-id-deadbeef',
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    await page.goto('/reservation/invite');
    await expect(
      page.getByRole('heading', { name: /session de réservation a expiré/i }),
    ).toBeVisible();
  });
});

test.describe('paid tunnel — lock route input validation', () => {
  test('rejects malformed hotelId with a JSON 400', async ({ page }) => {
    await page.goto('/');

    const status = await page.evaluate(async (url) => {
      const form = new URLSearchParams({
        hotelId: 'not-a-uuid',
        fake: '1',
        checkIn: '2099-06-01',
        checkOut: '2099-06-04',
      });
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      return r.status;
    }, LOCK_PATH);

    expect(status).toBe(400);
  });

  test('rejects empty body with invalid_form_body', async ({ page }) => {
    await page.goto('/');

    const payload = await page.evaluate(async (url) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not a form',
      });
      return { status: r.status, body: await r.text() };
    }, LOCK_PATH);

    expect(payload.status).toBe(400);
    expect(payload.body).toContain('invalid_form_body');
  });

  test('inverted stay dates redirect back to search with invalid_stay', async ({
    page,
    request,
    baseURL,
  }) => {
    // `page.request` shares cookies with the browser context; using the
    // top-level `request` fixture keeps the assertion entirely on
    // Node — fetch's `redirect: 'manual'` returns an opaqueredirect
    // (status 0) inside the page context which is unobservable.
    const r = await request.post(`${baseURL}${LOCK_PATH}`, {
      maxRedirects: 0,
      form: {
        hotelId: E2E_FAKE_PAID_HOTEL_ID,
        fake: '1',
        checkIn: '2099-06-10',
        checkOut: '2099-06-01',
      },
    });

    expect(r.status()).toBe(303);
    expect(r.headers()['location']).toMatch(/\/recherche\?.*error=invalid_stay/);
    // Mark `page` as intentionally used to satisfy lint.
    expect(page).toBeDefined();
  });
});

test.describe('paid tunnel — happy path (lock → invite → recap → payment)', () => {
  test('locks the offer and lands on /reservation/invite with hotel header', async ({ page }) => {
    await postLockAndFollow(page);

    await expect(page.getByRole('heading', { name: HOTEL_NAME })).toBeVisible();
    await expect(page.getByText('Étape 2 sur 4 — Voyageur')).toBeVisible();
    await expect(page.getByText('Votre séjour')).toBeVisible();

    // Stay summary surfaces the dates verbatim in YYYY-MM-DD format.
    await expect(page.getByText(`${CHECK_IN} → ${CHECK_OUT}`)).toBeVisible();
    await expect(page.getByText('2 adultes')).toBeVisible();

    // Form is wired with the four required fields and a submit CTA.
    await expect(page.getByLabel('Prénom', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Nom', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Adresse e-mail', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Téléphone', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible();
  });

  test('full flow: submit guest → recap → continue to payment', async ({ page }) => {
    await postLockAndFollow(page);

    await page.getByLabel('Prénom', { exact: true }).fill('Alice');
    await page.getByLabel('Nom', { exact: true }).fill('Dupont');
    await page.getByLabel('Adresse e-mail', { exact: true }).fill('alice.dupont@example.com');
    await page.getByLabel('Téléphone', { exact: true }).fill('+33612345678');

    await page.getByRole('button', { name: 'Continuer' }).click();

    // 2.a — Recap surface.
    await expect(page).toHaveURL(/\/reservation\/recap$/);
    await expect(page.getByRole('heading', { name: /vérifiez votre réservation/i })).toBeVisible();
    await expect(page.getByText('Étape 3 sur 4 — Récapitulatif')).toBeVisible();
    await expect(page.getByRole('heading', { name: HOTEL_NAME })).toBeVisible();
    await expect(page.getByText('Alice Dupont')).toBeVisible();
    await expect(page.getByText('alice.dupont@example.com')).toBeVisible();
    await expect(page.getByText(/politique d'annulation/i)).toBeVisible();
    await expect(page.getByText(/annulation gratuite jusqu'à 48h avant l'arrivée/i)).toBeVisible();
    // Total = €250 * 3 nights = €750 (formatted FR).
    await expect(page.getByText(/750,00\s*€/)).toBeVisible();

    // 2.b — Continue to payment.
    await page.getByRole('button', { name: /continuer vers le paiement/i }).click();

    await expect(page).toHaveURL(/\/reservation\/payment$/);
    await expect(page.getByRole('heading', { name: /paiement sécurisé amadeus/i })).toBeVisible();
    await expect(page.getByText('Étape 4 sur 4 — Paiement')).toBeVisible();
    // Stub banner surfaces because no live payment provider is wired.
    await expect(page.getByRole('heading', { name: /mode test — paiement simulé/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /confirmer \(mode test\)/i })).toBeVisible();
    // PCI mention stays visible regardless of provider mode.
    await expect(page.getByText(/PCI DSS Level 1/)).toBeVisible();
  });

  test('invite submit with invalid guest redirects back with error=validation', async ({
    page,
  }) => {
    await postLockAndFollow(page);

    // Force the server action to receive empty payload by clearing the
    // required fields and bypassing the noValidate form: submit via a
    // direct POST that targets the same action without filling them.
    // Easier: leave fields empty, submit; HTML5 doesn't block because
    // the form is `noValidate`.
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page).toHaveURL(/\/reservation\/invite\?error=validation$/);
    // Scope to <main> to disambiguate from the Next.js route announcer
    // (`<div id="__next-route-announcer__" role="alert">`).
    await expect(page.locator('main').getByRole('alert')).toContainText(
      /certaines informations sont invalides/i,
    );
  });

  test('recap remains accessible after submission and shows full summary', async ({ page }) => {
    await postLockAndFollow(page);

    await page.getByLabel('Prénom', { exact: true }).fill('Bob');
    await page.getByLabel('Nom', { exact: true }).fill('Martin');
    await page.getByLabel('Adresse e-mail', { exact: true }).fill('bob@example.com');
    await page.getByLabel('Téléphone', { exact: true }).fill('+33700000000');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.waitForURL(/\/reservation\/recap$/);
    // Refresh — `dynamic = 'force-dynamic'` should re-render with the
    // persisted draft (state advanced to `guest_collected`).
    await page.reload();

    await expect(page.getByRole('heading', { name: /vérifiez votre réservation/i })).toBeVisible();
    await expect(page.getByText('Bob Martin')).toBeVisible();
  });
});
