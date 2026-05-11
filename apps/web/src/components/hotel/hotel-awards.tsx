import { getTranslations } from 'next-intl/server';

import type { LocalisedAward } from '@/server/hotels/get-hotel-by-slug';

interface HotelAwardsProps {
  readonly locale: 'fr' | 'en';
  readonly awards: readonly LocalisedAward[];
}

/**
 * Awards & distinctions section for the hotel detail page — CDC §2 bloc 11.
 *
 * Renders a sober text-only list (no logos) of recognitions: Palace status,
 * Forbes 5-stars, World Travel Awards, Michelin-starred F&B venues, etc.
 *
 * Each award entry is structured as:
 *   `<dt>{name}</dt>`
 *   `<dd>{issuer}{year ? ` · ${year}` : ''}</dd>`
 *
 * Pure RSC, no client JS. Caller is responsible for hiding the section
 * when `awards.length === 0`.
 *
 * Per legal/UX rules from `competitive-pricing-comparison` skill: we do not
 * embed third-party trademarked logos — only their textual names.
 * Optional `url` is rendered as an external link with `rel="nofollow"`
 * so we don't leak ranking signals to the issuer.
 */
export async function HotelAwards({
  locale,
  awards,
}: HotelAwardsProps): Promise<React.ReactElement | null> {
  if (awards.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  return (
    <section aria-labelledby="awards-title" className="mb-12">
      <h2 id="awards-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.awards')}
      </h2>
      <p className="text-muted mb-4 text-sm">{t('awards.intro')}</p>

      <ul className="grid gap-3 sm:grid-cols-2">
        {awards.map((award, idx) => (
          <li
            key={`${award.name}-${award.year ?? idx}`}
            className="border-border bg-bg rounded-lg border p-4"
          >
            <dl className="flex flex-col gap-1">
              <dt className="text-fg font-medium">{award.name}</dt>
              <dd className="text-muted text-sm">
                {award.year !== null
                  ? t('awards.issuerWithYear', { issuer: award.issuer, year: award.year })
                  : award.issuer}
              </dd>
              {award.url !== null ? (
                <dd className="text-sm">
                  <a
                    href={award.url}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="text-fg underline decoration-dotted underline-offset-4 hover:decoration-solid"
                  >
                    {t('awards.viewSource')}
                  </a>
                </dd>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
