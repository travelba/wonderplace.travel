import { loadSharedEnv, type SharedEnv } from '@cct/config/env';
import { err, ok, type Result } from '@cct/domain/shared';
import { retryingJsonRequest } from '@cct/integrations/http';

import type { MakcorpsError } from './errors.js';
import { MakcorpsHotelQuoteInputSchema, type MakcorpsHotelQuoteInput } from './types.js';

export type MakcorpsClientConfig = {
  readonly baseUrl: string;
  readonly apiKey: string;
};

export async function fetchMakcorpsHotelQuotes(
  cfg: MakcorpsClientConfig,
  input: MakcorpsHotelQuoteInput,
): Promise<Result<unknown, MakcorpsError>> {
  const validated = MakcorpsHotelQuoteInputSchema.safeParse(input);
  if (!validated.success) {
    return err({ kind: 'parse_failure', details: 'invalid makcorps input' });
  }
  const v = validated.data;
  const rooms = v.rooms ?? 1;
  const url = new URL('/hotel', cfg.baseUrl);
  url.searchParams.set('hotelid', v.hotelId);
  url.searchParams.set('checkin', v.checkin);
  url.searchParams.set('checkout', v.checkout);
  url.searchParams.set('adults', String(v.adults));
  url.searchParams.set('rooms', String(rooms));
  url.searchParams.set('currency', v.currency);
  url.searchParams.set('api_key', cfg.apiKey);

  const res = await retryingJsonRequest({
    url: url.toString(),
    method: 'GET',
    headers: { Accept: 'application/json' },
    body: { kind: 'none' },
  });
  if (!res.ok) return err({ kind: 'http', error: res.error });
  if (res.value.json === undefined) {
    return err({ kind: 'parse_failure', details: 'empty makcorps response' });
  }
  return ok(res.value.json);
}

export function makcorpsConfigFromSharedEnv(source?: SharedEnv): MakcorpsClientConfig {
  const env = source ?? loadSharedEnv();
  return { baseUrl: env.MAKCORPS_API_BASE, apiKey: env.MAKCORPS_API_KEY };
}
