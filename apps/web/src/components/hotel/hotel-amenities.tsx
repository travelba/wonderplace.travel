import { getTranslations } from 'next-intl/server';

import { AmenityCategoryIcon } from '@/components/hotel/amenity-category-icon';
import type { LocalisedAmenityGroup } from '@/server/hotels/get-hotel-by-slug';

interface HotelAmenitiesProps {
  readonly locale: 'fr' | 'en';
  readonly groups: readonly LocalisedAmenityGroup[];
  /** Flat list (legacy `readAmenities`) used as fallback when `groups` is empty. */
  readonly flat: readonly string[];
}

/**
 * Amenities section for the hotel detail page — CDC §2 bloc 7.
 *
 * Renders amenities grouped by canonical category (wellness, dining,
 * services, family, …). Empty categories never render — `groups`
 * already filters them out at the reader level.
 *
 * When the row only carries free-form strings (no `key`), the registry
 * cannot categorize them; in that case `flat` is non-empty and `groups`
 * is empty, and we fall back to a single uncategorized chip list.
 *
 * Pure RSC, no client JS. "Premium" amenities (Palace-grade signature
 * services) get a subtle accent treatment.
 */
export async function HotelAmenities({
  locale,
  groups,
  flat,
}: HotelAmenitiesProps): Promise<React.ReactElement> {
  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  if (groups.length === 0) {
    return (
      <section aria-labelledby="amenities-title" className="mb-12">
        <h2 id="amenities-title" className="text-fg mb-3 font-serif text-2xl">
          {t('sections.amenities')}
        </h2>
        {flat.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {flat.map((a) => (
              <li
                key={a}
                className="border-border bg-bg text-fg rounded-md border px-3 py-1.5 text-sm"
              >
                {a}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-sm">{t('noAmenities')}</p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="amenities-title" className="mb-12">
      <h2 id="amenities-title" className="text-fg mb-4 font-serif text-2xl">
        {t('sections.amenities')}
      </h2>
      <div className="grid gap-5 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <h3 className="text-muted flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]">
              <AmenityCategoryIcon
                category={group.category}
                className="text-accent h-3.5 w-3.5 shrink-0"
              />
              <span>{t(`amenityCategories.${group.category}`)}</span>
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {group.entries.map((entry) => (
                <li
                  key={entry.key}
                  className={
                    entry.isPremium
                      ? 'rounded-md border border-amber-200 bg-amber-50/50 px-3 py-1.5 text-sm text-amber-900'
                      : 'border-border bg-bg text-fg rounded-md border px-3 py-1.5 text-sm'
                  }
                >
                  {entry.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
