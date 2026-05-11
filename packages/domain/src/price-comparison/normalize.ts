import {
  COMPETITOR_PROVIDERS,
  type CompetitorPrice,
  type CompetitorProvider,
  type NormalizedComparison,
} from './types';

/**
 * Raw competitor record produced by the integration layer (Makcorps or
 * Apify). Both vendors are mapped to this conservative shape by the
 * integration parsers — the domain stays vendor-agnostic.
 */
export interface RawCompetitorEntry {
  readonly provider: CompetitorProvider;
  /** EUR TTC, as a numeric or decimal-string value. */
  readonly price: number | string;
}

export interface NormalizeComparisonInput {
  readonly entries: readonly RawCompetitorEntry[];
  readonly benefitsValueMinor?: number;
  readonly stay: {
    readonly checkIn: string;
    readonly checkOut: string;
    readonly adults: number;
  };
}

const ALLOWED = new Set<CompetitorProvider>(COMPETITOR_PROVIDERS);

const toMinor = (value: number | string): number | null => {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Round half-away-from-zero on cents — avoids 9.999 → 999 drift while
  // staying deterministic. We never persist sub-cent precision.
  return Math.round(n * 100);
};

/**
 * Build a `NormalizedComparison` from raw integration data.
 *
 * Filtering rules (CDC v3.2):
 *  - drop any provider not in the allow-list (trademark-safety).
 *  - drop any entry with non-positive or unparseable price.
 *  - when the same provider appears multiple times, keep the cheapest.
 *  - sort competitors ascending by price for stable display order.
 */
export function normalizeComparison(input: NormalizeComparisonInput): NormalizedComparison {
  const dedup = new Map<CompetitorProvider, number>();
  for (const entry of input.entries) {
    if (!ALLOWED.has(entry.provider)) continue;
    const minor = toMinor(entry.price);
    if (minor === null) continue;
    const previous = dedup.get(entry.provider);
    if (previous === undefined || minor < previous) {
      dedup.set(entry.provider, minor);
    }
  }

  const competitors: CompetitorPrice[] = [];
  for (const [provider, amountMinor] of dedup) {
    competitors.push({ provider, amountMinor });
  }
  competitors.sort((a, b) => a.amountMinor - b.amountMinor);

  const cheapestCompetitor: CompetitorPrice | null =
    competitors.length > 0 ? competitors[0]! : null;

  const benefitsValueMinor =
    input.benefitsValueMinor !== undefined && input.benefitsValueMinor > 0
      ? Math.round(input.benefitsValueMinor)
      : 0;

  return {
    competitors,
    benefitsValueMinor,
    cheapestCompetitor,
    stay: input.stay,
  };
}
