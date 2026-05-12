import type { Locale } from '@/i18n/routing';

/**
 * Minor-unit currency tuple as stored in the
 * `hotel_rooms.indicative_price_minor` JSONB column.
 *
 * Amounts are integers expressed in the smallest unit of the
 * currency (cents for EUR / USD / GBP / CHF, where the minor unit
 * has 2 decimals — none of the supported currencies are zero-
 * decimal). `toMinor` is null for an open-ended "from" price.
 */
export interface IndicativePriceMinor {
  readonly fromMinor: number;
  readonly toMinor: number | null;
  readonly currency: 'EUR' | 'USD' | 'GBP' | 'CHF';
}

export interface IndicativePriceParts {
  readonly from: string;
  readonly to: string | null;
}

/**
 * Format an indicative price into locale-aware currency strings.
 *
 * Why a shared helper rather than per-page formatting:
 *   - Hotel detail page renders the price on the room list cards.
 *   - Room sub-page renders the price in its own facts row.
 *   - Tooltip / share / future widgets may need the same parts.
 * Centralising the `Intl.NumberFormat` call keeps the formatting
 * consistent (fr-FR vs en-GB, currency symbol position, no
 * decimals) across surfaces — divergence here would surface as
 * inconsistent SERP / hreflang signals.
 *
 * The caller still owns the i18n template (`from {from}` vs
 * `from {from} to {to}`) because the right phrasing depends on
 * the surface — the room list says "À partir de 950 €", the room
 * fact dl says "950 €", the share popup may say something else.
 * Returning {from, to} keeps the helper template-free.
 */
export function formatIndicativePriceParts(
  price: IndicativePriceMinor,
  locale: Locale,
): IndicativePriceParts {
  const localeTag = locale === 'fr' ? 'fr-FR' : 'en-GB';
  const fmt = new Intl.NumberFormat(localeTag, {
    style: 'currency',
    currency: price.currency,
    maximumFractionDigits: 0,
  });
  return {
    from: fmt.format(price.fromMinor / 100),
    to: price.toMinor !== null ? fmt.format(price.toMinor / 100) : null,
  };
}

/**
 * Aggregate a `priceRange` string for the parent hotel JSON-LD
 * (Google Hotels `Hotel.priceRange`) from its rooms' indicative
 * prices.
 *
 * The string is a free-form anchor — Google specifically advises
 * either a currency-prefixed range ("€950–€11 000") or a $-count
 * sentinel ("$$$$$"). We pick the localised currency range because
 * it doubles as a useful AEO answer for "how much per night at
 * X?" without requiring a separate FAQ entry.
 *
 * Edge cases:
 *   - No room has an indicative price → returns null. The page
 *     skips the `priceRange` field entirely (rather than emitting
 *     a misleading "from €0").
 *   - All priced rooms share the same currency → emit. If a hotel
 *     mixes EUR + USD (e.g. dollar-anchored aspirational suites in
 *     Paris) we **skip** rather than guess a conversion — silent
 *     omission beats stale FX.
 *   - Single price point (one room, no `to`) → "€950" (no range
 *     dashes). Multiple rooms with identical min == max → idem.
 */
export function computeHotelPriceRange(
  rooms: ReadonlyArray<{ readonly indicativePrice: IndicativePriceMinor | null }>,
  locale: Locale,
): string | null {
  const priced: IndicativePriceMinor[] = [];
  for (const room of rooms) {
    if (room.indicativePrice !== null) {
      priced.push(room.indicativePrice);
    }
  }
  if (priced.length === 0) return null;

  const currencies = new Set(priced.map((p) => p.currency));
  if (currencies.size !== 1) return null;
  const [first] = priced;
  if (first === undefined) return null;
  const currency = first.currency;

  let minMinor = Number.POSITIVE_INFINITY;
  let maxMinor = 0;
  for (const p of priced) {
    if (p.fromMinor < minMinor) minMinor = p.fromMinor;
    const top = p.toMinor ?? p.fromMinor;
    if (top > maxMinor) maxMinor = top;
  }

  const localeTag = locale === 'fr' ? 'fr-FR' : 'en-GB';
  const fmt = new Intl.NumberFormat(localeTag, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  const low = fmt.format(minMinor / 100);
  const high = fmt.format(maxMinor / 100);
  return low === high ? low : `${low}–${high}`;
}
