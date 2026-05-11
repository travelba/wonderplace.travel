'use client';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ReactElement } from 'react';

import { useConsent } from '@/lib/consent/use-consent';

/**
 * Consent-gated analytics for the public site (skill:
 * security-engineering §GDPR + observability-monitoring).
 *
 * Renders @vercel/analytics + @vercel/speed-insights **only** when the
 * user has actively granted `analytics` consent (CNIL: opt-in, not opt-out).
 * Until then, returns `null` — the SDKs are never loaded, no beacons fire.
 *
 * The user's decision is reactive: if they later open the banner and
 * disable analytics, the wrapper unmounts and the SDKs stop reporting.
 */
export function ConditionalAnalytics(): ReactElement | null {
  const consent = useConsent();
  if (!consent.hasDecision || !consent.analytics) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
