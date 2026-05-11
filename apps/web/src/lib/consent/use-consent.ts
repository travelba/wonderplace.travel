'use client';

import { useEffect, useState } from 'react';

import type { ConsentState } from '@cct/domain/consent';

import { onConsentChanged, readConsentClient } from './client';

export interface ConsentView {
  /** `true` once the user has made an explicit Accept / Reject / Save decision. */
  readonly hasDecision: boolean;
  /** Per-category booleans — `false` for any category when no decision yet. */
  readonly analytics: boolean;
  /** Always `true` — strictly-necessary cookies cannot be refused. */
  readonly essential: true;
}

const NO_DECISION_VIEW: ConsentView = {
  hasDecision: false,
  analytics: false,
  essential: true,
};

function toView(state: ConsentState | null): ConsentView {
  if (state === null) return NO_DECISION_VIEW;
  return { hasDecision: true, analytics: state.analytics, essential: true };
}

/**
 * Reactive consent state — subscribes to `cct:consent-changed` and
 * re-renders dependent islands when the user updates their choices.
 *
 * Critical guarantees (skill: security-engineering §GDPR):
 *  - SSR-safe: returns `NO_DECISION_VIEW` on the server and during the
 *    first client render so no analytics SDK ever renders until consent
 *    is confirmed.
 *  - Cross-tab updates are picked up on the next mount via the cookie
 *    read (browsers don't broadcast custom events across tabs).
 */
export function useConsent(): ConsentView {
  const [view, setView] = useState<ConsentView>(NO_DECISION_VIEW);

  useEffect(() => {
    // First-paint reconciliation with the persisted cookie.
    setView(toView(readConsentClient()));
    const off = onConsentChanged((state) => setView(toView(state)));
    return off;
  }, []);

  return view;
}
