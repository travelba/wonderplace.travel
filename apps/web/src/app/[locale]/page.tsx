import { getTranslations, setRequestLocale } from 'next-intl/server';

import { JsonLd } from '@cct/seo';

import { env } from '@/lib/env';

export const revalidate = 3600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('homepage');
  const tCommon = await getTranslations('common');

  const siteUrl = (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
  const agencyJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.travelAgencyJsonLd({
      name: 'ConciergeTravel',
      url: locale === 'fr' ? `${siteUrl}/` : `${siteUrl}/${locale}/`,
      description:
        'Agence IATA spécialisée dans les hôtels 5 étoiles et Palaces en France. Tarifs nets GDS, paiement sécurisé Amadeus, programme de fidélité dès la première nuit.',
      iataCode: 'FR',
    }),
  );

  return (
    <main className="max-w-editorial container mx-auto flex min-h-[60vh] flex-col items-start justify-center gap-6 px-4 py-16 sm:py-24">
      <script
        type="application/ld+json"
        // JSON-LD payload is built from typed inputs (no user-controlled HTML).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(agencyJsonLd) }}
      />
      <p className="text-muted text-xs uppercase tracking-[0.18em]">
        {tCommon('siteName')} — France
      </p>
      <h1 className="text-fg font-serif text-4xl sm:text-5xl md:text-6xl">{t('title')}</h1>
      <p className="text-muted max-w-prose text-lg sm:text-xl">{t('subtitle')}</p>

      <div className="text-muted mt-6 flex flex-wrap items-center gap-3 text-xs">
        <span className="border-border bg-bg rounded-md border px-3 py-1.5">{t('trust.iata')}</span>
        <span className="border-border bg-bg rounded-md border px-3 py-1.5">
          {t('trust.aspst')}
        </span>
        <span className="border-border bg-bg rounded-md border px-3 py-1.5">
          {t('trust.amadeus')}
        </span>
      </div>

      <p className="text-muted mt-12 text-sm">{t('comingSoon')}</p>
    </main>
  );
}
