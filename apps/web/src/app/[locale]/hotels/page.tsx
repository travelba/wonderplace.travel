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

// CSP nonce read forces dynamic rendering — same contract as the
// destination directory. Catalog stays edge-cached at the CDN layer.
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
    eyebrow: 'Catalogue éditorial',
    title: 'Hôtels 5★ et Palaces en France',
    subtitle: (n: number) =>
      `${n} adresses éditorialement sélectionnées par notre conciergerie : Palaces parisiens, retraites alpines, refuges Côte d'Azur, vignobles bordelais et villas de Provence.`,
    sectionByRegion: 'Par région',
    sectionByBrand: 'Par groupe hôtelier',
    palace: 'Palace',
    stars: '★',
    count: (n: number) => (n === 1 ? '1 adresse' : `${n} adresses`),
    seeFiche: 'Voir la fiche',
    metaTitle: 'Hôtels 5★ et Palaces en France — Sélection ConciergeTravel',
    metaDesc:
      "Découvrez notre sélection éditoriale d'hôtels 5 étoiles et Palaces en France : Paris, Côte d'Azur, Alpes, Provence, Aquitaine. Réservation IATA, tarifs nets GDS.",
  },
  en: {
    eyebrow: 'Editorial catalog',
    title: '5★ Hotels and Palaces in France',
    subtitle: (n: number) =>
      `${n} addresses curated by our concierge desk: Parisian Palaces, alpine retreats, Riviera havens, Bordeaux vineyards and Provence villas.`,
    sectionByRegion: 'By region',
    sectionByBrand: 'By hotel group',
    palace: 'Palace',
    stars: '★',
    count: (n: number) => (n === 1 ? '1 address' : `${n} addresses`),
    seeFiche: 'View the page',
    metaTitle: '5★ Hotels and Palaces in France — ConciergeTravel Selection',
    metaDesc:
      'Discover our editorial selection of 5-star hotels and Palaces in France: Paris, French Riviera, Alps, Provence, Aquitaine. IATA booking, GDS net rates.',
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
      canonical: raw === 'fr' ? '/hotels' : '/en/hotels',
      languages: {
        'fr-FR': '/hotels',
        en: '/en/hotels',
        'x-default': '/hotels',
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

export default async function HotelsIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const t = T[locale];
  const hotels = await listPublishedHotelsForIndex();
  const origin = siteOrigin();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // ── Cluster by region for the visual layout ──────────────────────────
  const byRegion = new Map<string, typeof hotels>();
  for (const h of hotels) {
    const cur = byRegion.get(h.region) ?? [];
    byRegion.set(h.region, [...cur, h]);
  }
  const regionsOrdered = [...byRegion.entries()].sort((a, b) => b[1].length - a[1].length);

  // ── Cluster by brand for the secondary navigation strip ──────────────
  const brandCounts = new Map<string, { label: string; count: number }>();
  for (const h of hotels) {
    const brand = detectBrand(h.nameFr);
    if (brand === null) continue;
    const cur = brandCounts.get(brand.slug);
    brandCounts.set(brand.slug, { label: brand.label, count: (cur?.count ?? 0) + 1 });
  }
  // Only surface brands with ≥ 2 properties (a single fiche doesn't justify
  // a dedicated landing page — that's what `<RelatedHotels />` is for).
  const brandsWithEntries = KNOWN_BRANDS.filter((b) => (brandCounts.get(b.slug)?.count ?? 0) >= 2);

  // ── ItemList JSON-LD (full catalog) ──────────────────────────────────
  // Rich `Hotel` ListItem variant for the first 30 entries — surfaces
  // starRating + the Palace marker in the carousel rich result.
  const itemListJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.itemListJsonLd({
      name: t.title,
      items: hotels.map((h) => ({
        name: h.nameFr,
        url: `${origin}${withLocalePrefix(locale, `/hotel/${h.slugFr}`)}`,
        hotel: { starRating: h.stars as 1 | 2 | 3 | 4 | 5 },
      })),
    }),
  );

  return (
    <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-14">
      <JsonLdScript data={itemListJsonLd} nonce={nonce} />

      <header className="mb-10 max-w-3xl">
        <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t.eyebrow}</p>
        <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">{t.title}</h1>
        <p className="text-muted mt-3 text-sm md:text-base">{t.subtitle(hotels.length)}</p>
      </header>

      {/* Internal anchor strip — region + brand jump-to (boosts maillage interne) */}
      {regionsOrdered.length > 0 ? (
        <nav
          aria-label={t.sectionByRegion}
          className="border-border mb-10 flex flex-wrap items-center gap-2 border-y py-3"
        >
          <span className="text-muted text-xs font-semibold uppercase tracking-wide">
            {t.sectionByRegion} :
          </span>
          {regionsOrdered.map(([region, list]) => (
            <a
              key={region}
              href={`#region-${encodeURIComponent(region)}`}
              className="border-border bg-bg hover:bg-muted/10 rounded-full border px-3 py-1 text-xs"
            >
              {region}
              <span className="text-muted ml-1.5">({list.length})</span>
            </a>
          ))}
        </nav>
      ) : null}

      {/* Brand collections — strong internal linking signal */}
      {brandsWithEntries.length > 0 ? (
        <nav
          aria-label={t.sectionByBrand}
          className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {brandsWithEntries.map((b) => {
            const info = brandCounts.get(b.slug);
            return (
              <Link
                key={b.slug}
                href={`/marque/${b.slug}`}
                className="border-border bg-bg hover:bg-muted/10 rounded-lg border px-4 py-3"
                prefetch={false}
              >
                <span className="text-fg block font-medium">{b.label}</span>
                <span className="text-muted text-xs">{t.count(info?.count ?? 0)}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {/* Region clusters */}
      {regionsOrdered.map(([region, list]) => (
        <section
          key={region}
          id={`region-${encodeURIComponent(region)}`}
          aria-labelledby={`region-${encodeURIComponent(region)}-title`}
          className="mb-14 scroll-mt-24"
        >
          <header className="mb-6 flex items-baseline justify-between">
            <h2
              id={`region-${encodeURIComponent(region)}-title`}
              className="text-fg font-serif text-2xl md:text-3xl"
            >
              {region}
            </h2>
            <span className="text-muted text-sm">{t.count(list.length)}</span>
          </header>

          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((h) => {
              const slug = locale === 'en' && h.slugEn !== null ? h.slugEn : h.slugFr;
              const href = locale === 'en' ? `/en/hotel/${slug}` : `/hotel/${slug}`;
              const name = locale === 'en' && h.nameEn !== null ? h.nameEn : h.nameFr;
              const descSource =
                locale === 'en' && h.descriptionEn !== null ? h.descriptionEn : h.descriptionFr;
              const desc =
                descSource !== null && descSource.length > 160
                  ? `${descSource.slice(0, 157).trimEnd()}…`
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
                    <h3 className="text-fg mb-2 font-serif text-lg group-hover:text-amber-700 md:text-xl">
                      {name}
                    </h3>
                    {desc !== null ? (
                      <p className="text-muted line-clamp-3 text-sm">{desc}</p>
                    ) : null}
                    <span className="mt-3 inline-block text-xs font-medium text-amber-700 underline-offset-2 group-hover:underline">
                      {t.seeFiche} →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
