/**
 * Apify fallback for the price comparator (skill: competitive-pricing-comparison).
 */
export const APIFY_INTEGRATION_VERSION = '0.0.1' as const;

export type { ApifyError } from './errors.js';
export {
  fetchApifyHotelQuotes,
  apifyConfigFromSharedEnv,
  type ApifyClientConfig,
  type ApifyHotelQuoteInput,
} from './client.js';
