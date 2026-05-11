import { expect, test } from '@playwright/test';

import { setConsentCookie } from './fixtures/consent';

/**
 * Account / Supabase Auth — public UX surface.
 *
 * Skill: test-strategy §E2E #4 (account flows); skill:
 * auth-role-management (sign-in, sign-up, forgot, reset password),
 * skill: security-engineering §GDPR (honeypot, noindex, no PII in
 * server logs).
 *
 * The four auth pages render purely from request data. They use
 * `getOptionalUser()` which gracefully returns `null` when Supabase
 * env vars are absent (CI smoke build) — so the form rendering, the
 * `?error=…` / `?pending=1` / `?sent=1` banners and the "session
 * missing" redirects can all be locked at the E2E layer without a
 * live Supabase Auth stack.
 *
 * The real form submission (sign-in, sign-up, reset) is covered by
 * vitest+MSW integration specs against `signInAction`, `signUpAction`
 * etc. — out of scope here.
 */

const SIGNIN_FR = '/compte/connexion';
const SIGNUP_FR = '/compte/inscription';
const FORGOT_FR = '/compte/mot-de-passe-oublie';
const RESET_FR = '/compte/nouveau-mot-de-passe';
const DASHBOARD_FR = '/compte';

const SIGNIN_EN = '/en/compte/connexion';
const SIGNUP_EN = '/en/compte/inscription';

function withQuery(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs.length > 0 ? `${path}?${qs}` : path;
}

async function readRobots(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('head meta[name="robots"]');
    return el?.getAttribute('content') ?? null;
  });
}

test.describe('compte (account)', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page, { essential: true, analytics: false });
  });

  /* ------------------------------------------------------------------ */
  /* Dashboard guard — unauthenticated users go to /compte/connexion    */
  /* ------------------------------------------------------------------ */

  test('GET /compte (no user) redirects to /compte/connexion with `next` echo', async ({
    page,
  }) => {
    const res = await page.goto(DASHBOARD_FR);
    expect(res?.status()).toBe(200);
    // After the server-side `redirect()` Playwright lands on the
    // sign-in page; the `next` param carries the original destination.
    await expect(page).toHaveURL(/\/compte\/connexion\?next=%2Fcompte/);
    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  });

  test('GET /compte/nouveau-mot-de-passe (no session) bounces to sign-in with `session_missing`', async ({
    page,
  }) => {
    await page.goto(RESET_FR);
    await expect(page).toHaveURL(/\/compte\/connexion\?error=session_missing/);
    // The error banner is shown on the destination.
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toContainText(/session a expiré/i);
  });

  /* ------------------------------------------------------------------ */
  /* Sign-in page (FR)                                                  */
  /* ------------------------------------------------------------------ */

  test('/compte/connexion renders the form with email + password + cross-links (FR)', async ({
    page,
  }) => {
    const res = await page.goto(SIGNIN_FR);
    expect(res?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();

    const form = page.locator('main form');
    const email = form.getByLabel('Adresse e-mail', { exact: true });
    const password = form.getByLabel('Mot de passe', { exact: true });
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('type', 'email');
    await expect(email).toHaveAttribute('autocomplete', 'email');
    await expect(email).toHaveAttribute('required', '');
    await expect(password).toBeVisible();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    await expect(password).toHaveAttribute('minlength', '8');
    await expect(password).toHaveAttribute('required', '');

    await expect(form.getByRole('button', { name: 'Se connecter' })).toBeVisible();

    // Cross-navigation to forgot + signup must be present.
    await expect(page.getByRole('link', { name: 'Mot de passe oublié ?' })).toHaveAttribute(
      'href',
      '/compte/mot-de-passe-oublie',
    );
    await expect(page.getByRole('link', { name: 'Créer un compte' }).first()).toHaveAttribute(
      'href',
      '/compte/inscription',
    );

    expect((await readRobots(page))?.toLowerCase()).toContain('noindex');
  });

  test('/compte/connexion?error=invalid_credentials renders the alert + prefills the email', async ({
    page,
  }) => {
    await page.goto(
      withQuery(SIGNIN_FR, { email: 'test@example.com', error: 'invalid_credentials' }),
    );
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toContainText(/incorrect/i);

    const email = page.locator('main form').getByLabel('Adresse e-mail', { exact: true });
    await expect(email).toHaveValue('test@example.com');
  });

  test('/compte/connexion?pending=1 surfaces the post-signup pending banner', async ({ page }) => {
    await page.goto(withQuery(SIGNIN_FR, { pending: '1' }));
    const status = page.locator('main').getByRole('status');
    await expect(status).toContainText(/confirmez votre adresse/i);
  });

  test('/compte/connexion?next=/compte forwards the next-path as a hidden input', async ({
    page,
  }) => {
    await page.goto(withQuery(SIGNIN_FR, { next: '/compte' }));
    const hidden = page.locator('main form input[type="hidden"][name="next"]');
    await expect(hidden).toHaveAttribute('value', '/compte');
  });

  test('/en/compte/connexion serves the English sign-in form', async ({ page }) => {
    await page.goto(SIGNIN_EN);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    // The page heading is translated — assert via `level=1` rather
    // than a hard-coded string so EN copy edits don't break the test.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main form input[name="email"]')).toBeVisible();
    await expect(page.locator('main form input[name="password"]')).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /* Sign-up page                                                       */
  /* ------------------------------------------------------------------ */

  test('/compte/inscription renders the full registration form with a hidden honeypot', async ({
    page,
  }) => {
    const res = await page.goto(SIGNUP_FR);
    expect(res?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1, name: 'Créer un compte' })).toBeVisible();

    const form = page.locator('main form');
    // All five user-visible fields + the newsletter checkbox.
    await expect(form.locator('input[name="displayName"]')).toBeVisible();
    await expect(form.locator('input[name="email"]')).toBeVisible();
    await expect(form.locator('input[name="password"]')).toBeVisible();
    await expect(form.locator('input[name="confirmPassword"]')).toBeVisible();
    await expect(form.locator('input[name="newsletter"]')).toHaveAttribute('type', 'checkbox');

    // Password fields enforce min 8 / max 128 on the client side.
    for (const name of ['password', 'confirmPassword']) {
      const input = form.locator(`input[name="${name}"]`);
      await expect(input).toHaveAttribute('minlength', '8');
      await expect(input).toHaveAttribute('maxlength', '128');
      await expect(input).toHaveAttribute('required', '');
    }

    await expect(form.getByRole('button', { name: 'Créer mon compte' })).toBeVisible();

    // Skill: security-engineering — the honeypot must be present in
    // the DOM but invisible to humans (off-screen) AND opaque to
    // assistive tech (`aria-hidden`). Three contracts to lock:
    //  1. The wrapping label carries `aria-hidden="true"` (screen
    //     reader silence).
    //  2. The input has `tabindex="-1"` (cannot be reached by Tab).
    //  3. The label is positioned far off-screen (`-left-[10000px]`)
    //     so a sighted user never sees it.
    const honeypotLabel = form.locator('label[aria-hidden="true"]');
    await expect(honeypotLabel).toHaveCount(1);
    const honeypotInput = honeypotLabel.locator('input[name="website"]');
    await expect(honeypotInput).toHaveAttribute('tabindex', '-1');

    // Bounding-box: the label is rendered to the left of the
    // viewport. `boundingBox().x` is the value the user would see if
    // the page didn't scroll horizontally — it should be a large
    // negative number, never close to 0.
    const box = await honeypotLabel.boundingBox();
    expect(box, 'honeypot bounding box').not.toBeNull();
    expect(box!.x).toBeLessThan(-1000);

    expect((await readRobots(page))?.toLowerCase()).toContain('noindex');
  });

  test('/compte/inscription?error=email_taken renders the alert', async ({ page }) => {
    await page.goto(withQuery(SIGNUP_FR, { error: 'email_taken', email: 'used@example.com' }));
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toContainText(/un compte existe déjà/i);
    await expect(
      page.locator('main form').getByLabel('Adresse e-mail', { exact: true }),
    ).toHaveValue('used@example.com');
  });

  test('/en/compte/inscription serves the English sign-up form', async ({ page }) => {
    await page.goto(SIGNUP_EN);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    await expect(page.locator('main form input[name="email"]')).toBeVisible();
    await expect(page.locator('main form input[name="confirmPassword"]')).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /* Forgot password page                                               */
  /* ------------------------------------------------------------------ */

  test('/compte/mot-de-passe-oublie renders the email form and a back-link', async ({ page }) => {
    const res = await page.goto(FORGOT_FR);
    expect(res?.status()).toBe(200);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Mot de passe oublié' }),
    ).toBeVisible();

    const form = page.locator('main form');
    const email = form.getByLabel('Adresse e-mail', { exact: true });
    await expect(email).toHaveAttribute('type', 'email');
    await expect(email).toHaveAttribute('required', '');
    await expect(form.getByRole('button', { name: 'Envoyer le lien' })).toBeVisible();

    await expect(page.getByRole('link', { name: 'Retour à la connexion' })).toHaveAttribute(
      'href',
      '/compte/connexion',
    );

    expect((await readRobots(page))?.toLowerCase()).toContain('noindex');
  });

  test('/compte/mot-de-passe-oublie?sent=1 surfaces the success banner', async ({ page }) => {
    await page.goto(withQuery(FORGOT_FR, { sent: '1' }));
    const status = page.locator('main').getByRole('status');
    await expect(status).toContainText(/un e-mail vient d'être envoyé/i);
  });

  test('/compte/mot-de-passe-oublie?error=rate_limited surfaces the rate-limit alert', async ({
    page,
  }) => {
    await page.goto(withQuery(FORGOT_FR, { error: 'rate_limited' }));
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toContainText(/Trop de tentatives/i);
  });
});
