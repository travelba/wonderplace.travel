import 'server-only';

import { createAmadeusClient, type AmadeusClient } from '@cct/integrations/amadeus';

import { env } from '@/lib/env';
import { redis } from '@/lib/redis';

let cached: AmadeusClient | undefined;

function baseUrl(): string {
  return env.AMADEUS_ENV === 'production'
    ? 'https://api.amadeus.com'
    : 'https://test.api.amadeus.com';
}

export function getAmadeusClient(): AmadeusClient {
  if (cached) return cached;
  cached = createAmadeusClient({
    baseUrl: baseUrl(),
    clientId: env.AMADEUS_API_KEY,
    clientSecret: env.AMADEUS_API_SECRET,
    redis,
  });
  return cached;
}
