import type { ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/routing';

import { PriceComparatorClient } from './price-comparator-client';

export interface PriceComparatorProps {
  readonly locale: Locale;
  readonly hotelId: string;
  /** YYYY-MM-DD — required: widget is hidden when stay isn't selected. */
  readonly checkIn: string | null;
  readonly checkOut: string | null;
  readonly adults: number;
  /**
   * Live ConciergeTravel price (EUR cents, TTC). When `null` the widget
   * still renders the competitor list but skips the scenario verdict
   * (CDC v3.2 §"informational" tone).
   */
  readonly priceConciergeMinor: number | null;
}

/**
 * Server component shell for the price comparator (skill:
 * competitive-pricing-comparison).
 *
 * Responsibilities:
 *  - never block LCP: data is fetched **client-side** after hydration.
 *  - never link out to a competitor (CDC v3.2).
 *  - never display competitor logos (CDC v3.2).
 *  - hide when no stay dates are selected — the comparator is meaningless
 *    without a check-in / check-out range.
 *
 * The client island is what actually contacts `/api/price-comparison`
 * and renders the rows. The server shell only carries the labels.
 */
export async function PriceComparator(props: PriceComparatorProps): Promise<ReactElement | null> {
  if (props.checkIn === null || props.checkOut === null) return null;

  const t = await getTranslations('priceComparator');

  const labels = {
    title: t('title'),
    subtitle: t('subtitle'),
    loading: t('loading'),
    legal: t('legal'),
    cachedNotice: t('cachedNotice'),
    providerLabel: {
      booking_com: t('providerLabel.booking_com'),
      expedia: t('providerLabel.expedia'),
      hotels_com: t('providerLabel.hotels_com'),
      official_site: t('providerLabel.official_site'),
    },
    scenario: {
      cheaper: t('scenario.cheaper'),
      equalWithBenefits: t('scenario.equalWithBenefits'),
      moreExpensive: t('scenario.moreExpensive'),
      unavailable: t('scenario.unavailable'),
    },
    tableHeader: {
      provider: t('tableHeader.provider'),
      price: t('tableHeader.price'),
    },
  } as const;

  return (
    <section
      aria-labelledby="price-comparator-title"
      className="border-border bg-bg rounded-lg border p-5"
    >
      <header className="mb-3">
        <h2 id="price-comparator-title" className="text-fg font-serif text-lg">
          {labels.title}
        </h2>
        <p className="text-muted mt-1 text-xs">{labels.subtitle}</p>
      </header>

      <PriceComparatorClient
        locale={props.locale}
        hotelId={props.hotelId}
        checkIn={props.checkIn}
        checkOut={props.checkOut}
        adults={props.adults}
        priceConciergeMinor={props.priceConciergeMinor}
        labels={labels}
      />
    </section>
  );
}
