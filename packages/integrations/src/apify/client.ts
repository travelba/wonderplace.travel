import { loadSharedEnv, type SharedEnv } from '@cct/config/env';
import { err, ok, type Result } from '@cct/domain/shared';
import { retryingJsonRequest } from '@cct/integrations/http';

import { parseMakcorpsResponse, type ParsedMakcorpsEntry } from '../makcorps/parse.js';
import type { ApifyError } from './errors.js';

export interface ApifyClientConfig {
  readonly token: string;
  readonly actorId: string;
}

export interface ApifyHotelQuoteInput {
  readonly hotelName: string;
  readonly city: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly adults: number;
}

/**
 * Apify fallback for the Makcorps comparator (skill:
 * competitive-pricing-comparison). Runs a public hotel-rate actor
 * synchronously and returns the same `{provider, price}` shape as Makcorps
 * so the domain normalizer stays vendor-agnostic.
 *
 * V1 implementation: synchronous run via `runs/sync-get-dataset-items`.
 * The actor's exact output shape varies; we re-use the Makcorps parser
 * which already handles both flat and nested vendor records, then strip
 * Makcorps-specific naming. If the Apify actor returns something else
 * entirely it produces zero entries and the widget hides itself, which
 * is the safe default per CDC v3.2.
 */
export async function fetchApifyHotelQuotes(
  cfg: ApifyClientConfig,
  input: ApifyHotelQuoteInput,
): Promise<Result<readonly ParsedMakcorpsEntry[], ApifyError>> {
  if (cfg.token.length === 0 || cfg.actorId.length === 0) {
    return err({ kind: 'not_configured' });
  }

  const url = new URL(
    `/v2/acts/${encodeURIComponent(cfg.actorId)}/run-sync-get-dataset-items`,
    'https://api.apify.com/',
  );
  url.searchParams.set('token', cfg.token);
  url.searchParams.set('format', 'json');

  const res = await retryingJsonRequest({
    url: url.toString(),
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: {
      kind: 'json',
      value: {
        hotelName: input.hotelName,
        city: input.city,
        checkin: input.checkin,
        checkout: input.checkout,
        adults: input.adults,
      },
    },
  });

  if (!res.ok) return err({ kind: 'http', error: res.error });
  if (res.value.json === undefined) {
    return ok([]);
  }
  return ok(parseMakcorpsResponse(res.value.json));
}

export function apifyConfigFromSharedEnv(source?: SharedEnv): ApifyClientConfig {
  const env = source ?? loadSharedEnv();
  return {
    token: env.APIFY_API_TOKEN ?? '',
    actorId: env.APIFY_HOTEL_ACTOR_ID ?? '',
  };
}
