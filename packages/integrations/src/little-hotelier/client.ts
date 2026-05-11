import { loadSharedEnv, type SharedEnv } from '@cct/config/env';
import { err, ok, type Result } from '@cct/domain/shared';
import { retryingJsonRequest } from '@cct/integrations/http';

import type { LittleHotelierError } from './errors.js';
import { normalizeLittlePropertiesList } from './types.js';

export type LittleHotelierClientConfig = {
  readonly baseUrl: string;
  readonly apiKey: string;
};

export async function fetchLittleHotelierProperties(
  cfg: LittleHotelierClientConfig,
): Promise<Result<readonly unknown[], LittleHotelierError>> {
  const url = new URL('/properties', cfg.baseUrl).toString();
  const res = await retryingJsonRequest({
    url,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: 'application/json',
    },
    body: { kind: 'none' },
  });
  if (!res.ok) return err({ kind: 'http', error: res.error });
  if (res.value.json === undefined) {
    return err({ kind: 'parse_failure', details: 'empty properties response' });
  }
  const list = normalizeLittlePropertiesList(res.value.json);
  if (list === undefined) {
    return err({ kind: 'parse_failure', details: 'properties response shape' });
  }
  return ok(list);
}

export function littleHotelierConfigFromSharedEnv(source?: SharedEnv): LittleHotelierClientConfig {
  const env = source ?? loadSharedEnv();
  return { baseUrl: env.LITTLE_HOTELIER_API_BASE, apiKey: env.LITTLE_HOTELIER_API_KEY };
}
