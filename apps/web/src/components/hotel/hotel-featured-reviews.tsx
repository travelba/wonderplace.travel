import { getTranslations } from 'next-intl/server';

import type { LocalisedFeaturedReview } from '@/server/hotels/get-hotel-by-slug';

interface HotelFeaturedReviewsProps {
  readonly locale: 'fr' | 'en';
  readonly reviews: readonly LocalisedFeaturedReview[];
}

/**
 * Editorial featured-review pull-quotes — CDC §2.10 (bloc 10 had a
 * 1/5 score in the gap analysis before this component shipped).
 *
 * Why pull-quotes and not aggregated user reviews?
 * -------------------------------------------------
 *   - We are NOT a Booking-style aggregator: our trust signal comes
 *     from third-party editorial recognition (Forbes Travel Guide,
 *     Condé Nast Traveler, Michelin, Travel + Leisure, …), not from
 *     anonymous guest counts.
 *   - 1-3 attributed quotes carry more weight than 10,000 scraped
 *     reviews for the kind of luxury palace clientele we target.
 *   - LLMs (Perplexity, SearchGPT) extract `<blockquote>` + `<cite>`
 *     fragments with the citation intact — a pure UX + SEO win.
 *
 * Visual contract
 * ---------------
 *   - 1 col mobile → 2 col `md` → 3 col `lg`. Capped at 3 cards
 *     (visual density). Surplus reviews still ship to JSON-LD
 *     (builder caps at 5 there) but are dropped from the UI.
 *   - Each card is a typographic `<blockquote>` with the source as a
 *     `<cite>`, an optional rating chip ("5★/5", "98/100"), and a
 *     date in fine print. The publication name is the dominant
 *     identifier — quote attribution is what matters.
 *   - The block self-elides when `reviews.length === 0`.
 *
 * a11y
 * ----
 *   - Section labelled by `#featured-reviews-title`.
 *   - Quotes wrapped in `<blockquote>` with `cite` attribute pointing
 *     to `sourceUrl` when present (Schema.org HTML signal).
 *   - Rating chip is a text label, not an icon-only star.
 *
 * Skill: structured-data-schema-org, geo-llm-optimization,
 * accessibility.
 */
const MAX_VISIBLE = 3;

export async function HotelFeaturedReviews({
  locale,
  reviews,
}: HotelFeaturedReviewsProps): Promise<React.ReactElement | null> {
  if (reviews.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'hotelPage' });
  const visible = reviews.slice(0, MAX_VISIBLE);

  const dateFormatter = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    year: 'numeric',
    month: 'long',
  });

  return (
    <section aria-labelledby="featured-reviews-title" className="mb-12">
      <h2 id="featured-reviews-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.featuredReviews')}
      </h2>
      <p className="text-muted mb-6 max-w-prose text-sm">{t('featuredReviews.intro')}</p>

      <ul
        aria-label={t('featuredReviews.listAria')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
        role="list"
      >
        {visible.map((review, idx) => {
          const ratingLabel =
            review.rating !== null && review.maxRating !== null
              ? // 5-point scales: display as "5/5"; >5 scales (e.g.
                // Travel + Leisure's "100"): display as "98/100" without
                // implying a star.
                `${review.rating}/${review.maxRating}`
              : null;
          let monthLabel: string | null = null;
          if (review.dateIso !== null) {
            const d = new Date(`${review.dateIso}T00:00:00Z`);
            if (!Number.isNaN(d.getTime())) {
              monthLabel = dateFormatter.format(d);
            }
          }

          return (
            <li key={`${review.source}-${idx}`} className="flex">
              <figure className="border-border bg-bg flex flex-1 flex-col rounded-lg border p-5">
                <blockquote
                  cite={review.sourceUrl ?? undefined}
                  className="text-fg/90 mb-4 flex-1 text-sm leading-relaxed"
                >
                  <span aria-hidden className="text-muted mr-1 select-none">
                    “
                  </span>
                  {review.quote}
                  <span aria-hidden className="text-muted ml-1 select-none">
                    ”
                  </span>
                </blockquote>

                <figcaption className="border-border flex flex-col gap-1 border-t pt-3 text-xs">
                  <cite className="text-fg not-italic">
                    {review.sourceUrl !== null ? (
                      <a
                        href={review.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {review.source}
                      </a>
                    ) : (
                      <span className="font-medium">{review.source}</span>
                    )}
                    {review.author !== null ? (
                      <span className="text-muted"> · {review.author}</span>
                    ) : null}
                  </cite>
                  <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                    {ratingLabel !== null ? (
                      <span
                        aria-label={t('featuredReviews.ratingAria', {
                          value: review.rating ?? 0,
                          max: review.maxRating ?? 0,
                        })}
                        className="border-border text-fg/80 inline-flex items-center rounded-full border px-2 py-0.5 font-medium"
                      >
                        {ratingLabel}
                      </span>
                    ) : null}
                    {monthLabel !== null ? <span>{monthLabel}</span> : null}
                  </div>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
