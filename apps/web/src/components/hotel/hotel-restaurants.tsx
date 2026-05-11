import { getTranslations } from 'next-intl/server';

import type { LocalisedRestaurants } from '@/server/hotels/get-hotel-by-slug';

interface HotelRestaurantsProps {
  readonly locale: 'fr' | 'en';
  readonly restaurants: LocalisedRestaurants;
}

/**
 * F&B venues section for the hotel detail page.
 *
 * Renders a localized list of restaurants/bars with Michelin distinctions,
 * chef credits, opening hours and feature bullets. Source: `hotels.restaurant_info`
 * jsonb, parsed by `readRestaurants` and exposed via `LocalisedRestaurants`.
 *
 * Pure RSC — no client interactivity. Empty `venues` list is filtered upstream
 * (caller renders the section only when at least one venue is available).
 */
export async function HotelRestaurants({
  locale,
  restaurants,
}: HotelRestaurantsProps): Promise<React.ReactElement> {
  const t = await getTranslations({ locale, namespace: 'hotelPage' });
  const venueCount = restaurants.venues.length;
  const totalCount = restaurants.count ?? venueCount;
  const michelinStars = restaurants.michelinStars ?? 0;

  return (
    <section aria-labelledby="restaurants-title" className="mb-12">
      <h2 id="restaurants-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.restaurants')}
      </h2>

      <p className="text-muted mb-6 text-sm">
        {michelinStars > 0
          ? t('restaurants.summaryWithStars', { count: totalCount, stars: michelinStars })
          : t('restaurants.summary', { count: totalCount })}
      </p>

      <ul className="grid gap-4 md:grid-cols-2">
        {restaurants.venues.map((venue) => (
          <li
            key={venue.name}
            className="border-border bg-bg/40 rounded-lg border p-4"
            itemScope
            itemType="https://schema.org/Restaurant"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-fg font-medium" itemProp="name">
                {venue.name}
              </h3>
              {venue.michelinStars !== null && venue.michelinStars > 0 ? (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                  {t('restaurants.michelinBadge', { count: venue.michelinStars })}
                </span>
              ) : null}
            </div>

            {venue.type !== null ? (
              <p className="text-muted mt-1 text-sm" itemProp="servesCuisine">
                {venue.type}
              </p>
            ) : null}

            <dl className="text-fg mt-3 grid gap-1 text-sm">
              {venue.chef !== null ? (
                <div>
                  <dt className="sr-only">{t('restaurants.chef', { name: venue.chef })}</dt>
                  <dd>{t('restaurants.chef', { name: venue.chef })}</dd>
                </div>
              ) : null}
              {venue.pastryChef !== null ? (
                <div>
                  <dt className="sr-only">
                    {t('restaurants.pastryChef', { name: venue.pastryChef })}
                  </dt>
                  <dd>{t('restaurants.pastryChef', { name: venue.pastryChef })}</dd>
                </div>
              ) : null}
              {venue.sommelier !== null ? (
                <div>
                  <dt className="sr-only">
                    {t('restaurants.sommelier', { name: venue.sommelier })}
                  </dt>
                  <dd>{t('restaurants.sommelier', { name: venue.sommelier })}</dd>
                </div>
              ) : null}
              {venue.since !== null ? (
                <div>
                  <dt className="sr-only">{t('restaurants.since', { year: venue.since })}</dt>
                  <dd className="text-muted">{t('restaurants.since', { year: venue.since })}</dd>
                </div>
              ) : null}
              {venue.michelinSince !== null ? (
                <div>
                  <dt className="sr-only">
                    {t('restaurants.michelinSince', { year: venue.michelinSince })}
                  </dt>
                  <dd className="text-muted">
                    {t('restaurants.michelinSince', { year: venue.michelinSince })}
                  </dd>
                </div>
              ) : null}
              {venue.hours !== null ? (
                <div itemProp="openingHours">
                  <dt className="sr-only">{t('restaurants.hours', { value: venue.hours })}</dt>
                  <dd className="text-muted">{t('restaurants.hours', { value: venue.hours })}</dd>
                </div>
              ) : null}
            </dl>

            {venue.features.length > 0 ? (
              <div className="mt-3">
                <p className="text-muted text-xs uppercase tracking-wide">
                  {t('restaurants.featuresLabel')}
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {venue.features.map((f) => (
                    <li key={f} className="border-border bg-bg rounded border px-2 py-0.5 text-xs">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
