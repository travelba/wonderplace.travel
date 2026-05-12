import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { JsonLd } from '@cct/seo';

import { JsonLdScript } from '@/components/seo/json-ld';
import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { listPublishedCities } from '@/server/destinations/cities';

// The page emits a `JsonLdScript` carrying the per-request CSP nonce
// (skill: security-engineering §CSP). Reading `headers()` for that nonce
// forces dynamic rendering; the explicit directive below makes the
// contract grep-able and prevents a future ISR re-enable from silently
// stripping the nonce. See `components/seo/json-ld.tsx` for context.
export const dynamic = 'force-dynamic';

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

function withLocalePrefix(locale: Locale, path: string): string {
  return locale === 'en' ? `/en${path}` : path;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) return {};
  const t = await getTranslations({ locale: raw, namespace: 'destinationPage' });
  return {
    title: t('directory.title'),
    description: t('directory.subtitle', { count: 0 }),
    alternates: {
      canonical: raw === 'fr' ? '/destination' : '/en/destination',
      languages: {
        'fr-FR': '/destination',
        en: '/en/destination',
        'x-default': '/destination',
      },
    },
  };
}

export default async function DestinationDirectoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const t = await getTranslations('destinationPage');
  const cities = await listPublishedCities();
  const origin = siteOrigin();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  const itemListJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.itemListJsonLd({
      name: t('directory.title'),
      items: cities.map((c) => ({
        name: c.name,
        url: `${origin}${withLocalePrefix(locale, `/destination/${c.slug}`)}`,
      })),
    }),
  );

  return (
    <main className="max-w-editorial container mx-auto px-4 py-10 sm:py-14">
      <JsonLdScript data={itemListJsonLd} nonce={nonce} />

      <header className="mb-10">
        <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t('eyebrow')}</p>
        <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">
          {t('directory.title')}
        </h1>
        <p className="text-muted mt-3">{t('directory.subtitle', { count: cities.length })}</p>
      </header>

      {cities.length === 0 ? (
        <p className="text-muted text-sm">{t('empty')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/destination/${c.slug}`}
                className="border-border bg-bg hover:bg-muted/10 flex items-baseline justify-between gap-3 rounded-lg border px-4 py-3"
              >
                <span>
                  <span className="text-fg font-serif text-lg">{c.name}</span>
                  <span className="text-muted ml-2 text-xs">{c.region}</span>
                </span>
                <span className="text-muted text-xs">
                  {t('directory.count', { count: c.count })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
