'use client';

/**
 * Last-resort error boundary — catches errors thrown above any locale
 * `error.tsx` (e.g. inside the root layout itself). Forwarded to Sentry
 * so we never lose a production crash silently.
 *
 * Must define its own `<html>` + `<body>` per Next.js contract.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect, type ReactElement } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}): ReactElement {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: '4rem 1.5rem',
          color: '#1c1c1c',
          background: '#fafaf8',
          minHeight: '100vh',
        }}
      >
        <main style={{ maxWidth: '40rem', margin: '0 auto' }}>
          <p
            style={{
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontSize: '0.75rem',
              color: '#6b6b6b',
            }}
          >
            500
          </p>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2.25rem', marginTop: '0.5rem' }}>
            Une erreur inattendue est survenue.
          </h1>
          <p style={{ color: '#6b6b6b', marginTop: '1rem' }}>
            Nous avons été notifiés. Merci de réessayer dans quelques instants.
          </p>
        </main>
      </body>
    </html>
  );
}
