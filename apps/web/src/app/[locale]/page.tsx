import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

import { JsonLd } from '@cct/seo';

import { JsonLdScript } from '@/components/seo/json-ld';
import { env } from '@/lib/env';

// The page reads `headers()` to forward the per-request CSP nonce to its
// inline JSON-LD scripts (skill: security-engineering §CSP). That dynamic
// API call also marks the page as fully dynamic; the explicit
// `force-dynamic` keeps the contract grep-able. Re-introducing ISR here
// would silently strip the nonce and the strict-dynamic CSP would block
// the structured data — see `components/seo/json-ld.tsx` for the design.
export const dynamic = 'force-dynamic';

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('homepage');
  const tCommon = await getTranslations('common');
  const nonce = (await headers()).get('x-nonce') ?? undefined;

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

  // AEO block (skill: geo-llm-optimization). Short, quotable answer paired
  // with a FAQPage JSON-LD payload so AI Overviews / ChatGPT Search can
  // surface the value-prop verbatim without paraphrasing.
  const aeoQuestion = t('aeo.question');
  const aeoAnswer = t('aeo.answer');
  const homeFaqJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.faqPageJsonLd([{ question: aeoQuestion, answer: aeoAnswer }]),
  );

  return (
    <main className="max-w-editorial container mx-auto flex min-h-[60vh] flex-col items-start justify-center gap-6 px-4 py-16 sm:py-24">
      <JsonLdScript data={agencyJsonLd} nonce={nonce} />
      <JsonLdScript data={homeFaqJsonLd} nonce={nonce} />
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

      <section
        data-aeo
        aria-labelledby="home-aeo-title"
        className="border-border bg-bg mt-10 max-w-prose rounded-lg border p-5"
      >
        <h2 id="home-aeo-title" className="text-fg font-serif text-lg">
          {aeoQuestion}
        </h2>
        <p className="text-muted mt-2 text-sm">{aeoAnswer}</p>
      </section>

      <p className="text-muted mt-12 text-sm">{t('comingSoon')}</p>
    </main>
  );
}
