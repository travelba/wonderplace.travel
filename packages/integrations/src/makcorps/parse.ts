import type { CompetitorProvider } from '@cct/domain/price-comparison';

/**
 * Makcorps raw → domain entries (skill: competitive-pricing-comparison).
 *
 * Makcorps' Hotel Price API returns an array of vendor records under
 * `comparison`. The exact field naming varies across plan tiers:
 *   - some endpoints use `{ "vendor1": "Booking.com", "price1": "120.00" }`
 *   - others nest in `{ "vendor": { "name": ..., "price": ... } }`
 *
 * We accept both shapes and produce a flat list of `{ provider, price }`
 * entries restricted to the domain allow-list. Anything we can't map is
 * dropped silently — the domain normalizer enforces final filtering.
 *
 * NOTE: This parser is intentionally permissive. We never throw on
 * malformed payloads; callers see an empty array and the widget hides
 * itself per CDC v3.2.
 */

const PROVIDER_MAP: Record<string, CompetitorProvider> = {
  'booking.com': 'booking_com',
  booking: 'booking_com',
  expedia: 'expedia',
  'hotels.com': 'hotels_com',
  hotels: 'hotels_com',
  'official site': 'official_site',
  official: 'official_site',
  direct: 'official_site',
};

export interface ParsedMakcorpsEntry {
  readonly provider: CompetitorProvider;
  readonly price: number;
}

const tryProvider = (name: unknown): CompetitorProvider | null => {
  if (typeof name !== 'string') return null;
  const key = name.trim().toLowerCase();
  return PROVIDER_MAP[key] ?? null;
};

const tryPrice = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    // Tolerate "EUR 120.00", "120,00 €", "120" — strip non-numeric/dot/comma
    // then normalise the decimal separator.
    const cleaned = value.replace(/[^\d.,-]/g, '').replace(',', '.');
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Extract `{ provider, price }` pairs from a single Makcorps comparison row.
 *
 * Shape A (flat with indexed keys):
 *   `{ vendor1: 'Booking.com', price1: '120.00', vendor2: 'Expedia', price2: '115.00' }`
 *
 * Shape B (nested):
 *   `{ vendor: { name: 'Booking.com', price: '120' } }`
 *   `{ name: 'Booking.com', price: '120' }`
 */
function extractFromRow(row: Record<string, unknown>): ParsedMakcorpsEntry[] {
  const out: ParsedMakcorpsEntry[] = [];

  // --- shape B: nested vendor object or flat name/price pair --------------
  const nestedRaw = row['vendor'];
  const nestedVendor = isRecord(nestedRaw) ? nestedRaw : null;
  const flatName = row['name'] ?? nestedVendor?.['name'];
  const flatPrice = row['price'] ?? nestedVendor?.['price'];
  const flatProvider = tryProvider(flatName);
  const flatPriceVal = tryPrice(flatPrice);
  if (flatProvider !== null && flatPriceVal !== null) {
    out.push({ provider: flatProvider, price: flatPriceVal });
  }

  // --- shape A: vendor1/price1, vendor2/price2, ... -----------------------
  for (const key of Object.keys(row)) {
    const match = /^vendor(\d+)$/i.exec(key);
    if (match === null) continue;
    const idx = match[1]!;
    const provider = tryProvider(row[key]);
    if (provider === null) continue;
    const price = tryPrice(row[`price${idx}`]);
    if (price === null) continue;
    out.push({ provider, price });
  }

  return out;
}

/**
 * Walk an arbitrary JSON tree and harvest every `{ provider, price }` pair
 * that maps cleanly. We dedup by provider keeping the cheapest price so
 * the output is stable regardless of nesting depth — Makcorps occasionally
 * mirrors the same vendor at top-level and inside a `vendor` sub-object,
 * which would otherwise inflate the result.
 */
export function parseMakcorpsResponse(payload: unknown): ParsedMakcorpsEntry[] {
  const bestByProvider = new Map<CompetitorProvider, number>();

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!isRecord(node)) return;
    for (const entry of extractFromRow(node)) {
      const prev = bestByProvider.get(entry.provider);
      if (prev === undefined || entry.price < prev) {
        bestByProvider.set(entry.provider, entry.price);
      }
    }
    for (const value of Object.values(node)) visit(value);
  };

  visit(payload);

  const out: ParsedMakcorpsEntry[] = [];
  for (const [provider, price] of bestByProvider) {
    out.push({ provider, price });
  }
  return out;
}
