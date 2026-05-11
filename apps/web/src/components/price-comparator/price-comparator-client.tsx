'use client';

import { useEffect, useState, type ReactElement } from 'react';

import {
  computeScenario,
  type ComparisonScenario,
  type CompetitorPrice,
  type CompetitorProvider,
  type NormalizedComparison,
} from '@cct/domain/price-comparison';

import type { Locale } from '@/i18n/routing';

export interface PriceComparatorLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly loading: string;
  readonly legal: string;
  readonly cachedNotice: string;
  readonly providerLabel: Record<CompetitorProvider, string>;
  readonly scenario: {
    readonly cheaper: string;
    readonly equalWithBenefits: string;
    readonly moreExpensive: string;
    readonly unavailable: string;
  };
  readonly tableHeader: {
    readonly provider: string;
    readonly price: string;
  };
}

interface ApiResponseAvailable {
  readonly ok: true;
  readonly available: true;
  readonly cached: boolean;
  readonly competitors: readonly CompetitorPrice[];
  readonly benefitsValueMinor: number;
  readonly stay: NormalizedComparison['stay'];
}

interface ApiResponseUnavailable {
  readonly ok: true;
  readonly available: false;
  readonly reason: string;
}

type ApiResponse = ApiResponseAvailable | ApiResponseUnavailable;

export interface PriceComparatorClientProps {
  readonly locale: Locale;
  readonly hotelId: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adults: number;
  readonly priceConciergeMinor: number | null;
  readonly labels: PriceComparatorLabels;
}

function formatEuroAmount(locale: Locale, amountMinor: number): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.round(amountMinor) / 100);
}

function scenarioHeadline(scenario: ComparisonScenario, labels: PriceComparatorLabels): string {
  const map: Record<ComparisonScenario['kind'], string> = {
    cheaper: labels.scenario.cheaper,
    equal_with_benefits: labels.scenario.equalWithBenefits,
    more_expensive: labels.scenario.moreExpensive,
    unavailable: labels.scenario.unavailable,
  };
  return map[scenario.kind];
}

export function PriceComparatorClient(props: PriceComparatorClientProps): ReactElement | null {
  const [state, setState] = useState<
    | { readonly status: 'idle' }
    | { readonly status: 'loading' }
    | { readonly status: 'unavailable' }
    | { readonly status: 'available'; readonly data: ApiResponseAvailable }
  >({ status: 'idle' });

  useEffect(() => {
    // Fetch *after* mount + after first paint: deferred via `requestIdleCallback`
    // when available, falls back to a 200 ms timeout. The comparator must
    // never delay LCP per skill performance guardrail.
    let cancelled = false;
    setState({ status: 'loading' });

    const trigger = () => {
      if (cancelled) return;
      const params = new URLSearchParams({
        hotelId: props.hotelId,
        checkIn: props.checkIn,
        checkOut: props.checkOut,
        adults: String(props.adults),
      });
      fetch(`/api/price-comparison?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('network');
          const json: unknown = await res.json();
          if (cancelled) return;
          const parsed = json as ApiResponse;
          if (!parsed.ok) {
            setState({ status: 'unavailable' });
            return;
          }
          if (!parsed.available || parsed.competitors.length === 0) {
            setState({ status: 'unavailable' });
            return;
          }
          setState({ status: 'available', data: parsed });
        })
        .catch(() => {
          if (!cancelled) setState({ status: 'unavailable' });
        });
    };

    const rIC = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (cb: () => void) => number;
      }
    ).requestIdleCallback;
    const handle = typeof rIC === 'function' ? rIC(trigger) : window.setTimeout(trigger, 200);

    return () => {
      cancelled = true;
      const cIC = (
        globalThis as typeof globalThis & {
          cancelIdleCallback?: (h: number) => void;
        }
      ).cancelIdleCallback;
      if (typeof rIC === 'function' && typeof cIC === 'function') cIC(handle);
      else window.clearTimeout(handle as number);
    };
  }, [props.hotelId, props.checkIn, props.checkOut, props.adults]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <p className="text-muted text-sm" aria-live="polite" aria-busy={state.status === 'loading'}>
        {props.labels.loading}
      </p>
    );
  }

  // CDC v3.2: when no data, hide the entire data block — only the section
  // header remains. We still surface the legal mention so the page meets
  // the disclosure requirement.
  if (state.status === 'unavailable') {
    return <p className="text-muted text-sm">{props.labels.scenario.unavailable}</p>;
  }

  const { data } = state;
  const normalized: NormalizedComparison = {
    competitors: data.competitors,
    benefitsValueMinor: data.benefitsValueMinor,
    cheapestCompetitor: data.competitors[0] ?? null,
    stay: data.stay,
  };
  const scenario = computeScenario({
    normalized,
    priceConciergeMinor: props.priceConciergeMinor,
  });

  return (
    <div>
      <p className="text-fg mb-3 text-sm font-medium" data-scenario={scenario.kind}>
        {scenarioHeadline(scenario, props.labels)}
      </p>

      {data.cached ? <p className="text-muted mb-3 text-xs">{props.labels.cachedNotice}</p> : null}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-border text-muted border-b text-left text-xs uppercase tracking-wider">
            <th scope="col" className="py-2 pr-2 font-normal">
              {props.labels.tableHeader.provider}
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-normal">
              {props.labels.tableHeader.price}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.competitors.map((c) => (
            <tr key={c.provider} className="border-border/60 border-b last:border-0">
              <th scope="row" className="text-fg py-2 pr-2 font-normal">
                {props.labels.providerLabel[c.provider]}
              </th>
              <td className="text-fg py-2 pl-2 text-right tabular-nums">
                {formatEuroAmount(props.locale, c.amountMinor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-muted mt-4 text-[11px] leading-snug">{props.labels.legal}</p>
    </div>
  );
}
