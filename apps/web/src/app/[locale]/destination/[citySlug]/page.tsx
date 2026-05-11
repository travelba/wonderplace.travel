import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { JsonLd } from '@cct/seo';

import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { getDestinationBySlug, listPublishedCities } from '@/server/destinations/cities';
import { getAmadeusAggregateRatingsBatch } from '@/server/hotels/get-amadeus-sentiments-batch';

/**
 * Mirrors the hotel detail page: the shared layout reads cookies (auth
 * area in the header) so ISR + dynamic-API cohabitation triggers
 * `DYNAMIC_SERVER_USAGE`. Until the layout's auth read is moved to a
 * client island we render destination hubs dynamically — the upstream
 * CDN still caches them.
 */
export const dynamic = 'force-dynamic';

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

function withLocalePrefix(locale: Locale, path: string): string {
  return locale === 'en' ? `/en${path}` : path;
}

/**
 * Type guard that narrows a generic integer `stars` field (the
 * Supabase schema allows the full int range) to the `1..5` literal
 * union expected by the SEO `Hotel`/`ListItem` builders. Anything
 * outside the range yields `null` so the caller falls back to a
 * starRating-less item rather than crashing or emitting bogus JSON-LD.
 */
function narrowStars(value: number): 1 | 2 | 3 | 4 | 5 | null {
  switch (value) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return value;
    default:
      return null;
  }
}

export async function generateStaticParams(): Promise<Array<{ locale: string; citySlug: string }>> {
  try {
    const cities = await listPublishedCities();
    const params: Array<{ locale: string; citySlug: string }> = [];
    for (const c of cities) {
      params.push({ locale: 'fr', citySlug: c.slug });
      params.push({ locale: 'en', citySlug: c.slug });
    }
    return params;
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; citySlug: string }>;
}): Promise<Metadata> {
  const { locale: raw, citySlug } = await params;
  if (!isRoutingLocale(raw)) return {};
  const locale = raw;
  const t = await getTranslations({ locale, namespace: 'destinationPage' });

  const destination = await getDestinationBySlug(citySlug, locale);
  if (destination === null) return { robots: { index: false, follow: false } };

  const title = t('meta.title', { city: destination.name });
  const description = t('meta.description', { city: destination.name, region: destination.region });
  const canonical = locale === 'fr' ? `/destination/${citySlug}` : `/en/destination/${citySlug}`;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        'fr-FR': `/destination/${citySlug}`,
        en: `/en/destination/${citySlug}`,
        'x-default': `/destination/${citySlug}`,
      },
    },
    openGraph: {
      type: 'website',
      title,
      description,
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
      siteName: 'ConciergeTravel',
    },
  };
}

export default async function DestinationHubPage({
  params,
}: {
  params: Promise<{ locale: string; citySlug: string }>;
}) {
  const { locale: raw, citySlug } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const destination = await getDestinationBySlug(citySlug, locale);
  if (destination === null) notFound();

  // Fetch Amadeus ratings for every hotel in the city in a single
  // batched request (chunked internally if >20 — see helper). The
  // helper is fully forgiving, so an empty map means "no ratings to
  // show" and the cards render without the rating chip.
  const [t, ratingsByAmadeusId] = await Promise.all([
    getTranslations('destinationPage'),
    getAmadeusAggregateRatingsBatch(destination.hotels.map((h) => h.amadeusHotelId)),
  ]);
  const origin = siteOrigin();
  const pageUrl = `${origin}${withLocalePrefix(locale, `/destination/${citySlug}`)}`;

  const itemListJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.itemListJsonLd({
      name: t('meta.title', { city: destination.name }),
      items: destination.hotels.map((h) => {
        const rating =
          h.amadeusHotelId !== null ? (ratingsByAmadeusId.get(h.amadeusHotelId) ?? null) : null;
        // Only upgrade to a `Hotel`-nested ListItem when we have a
        // publishable rating; otherwise keep the lean navigational
        // shape so we don't dilute the structured-data signal.
        const stars = narrowStars(h.stars);
        return {
          name: h.name,
          url: `${origin}${withLocalePrefix(locale, `/hotel/${locale === 'en' ? h.slugEn : h.slug}`)}`,
          ...(rating !== null
            ? {
                hotel: {
                  ...(stars !== null ? { starRating: stars } : {}),
                  aggregateRating: {
                    ratingValue: rating.ratingValue,
                    reviewCount: rating.reviewCount,
                    bestRating: rating.bestRating,
                    worstRating: rating.worstRating,
                  },
                },
              }
            : {}),
        };
      }),
    }),
  );

  const breadcrumbJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.breadcrumbJsonLd([
      { name: t('breadcrumb.home'), url: `${origin}${withLocalePrefix(locale, '/')}` },
      {
        name: t('breadcrumb.hotels'),
        url: `${origin}${withLocalePrefix(locale, '/recherche')}`,
      },
      { name: destination.name, url: pageUrl },
    ]),
  );

  // AEO block — short, visible, quotable answer paired with FAQPage JSON-LD.
  const today = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    dateStyle: 'long',
  }).format(new Date());
  const count = destination.hotels.length;
  const aeoAnswer = t(count === 1 ? 'aeo.answerSingular' : 'aeo.answerPlural', {
    count,
    city: destination.name,
    region: destination.region,
    date: today,
  });
  const aeoQuestion = t('aeo.question', { city: destination.name });
  const faqJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.faqPageJsonLd([{ question: aeoQuestion, answer: aeoAnswer }]),
  );

  return (
    <main className="max-w-editorial container mx-auto px-4 py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <nav aria-label={t('breadcrumb.hotels')} className="text-muted mb-6 text-xs">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:underline">
              {t('breadcrumb.home')}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link href="/recherche" className="hover:underline">
              {t('breadcrumb.hotels')}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li className="text-fg" aria-current="page">
            {destination.name}
          </li>
        </ol>
      </nav>

      <header className="mb-10">
        <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t('eyebrow')}</p>
        <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">
          {t('title', { city: destination.name })}
        </h1>
        <p className="text-muted mt-3 text-lg sm:text-xl">
          {t('subtitle', { count, city: destination.name, region: destination.region })}
        </p>
      </header>

      <section
        data-aeo
        aria-labelledby="aeo-title"
        className="border-border bg-bg mb-12 rounded-lg border p-5"
      >
        <h2 id="aeo-title" className="text-fg font-serif text-lg">
          {aeoQuestion}
        </h2>
        <p className="text-muted mt-2 text-sm">{aeoAnswer}</p>
      </section>

      {destination.hotels.length === 0 ? (
        <p className="text-muted text-sm">{t('empty')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {destination.hotels.map((hotel) => {
            const slugForLocale = locale === 'en' ? hotel.slugEn : hotel.slug;
            const rating =
              hotel.amadeusHotelId !== null
                ? (ratingsByAmadeusId.get(hotel.amadeusHotelId) ?? null)
                : null;
            return (
              <li key={hotel.id}>
                <article className="border-border bg-bg flex h-full flex-col rounded-lg border p-5">
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-fg font-serif text-xl">
                      <Link href={`/hotel/${slugForLocale}`} className="hover:underline">
                        {hotel.name}
                      </Link>
                    </h2>
                    <p className="text-muted text-xs">
                      {hotel.isPalace ? t('card.palace') : t('card.stars', { count: hotel.stars })}
                    </p>
                  </header>
                  {hotel.district !== null && hotel.district.length > 0 ? (
                    <p className="text-muted mt-1 text-xs uppercase tracking-[0.14em]">
                      {hotel.district}
                    </p>
                  ) : null}
                  {rating !== null ? (
                    <p
                      className="text-fg mt-2 inline-flex items-center gap-1.5 text-xs"
                      data-testid="destination-card-rating"
                      aria-label={t('card.ratingAria', {
                        value: rating.ratingValue.toFixed(1),
                        best: rating.bestRating,
                        count: rating.reviewCount,
                      })}
                    >
                      <span aria-hidden>★</span>
                      <span className="font-medium tabular-nums">
                        {t('card.ratingScore', {
                          value: rating.ratingValue.toFixed(1),
                          best: rating.bestRating,
                        })}
                      </span>
                      <span className="text-muted">
                        {t('card.ratingReviews', { count: rating.reviewCount })}
                      </span>
                    </p>
                  ) : null}
                  {hotel.excerpt.length > 0 ? (
                    <p className="text-muted mt-3 text-sm">{hotel.excerpt}</p>
                  ) : null}
                  <p className="mt-4">
                    <Link
                      href={`/hotel/${slugForLocale}`}
                      className="text-fg text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {t('card.viewHotel')} →
                    </Link>
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
