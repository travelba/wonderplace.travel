import type { Page } from '@playwright/test';

/**
 * Cookie name + schema mirror `@cct/domain/consent` (CONSENT_COOKIE_NAME,
 * parseConsentCookie). Re-declared here so Playwright doesn't pull the
 * workspace path aliases.
 */
export const CONSENT_COOKIE_NAME = 'cct.consent.v1';
export const CONSENT_VERSION = 1;

export type ConsentDecision = {
  readonly essential: true;
  readonly analytics: boolean;
};

export function consentCookieValue(
  decision: ConsentDecision,
  decidedAt: Date = new Date(),
): string {
  const payload = {
    v: CONSENT_VERSION,
    ts: decidedAt.toISOString(),
    essential: true,
    analytics: decision.analytics,
  };
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * Inject the consent cookie into the browser context so subsequent
 * navigations skip the banner. Used by specs whose subject is NOT the
 * banner itself.
 */
export async function setConsentCookie(page: Page, decision: ConsentDecision): Promise<void> {
  const currentUrl = page.url();
  const url = new URL(currentUrl === 'about:blank' ? 'http://127.0.0.1' : currentUrl);
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE_NAME,
      value: consentCookieValue(decision),
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}
