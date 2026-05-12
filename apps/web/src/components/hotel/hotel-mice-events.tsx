import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import type {
  LocalisedMiceInfo,
  LocalisedMiceSpace,
  MiceConfiguration,
} from '@/server/hotels/get-hotel-by-slug';

interface HotelMiceEventsProps {
  readonly locale: 'fr' | 'en';
  readonly hotelName: string;
  readonly mice: LocalisedMiceInfo | null;
}

/**
 * B2B / MICE section for the hotel detail page — CDC §2 bloc 14
 * (Phase 11.5).
 *
 * Surfaces the property's events offer to corporate buyers (event
 * planners, wedding planners, press attachés) with the bare-minimum
 * data they need to qualify the property before requesting a quote:
 *
 *   - one-line editorial pitch + headline capacity
 *   - the full list of spaces with surface + max seated
 *   - layout configurations (theatre / U-shape / boardroom / …)
 *   - event types catered for (corporate, wedding, gala, press, …)
 *   - mailto CTA to the dedicated MICE inbox
 *   - optional brochure PDF (rel=noopener, no JS, new tab)
 *
 * Server-rendered RSC: no client JS, no interactivity. The mailto
 * link is a vanilla anchor — standard concierge ergonomics. We
 * deliberately do NOT inline a contact form here; the section's
 * intent is qualification, not lead capture. (A dedicated
 * `/contact/mice` page is the right home for that, Phase 12+.)
 *
 * Accessibility
 * -------------
 * - The section uses an explicit `aria-labelledby` pointing at the
 *   localized H2 ("Événements & séminaires" / "Events & seminars").
 * - Each space is a `<li>` carrying a `<dl>` with the structured
 *   facts; configurations are an `<ul role="list">` of plain text
 *   pills (no icons that could be misread by SR).
 * - The mailto CTA is a `<a>` with an explicit `aria-label`
 *   interpolating the hotel name and a recognisable verb prefix
 *   ("Contacter l'équipe MICE de Hôtel X").
 * - The brochure link uses a visually-hidden hint that announces
 *   "PDF, opens in a new tab" for screen readers.
 */
export async function HotelMiceEvents({
  locale,
  hotelName,
  mice,
}: HotelMiceEventsProps): Promise<ReactElement | null> {
  if (mice === null) return null;

  const t = await getTranslations({ locale, namespace: 'hotelPage.mice' });
  const localeFmt = locale === 'fr' ? 'fr-FR' : 'en-GB';

  return (
    <section aria-labelledby="mice-title" className="mb-12">
      <h2 id="mice-title" className="text-fg mb-3 font-serif text-2xl">
        {t('title')}
      </h2>
      <p className="text-muted mb-6 max-w-prose text-sm">
        {mice.summary ?? t('introFallback', { name: hotelName })}
      </p>

      <div className="border-border bg-bg mb-6 grid grid-cols-1 gap-4 rounded-lg border p-5 sm:grid-cols-3">
        <div>
          <p className="text-muted text-xs uppercase tracking-[0.14em]">{t('headline.spaces')}</p>
          <p className="text-fg mt-1 font-serif text-2xl tabular-nums">{mice.spaces.length}</p>
        </div>
        <div>
          <p className="text-muted text-xs uppercase tracking-[0.14em]">{t('headline.capacity')}</p>
          <p className="text-fg mt-1 font-serif text-2xl tabular-nums">
            {t('headline.capacityValue', { count: mice.totalCapacitySeated })}
          </p>
        </div>
        {mice.maxRoomHeightM !== null ? (
          <div>
            <p className="text-muted text-xs uppercase tracking-[0.14em]">{t('headline.height')}</p>
            <p className="text-fg mt-1 font-serif text-2xl tabular-nums">
              {new Intl.NumberFormat(localeFmt, { maximumFractionDigits: 1 }).format(
                mice.maxRoomHeightM,
              )}
              <span className="text-muted text-sm"> m</span>
            </p>
          </div>
        ) : null}
      </div>

      {mice.eventTypes.length > 0 ? (
        <div className="mb-6">
          <p className="text-muted mb-2 text-xs uppercase tracking-[0.14em]">
            {t('eventTypes.label')}
          </p>
          <ul className="flex flex-wrap gap-2">
            {mice.eventTypes.map((type) => (
              <li
                key={type}
                className="border-border text-fg rounded-md border px-2.5 py-1 text-xs"
              >
                {t(`eventTypes.values.${type}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className="text-fg mb-3 font-serif text-lg">{t('spacesTitle')}</h3>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mice.spaces.map((space) => (
          <li
            key={space.key}
            className="border-border bg-bg flex flex-col gap-2 rounded-lg border p-4"
          >
            <SpaceCard
              space={space}
              tConfig={(config): string => t(`configurations.${config}`)}
              tSurfaceLabel={t('space.surfaceLabel')}
              tSurfaceValue={(sqm): string => t('space.surfaceValue', { count: sqm })}
              tSeatedLabel={t('space.seatedLabel')}
              tSeatedValue={(count): string => t('space.seatedValue', { count })}
              tNaturalLight={t('space.naturalLight')}
              tConfigLabel={t('space.configLabel')}
            />
          </li>
        ))}
      </ul>

      <div className="border-border bg-bg mt-8 flex flex-col gap-3 rounded-lg border p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted text-sm">{t('contactIntro', { name: hotelName })}</p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`mailto:${mice.contactEmail}?subject=${encodeURIComponent(t('contactSubject', { name: hotelName }))}`}
            aria-label={t('contactAria', { name: hotelName })}
            className="bg-fg text-bg focus-visible:ring-ring inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
          >
            {t('contactCta')}
          </a>
          {mice.brochureUrl !== null ? (
            <a
              href={mice.brochureUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border text-fg focus-visible:ring-ring inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
            >
              {t('brochureCta')}
              <span className="sr-only"> ({t('brochureSrHint')})</span>
              <span aria-hidden> ↗</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

interface SpaceCardProps {
  readonly space: LocalisedMiceSpace;
  readonly tConfig: (config: MiceConfiguration) => string;
  readonly tSurfaceLabel: string;
  readonly tSurfaceValue: (sqm: number) => string;
  readonly tSeatedLabel: string;
  readonly tSeatedValue: (count: number) => string;
  readonly tNaturalLight: string;
  readonly tConfigLabel: string;
}

function SpaceCard({
  space,
  tConfig,
  tSurfaceLabel,
  tSurfaceValue,
  tSeatedLabel,
  tSeatedValue,
  tNaturalLight,
  tConfigLabel,
}: SpaceCardProps): ReactElement {
  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h4 className="text-fg font-serif text-base">{space.name}</h4>
        {space.hasNaturalLight ? (
          <span className="text-muted text-[0.65rem] uppercase tracking-[0.12em]">
            {tNaturalLight}
          </span>
        ) : null}
      </header>
      <dl className="text-fg flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <div className="flex items-baseline gap-1">
          <dt className="text-muted text-xs">{tSurfaceLabel}</dt>
          <dd className="font-medium tabular-nums">{tSurfaceValue(space.surfaceSqm)}</dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="text-muted text-xs">{tSeatedLabel}</dt>
          <dd className="font-medium tabular-nums">{tSeatedValue(space.maxSeated)}</dd>
        </div>
      </dl>
      {space.configurations.length > 0 ? (
        <div className="mt-1">
          <p className="text-muted text-[0.65rem] uppercase tracking-[0.12em]">{tConfigLabel}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {space.configurations.map((config) => (
              <li
                key={config}
                className="border-border text-muted rounded border px-1.5 py-0.5 text-[0.7rem]"
              >
                {tConfig(config)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {space.notes !== null ? <p className="text-muted text-xs">{space.notes}</p> : null}
    </>
  );
}
