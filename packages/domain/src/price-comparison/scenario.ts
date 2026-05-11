import type { ComparisonScenario, NormalizedComparison } from './types';

export interface ScenarioInput {
  readonly normalized: NormalizedComparison;
  /**
   * ConciergeTravel price (TTC, EUR minor units) — the **fresh** Amadeus
   * or Little Hotelier price. Per skill, this value is never cached
   * because pre-payment offer pricing must always be live.
   *
   * `null` means we don't know the Concierge price yet (e.g. dates not
   * picked) — the widget should not be displayed.
   */
  readonly priceConciergeMinor: number | null;
}

/**
 * Decide which copy + tone the comparator widget should use.
 *
 * Decision tree (CDC §9 + addendum v3.2):
 *  1. no competitor data ........................... `unavailable`
 *  2. priceConcierge < cheapestCompetitor .......... `cheaper`
 *  3. priceConcierge ≤ cheapestCompetitor AND
 *     benefits > 0 ................................. `equal_with_benefits`
 *  4. otherwise .................................... `more_expensive`
 */
export function computeScenario(input: ScenarioInput): ComparisonScenario {
  const { normalized, priceConciergeMinor } = input;
  const cheapest = normalized.cheapestCompetitor;
  if (cheapest === null || priceConciergeMinor === null) {
    return { kind: 'unavailable' };
  }

  if (priceConciergeMinor < cheapest.amountMinor) {
    return { kind: 'cheaper', deltaMinor: cheapest.amountMinor - priceConciergeMinor };
  }

  if (priceConciergeMinor <= cheapest.amountMinor && normalized.benefitsValueMinor > 0) {
    return {
      kind: 'equal_with_benefits',
      benefitsValueMinor: normalized.benefitsValueMinor,
    };
  }

  return {
    kind: 'more_expensive',
    deltaMinor: priceConciergeMinor - cheapest.amountMinor,
  };
}
