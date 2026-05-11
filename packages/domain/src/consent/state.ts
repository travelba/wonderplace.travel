/**
 * GDPR/CNIL cookie consent state (skill: security-engineering §GDPR).
 *
 * Versioned, immutable record stored client-side and read by both
 * server (for Server Components / route handlers via cookies) and client
 * (for gating analytics SDKs).
 *
 * V1 categories — two for now, additive in future versions:
 *  - `essential`  : always-on (session, security, CSRF, anti-bot, consent
 *                   itself). Cannot be refused per CNIL guidance.
 *  - `analytics`  : Vercel Analytics, Web Vitals beacon, server-side
 *                   anonymised counters.
 *
 * Cookie transport details (used by the app layer):
 *  - Cookie name : `cct.consent.v1`
 *  - Cookie path : `/`
 *  - Max-Age     : 13 months (CNIL guidance, 33_350_000 seconds)
 *  - SameSite    : Lax (no cross-site sharing, but follows top-level nav)
 *  - Secure      : true on `https`
 *  - HttpOnly    : **false** — the client must read it to gate analytics
 *                  before paint. The value carries no secret.
 */

export const CONSENT_COOKIE_NAME = 'cct.consent.v1';

/** 13 months in seconds (CNIL guidance, 33_350_000 s). */
export const CONSENT_MAX_AGE_SEC = 33_350_000;

export type ConsentVersion = 1;
export const CURRENT_CONSENT_VERSION: ConsentVersion = 1;

export interface ConsentState {
  readonly v: ConsentVersion;
  readonly ts: string;
  readonly essential: true;
  readonly analytics: boolean;
}

export interface NoDecision {
  readonly v: ConsentVersion;
  readonly hasDecision: false;
}

export const NO_DECISION: NoDecision = {
  v: CURRENT_CONSENT_VERSION,
  hasDecision: false,
} as const;

export const acceptAll = (now: Date = new Date()): ConsentState => ({
  v: CURRENT_CONSENT_VERSION,
  ts: now.toISOString(),
  essential: true,
  analytics: true,
});

export const rejectAll = (now: Date = new Date()): ConsentState => ({
  v: CURRENT_CONSENT_VERSION,
  ts: now.toISOString(),
  essential: true,
  analytics: false,
});

export const customize = (
  choices: { readonly analytics: boolean },
  now: Date = new Date(),
): ConsentState => ({
  v: CURRENT_CONSENT_VERSION,
  ts: now.toISOString(),
  essential: true,
  analytics: choices.analytics,
});

/**
 * Parse a raw cookie value into a `ConsentState`. Returns `null` on any
 * shape mismatch — caller treats `null` as "no decision yet".
 *
 * Intentionally Zod-free: the helper stays serializable to every Next
 * runtime (edge, node, RSC, middleware) and has zero dependencies.
 */
export function parseConsentCookie(raw: string | undefined | null): ConsentState | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj['v'] !== CURRENT_CONSENT_VERSION) return null;
  if (typeof obj['ts'] !== 'string') return null;
  if (obj['essential'] !== true) return null;
  if (typeof obj['analytics'] !== 'boolean') return null;
  return {
    v: CURRENT_CONSENT_VERSION,
    ts: obj['ts'],
    essential: true,
    analytics: obj['analytics'],
  };
}

export function serializeConsentCookie(state: ConsentState): string {
  return encodeURIComponent(JSON.stringify(state));
}
