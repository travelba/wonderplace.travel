/**
 * Next.js instrumentation entry — server + edge runtimes.
 *
 * Initialises Sentry for nodejs and edge runtimes. If `NEXT_PUBLIC_SENTRY_DSN`
 * is unset (e.g. CI smoke build, local dev without DSN) the SDK stays dormant
 * and `captureException` becomes a no-op — no network calls, no startup cost.
 *
 * Sentry is loaded via dynamic `import()` so the edge bundle is not forced to
 * include the SDK when the DSN is missing. This avoids the Next.js 15 dev
 * `Code generation from strings disallowed` crash inside the edge runtime
 * (caused by webpack inlining `eval`-based source maps when Sentry is bundled).
 *
 * Skill: observability-monitoring + security-engineering (no PII).
 */

export async function register(): Promise<void> {
  const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];
  if (!dsn || dsn.length === 0) return;

  const environment = process.env['SENTRY_ENV'] ?? process.env['NODE_ENV'] ?? 'dev';
  const release = process.env['SENTRY_RELEASE'];
  const isProd = environment === 'production';
  const releaseField = release !== undefined ? { release } : {};

  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      environment,
      ...releaseField,
      tracesSampleRate: isProd ? 0.1 : 1.0,
      profilesSampleRate: 0,
      sendDefaultPii: false,
    });
    return;
  }

  if (process.env['NEXT_RUNTIME'] === 'edge') {
    const Sentry = await import('@sentry/nextjs');
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
// Sentry is dynamically imported so the edge bundle remains SDK-free unless
// a DSN is present and an error actually fires.
export async function onRequestError(
  error: unknown,
  request: unknown,
  context: unknown,
): Promise<void> {
  const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];
  if (!dsn || dsn.length === 0) return;
  const Sentry = await import('@sentry/nextjs');
  const capture = Sentry.captureRequestError as (
    e: unknown,
    r: unknown,
    c: unknown,
  ) => void | Promise<void>;
  await capture(error, request, context);
}
