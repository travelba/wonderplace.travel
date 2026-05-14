import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { JsonLd } from '@cct/seo';

import { JsonLdScript } from '@/components/seo/json-ld';
import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { listPublishedGuides } from '@/server/guides/get-guide-by-slug';

export const dynamic = 'force-dynamic';

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

function withLocalePrefix(locale: Locale, path: string): string {
  return locale === 'en' ? `/en${path}` : path;
}

const T = {
  fr: {
    eyebrow: 'Guides voyage',
    title: 'Nos guides voyage luxe en France',
    subtitle: (n: number) =>
      `${n} guides éditoriaux rédigés par notre équipe : Palaces, art de vivre, gastronomie, saisons idéales et accès — pour Paris, la Côte d'Azur, les Alpes, Bordeaux, Champagne, Provence, Corse et plus encore.`,
    metaTitle: 'Guides voyage luxe en France — ConciergeTravel',
    metaDesc:
      "Découvrez nos guides éditoriaux des plus belles destinations françaises : Paris, Côte d'Azur, Alpes, Bordeaux, Champagne, Provence, Corse. Palaces, art de vivre, conseils saisonniers.",
    scope: {
      city: 'Ville',
      cluster: 'Région',
      region: 'Région',
      country: 'Pays',
    } as const,
  },
  en: {
    eyebrow: 'Travel guides',
    title: 'Our luxury travel guides — France',
    subtitle: (n: number) =>
      `${n} editorial guides written by our team — Palaces, art of living, gastronomy, seasons and access — for Paris, the French Riviera, the Alps, Bordeaux, Champagne, Provence, Corsica and more.`,
    metaTitle: 'Luxury Travel Guides — France | ConciergeTravel',
    metaDesc:
      'Discover our editorial guides to the finest French destinations: Paris, French Riviera, Alps, Bordeaux, Champagne, Provence, Corsica. Palaces, art of living, seasonal advice.',
    scope: {
      city: 'City',
      cluster: 'Region',
      region: 'Region',
      country: 'Country',
    } as const,
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) return {};
  const t = T[raw];
  return {
    title: t.metaTitle,
    description: t.metaDesc,
    alternates: {
      canonical: raw === 'fr' ? '/guides' : '/en/guides',
      languages: {
        'fr-FR': '/guides',
        en: '/en/guides',
        'x-default': '/guides',
      },
    },
    openGraph: {
      title: t.metaTitle,
      description: t.metaDesc,
      type: 'website',
      locale: raw === 'fr' ? 'fr_FR' : 'en_US',
    },
  };
}

export default async function GuidesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const t = T[locale];
  const guides = await listPublishedGuides();
  const origin = siteOrigin();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Group by scope so the index reads like an editorial menu.
  const byScope = new Map<string, typeof guides>();
  for (const g of guides) {
    const list = byScope.get(g.scope) ?? [];
    byScope.set(g.scope, [...list, g]);
  }
  const scopeOrder: ('country' | 'region' | 'cluster' | 'city')[] = [
    'country',
    'region',
    'cluster',
    'city',
  ];

  const itemListJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.itemListJsonLd({
      name: t.title,
      items: guides.map((g) => ({
        name: g.nameFr,
        url: `${origin}${withLocalePrefix(locale, `/guide/${g.slug}`)}`,
      })),
    }),
  );

  const breadcrumbJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.breadcrumbJsonLd([
      {
        name: locale === 'fr' ? 'Accueil' : 'Home',
        url: `${origin}${withLocalePrefix(locale, '/')}`,
      },
      {
        name: locale === 'fr' ? 'Guides' : 'Guides',
        url: `${origin}${withLocalePrefix(locale, '/guides')}`,
      },
    ]),
  );

  return (
    <main className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <JsonLdScript data={breadcrumbJsonLd} nonce={nonce} />
      <JsonLdScript data={itemListJsonLd} nonce={nonce} />

      <header className="mb-10 max-w-3xl">
        <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t.eyebrow}</p>
        <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">{t.title}</h1>
        <p className="text-muted mt-3 text-sm md:text-base">{t.subtitle(guides.length)}</p>
      </header>

      {scopeOrder.map((scope) => {
        const list = byScope.get(scope);
        if (list === undefined || list.length === 0) return null;
        return (
          <section key={scope} className="mb-12">
            <h2 className="text-fg mb-4 font-serif text-xl md:text-2xl">{t.scope[scope]}</h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((g) => {
                const name = locale === 'fr' ? g.nameFr : (g.nameEn ?? g.nameFr);
                const summary = locale === 'fr' ? g.summaryFr : (g.summaryEn ?? g.summaryFr);
                return (
                  <li
                    key={g.slug}
                    className="border-border bg-bg/60 rounded-lg border p-5 transition hover:shadow-md"
                  >
                    <Link href={`/guide/${g.slug}`} className="block">
                      <p className="text-muted mb-1 text-xs uppercase tracking-wide">
                        {t.scope[g.scope]}
                      </p>
                      <h3 className="text-fg font-medium">{name}</h3>
                      <p className="text-muted mt-2 line-clamp-3 text-sm">{summary}</p>
                      <p className="text-fg/70 mt-3 text-xs underline">
                        {locale === 'fr' ? 'Lire le guide →' : 'Read the guide →'}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
