import 'server-only';

import { cookies } from 'next/headers';

import { CONSENT_COOKIE_NAME, parseConsentCookie, type ConsentState } from '@cct/domain/consent';

/**
 * Server-side read of the consent cookie. Returns `null` when the user
 * has not yet made a decision — Server Components can use this to skip
 * server-side instrumentation that would otherwise depend on consent.
 *
 * Note: in line with CNIL guidance, the absence of a decision is
 * treated as "refused" — server-side analytics must NOT fire until
 * `analytics === true`.
 */
export async function getConsentFromCookies(): Promise<ConsentState | null> {
  const jar = await cookies();
  const value = jar.get(CONSENT_COOKIE_NAME)?.value;
  return parseConsentCookie(value);
}
