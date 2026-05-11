/**
 * Non-affiliated price comparator types (skill:
 * competitive-pricing-comparison). All monetary values are TTC in EUR,
 * stored as integer minor units (cents) to avoid float drift — the same
 * convention used everywhere else in the domain (see `Booking.MoneyAmount`).
 *
 * Strict CDC v3.2 rules embedded in the model:
 *  - providers are an enumerated set; we never accept arbitrary brand names
 *    from the parser (anti-typosquatting + trademark-safety).
 *  - the comparator never produces clickable links; it carries display
 *    metadata only.
 */

export type CompetitorProvider = 'booking_com' | 'expedia' | 'hotels_com' | 'official_site';

export const COMPETITOR_PROVIDERS: readonly CompetitorProvider[] = [
  'booking_com',
  'expedia',
  'hotels_com',
  'official_site',
] as const;

export interface CompetitorPrice {
  readonly provider: CompetitorProvider;
  /** TTC, in EUR cents. */
  readonly amountMinor: number;
}

/**
 * Normalized comparator response (no logos, no links, no clickable refs —
 * just numbers + provider keys). Consumed by the widget + scenario engine.
 */
export interface NormalizedComparison {
  readonly competitors: readonly CompetitorPrice[];
  /**
   * Value (EUR cents) of the loyalty / direct-booking benefits embedded
   * in the ConciergeTravel offer (e.g. early check-in, room upgrade,
   * welcome amenities). Used by the `equal_with_benefits` scenario.
   *
   * `0` when no benefit applies (typical for non-Little-catalog hotels).
   */
  readonly benefitsValueMinor: number;
  /** Convenience derived field — cheapest competitor or `null`. */
  readonly cheapestCompetitor: CompetitorPrice | null;
  /** Stay context echoed back to clients for trust-but-verify. */
  readonly stay: {
    readonly checkIn: string;
    readonly checkOut: string;
    readonly adults: number;
  };
}

/**
 * Outcome of comparing the ConciergeTravel price (`priceConciergeMinor`)
 * to the cheapest competitor, **after** factoring in the FREE-catalog
 * benefits when applicable (CDC §9 + addendum v3.2).
 */
export type ComparisonScenario =
  /** Concierge is strictly cheaper than any competitor. */
  | { readonly kind: 'cheaper'; readonly deltaMinor: number }
  /** Concierge ≤ cheapest competitor AND benefitsValue > 0. */
  | { readonly kind: 'equal_with_benefits'; readonly benefitsValueMinor: number }
  /**
   * Concierge > cheapest competitor. Per addendum v3.2 we still display
   * the comparator with an *informational* tone — never hide unfavorable
   * data.
   */
  | { readonly kind: 'more_expensive'; readonly deltaMinor: number }
  /**
   * No competitor data available — typically because the hotel has no
   * `makcorps_hotel_id` or every provider was filtered out for being
   * unavailable on the requested dates.
   */
  | { readonly kind: 'unavailable' };
