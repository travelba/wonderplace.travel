/**
 * Next.js instrumentation entry — server + edge runtimes.
 *
 * Initialises Sentry for nodejs and edge runtimes. If `NEXT_PUBLIC_SENTRY_DSN`
 * is unset (e.g. CI smoke build, local dev without DSN) the SDK stays dormant
 * and `captureException` becomes a no-op — no network calls, no startup cost.
 *
 * Skill: observability-monitoring + security-engineering (no PII).
 */
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];
  if (!dsn || dsn.length === 0) return;

  const environment = process.env['SENTRY_ENV'] ?? process.env['NODE_ENV'] ?? 'dev';
  const release = process.env['SENTRY_RELEASE'];
  const isProd = environment === 'production';
  const releaseField = release !== undefined ? { release } : {};

  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    Sentry.init({
      dsn,
      environment,
      ...releaseField,
      // Conservative sampling in prod, full in dev/preview/staging.
      tracesSampleRate: isProd ? 0.1 : 1.0,
      profilesSampleRate: 0,
      sendDefaultPii: false,
    });
    return;
  }

  if (process.env['NEXT_RUNTIME'] === 'edge') {
    Sentry.init({
      dsn,
      environment,
      ...releaseField,
      tracesSampleRate: isProd ? 0.05 : 1.0,
      sendDefaultPii: false,
    });
  }
}

// Captures route-handler errors that bubble out of App Router handlers.
export const onRequestError = Sentry.captureRequestError;
