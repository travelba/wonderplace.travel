'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    Sentry.captureException(error);
    if (process.env.NODE_ENV !== 'production') console.error(error);
  }, [error]);

  return (
    <main className="container mx-auto flex min-h-[50vh] max-w-prose flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-muted text-xs uppercase tracking-[0.18em]">500</p>
      <h1 className="text-fg font-serif text-4xl">{t('errorTitle')}</h1>
      <p className="text-muted">{t('errorDescription')}</p>
      <button
        type="button"
        onClick={reset}
        className="bg-fg text-bg hover:bg-fg/90 mt-4 inline-flex h-11 min-h-[44px] items-center gap-2 rounded-md px-5 text-sm font-medium"
      >
        {t('tryAgain')}
      </button>
    </main>
  );
}
