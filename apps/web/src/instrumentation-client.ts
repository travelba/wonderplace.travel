/**
 * Sentry client init (Next.js 15 + Sentry v8 `instrumentation-client.ts`).
 *
 * Loaded automatically by Next.js on the browser. When the DSN is unset, the
 * SDK stays dormant. `replayIntegration` masks all text + media to honor the
 * consent contract — analytics (and replays) only become useful once the user
 * has accepted analytics in the cookie banner; the gating still has to happen
 * here at the SDK level (sample rates) because dynamic enable/disable would
 * fight the consent reactivity.
 *
 * Skill: observability-monitoring + security-engineering (GDPR/CNIL).
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (dsn && dsn.length > 0) {
  const isProd = process.env['NODE_ENV'] === 'production';
  Sentry.init({
    dsn,
    environment: isProd ? 'production' : 'dev',
    tracesSampleRate: isProd ? 0.1 : 1.0,
    // Replay only on errors, and never the full session, to limit beacon
    // volume + storage. Masks text/media by default — never capture PII.
    replaysOnErrorSampleRate: isProd ? 1.0 : 0.0,
    replaysSessionSampleRate: 0,
    sendDefaultPii: false,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
  });
}
