'use client';

import {
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_SEC,
  parseConsentCookie,
  serializeConsentCookie,
  type ConsentState,
} from '@cct/domain/consent';

/**
 * Client-side cookie I/O for the consent banner. Server reads use
 * `next/headers` directly via `getConsentFromCookies`.
 *
 * Why a custom dispatch event ("cct:consent-changed"):
 *   the banner, the "Reopen preferences" link in the footer, and any
 *   analytics gating code may all live in different islands. A custom
 *   event keeps them in sync without a global store.
 */

const COOKIE_EVENT = 'cct:consent-changed' as const;

function readDocumentCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  const parts = document.cookie.split(';');
  for (const raw of parts) {
    const trimmed = raw.trim();
    if (trimmed.startsWith(target)) {
      return trimmed.slice(target.length);
    }
  }
  return null;
}

export function readConsentClient(): ConsentState | null {
  return parseConsentCookie(readDocumentCookie(CONSENT_COOKIE_NAME));
}

export function writeConsentClient(state: ConsentState): void {
  if (typeof document === 'undefined') return;
  const value = serializeConsentCookie(state);
  // `Secure` is opt-in for non-https development; production runs on
  // https so the attribute is automatically appended by the browser
  // when the page is loaded over TLS, but we set it explicitly when we
  // detect a secure origin.
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const segments: string[] = [
    `${CONSENT_COOKIE_NAME}=${value}`,
    `Max-Age=${CONSENT_MAX_AGE_SEC}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (isSecure) segments.push('Secure');
  document.cookie = segments.join('; ');
  // Notify same-page listeners. Cross-tab updates rely on the next page
  // load reading the freshly-written cookie.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COOKIE_EVENT, { detail: state }));
  }
}

export function onConsentChanged(handler: (state: ConsentState) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event): void => {
    const ev = event as CustomEvent<ConsentState>;
    handler(ev.detail);
  };
  window.addEventListener(COOKIE_EVENT, listener);
  return () => window.removeEventListener(COOKIE_EVENT, listener);
}

/**
 * Open the consent banner programmatically — used by the footer
 * "Manage cookies" link and the dedicated `/cookies` page. Fires a
 * `cct:consent-reopen` event; the banner listens and re-mounts the
 * full dialog.
 */
const REOPEN_EVENT = 'cct:consent-reopen' as const;

export function openConsentBanner(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REOPEN_EVENT));
}

export function onConsentReopen(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (): void => handler();
  window.addEventListener(REOPEN_EVENT, listener);
  return () => window.removeEventListener(REOPEN_EVENT, listener);
}
