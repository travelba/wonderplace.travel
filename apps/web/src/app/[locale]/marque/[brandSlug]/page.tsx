import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { JsonLd } from '@cct/seo';

import { JsonLdScript } from '@/components/seo/json-ld';
import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { listPublishedHotelsForIndex } from '@/server/hotels/get-hotel-by-slug';
import { detectBrand, KNOWN_BRANDS } from '@/server/hotels/get-related-hotels';

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
    eyebrow: 'Groupe hôtelier',
    titleSuffix: 'en France',
    subtitle: (brand: string, n: number) =>
      `Les ${n} adresses ${brand} de notre catalogue éditorial — sélection IATA ConciergeTravel.`,
    palace: 'Palace',
    stars: '★',
    seeFiche: 'Voir la fiche',
    breadcrumbHome: 'Accueil',
    breadcrumbHotels: 'Hôtels',
    metaTitle: (brand: string) => `${brand} en France — Hôtels & Palaces | ConciergeTravel`,
    metaDesc: (brand: string, n: number) =>
      `Découvrez les ${n} adresses ${brand} de notre sélection éditoriale : Palaces, hôtels 5 étoiles. Réservation IATA, tarifs nets GDS.`,
  },
  en: {
    eyebrow: 'Hotel group',
    titleSuffix: 'in France',
    subtitle: (brand: string, n: number) =>
      `The ${n} ${brand} addresses from our editorial catalog — ConciergeTravel IATA selection.`,
    palace: 'Palace',
    stars: '★',
    seeFiche: 'View the page',
    breadcrumbHome: 'Home',
    breadcrumbHotels: 'Hotels',
    metaTitle: (brand: string) => `${brand} in France — Hotels & Palaces | ConciergeTravel`,
    metaDesc: (brand: string, n: number) =>
      `Discover the ${n} ${brand} addresses from our editorial selection: Palaces, 5-star hotels. IATA booking, GDS net rates.`,
  },
} as const;

export async function generateStaticParams(): Promise<{ brandSlug: string }[]> {
  return KNOWN_BRANDS.map((b) => ({ brandSlug: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; brandSlug: string }>;
}): Promise<Metadata> {
  const { locale: raw, brandSlug } = await params;
  if (!isRoutingLocale(raw)) return {};
  const brand = KNOWN_BRANDS.find((b) => b.slug === brandSlug);
  if (brand === undefined) return {};

  const hotels = await listPublishedHotelsForIndex();
  const count = hotels.filter((h) => detectBrand(h.nameFr)?.slug === brand.slug).length;
  const t = T[raw];

  return {
    title: t.metaTitle(brand.label),
    description: t.metaDesc(brand.label, count),
    alternates: {
      canonical: raw === 'fr' ? `/marque/${brand.slug}` : `/en/marque/${brand.slug}`,
      languages: {
        'fr-FR': `/marque/${brand.slug}`,
        en: `/en/marque/${brand.slug}`,
        'x-default': `/marque/${brand.slug}`,
      },
    },
    openGraph: {
      title: t.metaTitle(brand.label),
      description: t.metaDesc(brand.label, count),
      type: 'website',
      locale: raw === 'fr' ? 'fr_FR' : 'en_US',
    },
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ locale: string; brandSlug: string }>;
}) {
  const { locale: raw, brandSlug } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const brand = KNOWN_BRANDS.find((b) => b.slug === brandSlug);
  if (brand === undefined) notFound();

  const locale = raw;
  setRequestLocale(locale);

  const allHotels = await listPublishedHotelsForIndex();
  const hotels = allHotels.filter((h) => detectBrand(h.nameFr)?.slug === brand.slug);
  if (hotels.length === 0) notFound();

  const t = T[locale];
  const origin = siteOrigin();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // ── BreadcrumbList JSON-LD ───────────────────────────────────────────
  const breadcrumbJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.breadcrumbJsonLd([
      { name: t.breadcrumbHome, url: `${origin}${withLocalePrefix(locale, '/')}` },
      { name: t.breadcrumbHotels, url: `${origin}${withLocalePrefix(locale, '/hotels')}` },
      {
        name: brand.label,
        url: `${origin}${withLocalePrefix(locale, `/marque/${brand.slug}`)}`,
      },
    ]),
  );

  // ── ItemList JSON-LD (the brand's catalog) ───────────────────────────
  const itemListJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.itemListJsonLd({
      name: `${brand.label} ${t.titleSuffix}`,
      items: hotels.map((h) => ({
        name: h.nameFr,
        url: `${origin}${withLocalePrefix(locale, `/hotel/${h.slugFr}`)}`,
        hotel: { starRating: h.stars as 1 | 2 | 3 | 4 | 5 },
      })),
    }),
  );

  return (
    <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-14">
      <JsonLdScript data={breadcrumbJsonLd} nonce={nonce} />
      <JsonLdScript data={itemListJsonLd} nonce={nonce} />

      {/* Breadcrumb visible — additional internal-link signal */}
      <nav aria-label="breadcrumb" className="text-muted mb-6 text-xs">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:underline">
              {t.breadcrumbHome}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link href="/hotels" className="hover:underline">
              {t.breadcrumbHotels}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li className="text-fg" aria-current="page">
            {brand.label}
          </li>
        </ol>
      </nav>

      <header className="mb-10 max-w-3xl">
        <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t.eyebrow}</p>
        <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">
          {brand.label} {t.titleSuffix}
        </h1>
        <p className="text-muted mt-3 text-sm md:text-base">
          {t.subtitle(brand.label, hotels.length)}
        </p>
      </header>

      <ul role="list" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {hotels.map((h) => {
          const slug = locale === 'en' && h.slugEn !== null ? h.slugEn : h.slugFr;
          const href = locale === 'en' ? `/en/hotel/${slug}` : `/hotel/${slug}`;
          const name = locale === 'en' && h.nameEn !== null ? h.nameEn : h.nameFr;
          const descSource =
            locale === 'en' && h.descriptionEn !== null ? h.descriptionEn : h.descriptionFr;
          const desc =
            descSource !== null && descSource.length > 200
              ? `${descSource.slice(0, 197).trimEnd()}…`
              : descSource;
          return (
            <li key={h.slugFr}>
              <Link
                href={href}
                prefetch={false}
                className="border-border bg-bg group block h-full rounded-lg border p-5 transition hover:border-amber-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-amber-700">
                    {h.isPalace ? t.palace : `${h.stars}${t.stars}`}
                  </span>
                  <span className="text-muted text-xs">{h.city}</span>
                </div>
                <h2 className="text-fg mb-2 font-serif text-lg group-hover:text-amber-700 md:text-xl">
                  {name}
                </h2>
                {desc !== null ? <p className="text-muted line-clamp-4 text-sm">{desc}</p> : null}
                <span className="mt-3 inline-block text-xs font-medium text-amber-700 underline-offset-2 group-hover:underline">
                  {t.seeFiche} →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
