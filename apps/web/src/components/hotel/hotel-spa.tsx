import { getTranslations } from 'next-intl/server';

import type { LocalisedSpa } from '@/server/hotels/get-hotel-by-slug';

interface HotelSpaProps {
  readonly locale: 'fr' | 'en';
  readonly spa: LocalisedSpa;
}

/**
 * Spa/wellness section for the hotel detail page.
 *
 * Renders the spa name, surface area, number of treatment rooms and a
 * localized feature list. Source: `hotels.spa_info` jsonb, parsed by
 * `readSpa` and exposed via `LocalisedSpa`. Pure RSC.
 */
export async function HotelSpa({ locale, spa }: HotelSpaProps): Promise<React.ReactElement> {
  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  return (
    <section
      aria-labelledby="spa-title"
      className="mb-12"
      itemScope
      itemType="https://schema.org/HealthClub"
    >
      <h2 id="spa-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.spa')}
      </h2>

      <div className="border-border bg-bg/40 rounded-lg border p-5">
        <h3 className="text-fg text-lg font-medium" itemProp="name">
          {spa.name}
        </h3>

        {spa.surfaceSqm !== null || spa.treatmentRooms !== null ? (
          <ul className="text-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {spa.surfaceSqm !== null ? (
              <li>{t('spa.surface', { value: spa.surfaceSqm })}</li>
            ) : null}
            {spa.treatmentRooms !== null ? (
              <li>{t('spa.treatmentRooms', { count: spa.treatmentRooms })}</li>
            ) : null}
          </ul>
        ) : null}

        {spa.features.length > 0 ? (
          <div className="mt-4">
            <p className="text-muted text-xs uppercase tracking-wide">{t('spa.featuresLabel')}</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {spa.features.map((feature) => (
                <li
                  key={feature}
                  className="text-fg before:text-muted relative pl-4 text-sm before:absolute before:left-0 before:content-['•']"
                >
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
