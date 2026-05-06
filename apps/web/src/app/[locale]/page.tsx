import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

export const revalidate = 3600;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('homepage');
  const tCommon = await getTranslations('common');

  return (
    <main className="container mx-auto flex min-h-[60vh] max-w-editorial flex-col items-start justify-center gap-6 px-4 py-16 sm:py-24">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">
        {tCommon('siteName')} — France
      </p>
      <h1 className="font-serif text-4xl text-fg sm:text-5xl md:text-6xl">{t('title')}</h1>
      <p className="max-w-prose text-lg text-muted sm:text-xl">{t('subtitle')}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="rounded-md border border-border bg-bg px-3 py-1.5">
          {t('trust.iata')}
        </span>
        <span className="rounded-md border border-border bg-bg px-3 py-1.5">
          {t('trust.aspst')}
        </span>
        <span className="rounded-md border border-border bg-bg px-3 py-1.5">
          {t('trust.amadeus')}
        </span>
      </div>

      <p className="mt-12 text-sm text-muted">{t('comingSoon')}</p>
    </main>
  );
}
