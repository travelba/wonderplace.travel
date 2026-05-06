'use client';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Sentry capture is wired via @sentry/nextjs instrumentation in Phase 10.
    if (process.env.NODE_ENV !== 'production') console.error(error);
  }, [error]);

  return (
    <main className="container mx-auto flex min-h-[50vh] max-w-prose flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">500</p>
      <h1 className="font-serif text-4xl text-fg">{t('errorTitle')}</h1>
      <p className="text-muted">{t('errorDescription')}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex h-11 min-h-[44px] items-center gap-2 rounded-md bg-fg px-5 text-sm font-medium text-bg hover:bg-fg/90"
      >
        {t('tryAgain')}
      </button>
    </main>
  );
}
