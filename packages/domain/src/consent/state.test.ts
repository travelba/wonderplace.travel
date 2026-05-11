import { describe, expect, it } from 'vitest';

import {
  CONSENT_COOKIE_NAME,
  CURRENT_CONSENT_VERSION,
  acceptAll,
  customize,
  parseConsentCookie,
  rejectAll,
  serializeConsentCookie,
} from './state';

const NOW = new Date('2026-05-11T12:34:56.000Z');

describe('consent — builders', () => {
  it('acceptAll opts in to every category', () => {
    const s = acceptAll(NOW);
    expect(s).toEqual({
      v: 1,
      ts: NOW.toISOString(),
      essential: true,
      analytics: true,
    });
  });

  it('rejectAll keeps essential on but disables analytics (CNIL: cannot refuse essential)', () => {
    const s = rejectAll(NOW);
    expect(s.essential).toBe(true);
    expect(s.analytics).toBe(false);
  });

  it('customize honours granular choices', () => {
    expect(customize({ analytics: true }, NOW).analytics).toBe(true);
    expect(customize({ analytics: false }, NOW).analytics).toBe(false);
  });
});

describe('consent — parse / serialize round-trip', () => {
  it('round-trips an accept-all state', () => {
    const original = acceptAll(NOW);
    const restored = parseConsentCookie(serializeConsentCookie(original));
    expect(restored).toEqual(original);
  });

  it('rejects malformed JSON', () => {
    expect(parseConsentCookie('garbage')).toBeNull();
    expect(parseConsentCookie('')).toBeNull();
    expect(parseConsentCookie(null)).toBeNull();
    expect(parseConsentCookie(undefined)).toBeNull();
  });

  it('rejects stale versions (forces re-consent on schema change)', () => {
    const raw = encodeURIComponent(
      JSON.stringify({ v: 0, ts: NOW.toISOString(), essential: true, analytics: true }),
    );
    expect(parseConsentCookie(raw)).toBeNull();
  });

  it('rejects payloads with essential ≠ true (anti-tampering)', () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        v: CURRENT_CONSENT_VERSION,
        ts: NOW.toISOString(),
        essential: false,
        analytics: true,
      }),
    );
    expect(parseConsentCookie(raw)).toBeNull();
  });

  it('rejects payloads with non-boolean analytics', () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        v: CURRENT_CONSENT_VERSION,
        ts: NOW.toISOString(),
        essential: true,
        analytics: 'yes',
      }),
    );
    expect(parseConsentCookie(raw)).toBeNull();
  });
});

describe('consent — transport invariants', () => {
  it('exposes a stable, namespaced cookie name', () => {
    expect(CONSENT_COOKIE_NAME).toBe('cct.consent.v1');
  });
});
