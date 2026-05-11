/**
 * Makcorps Hotel Price API (skill: competitive-pricing-comparison).
 */
export const MAKCORPS_INTEGRATION_VERSION = '0.0.1' as const;

export type { MakcorpsError } from './errors.js';
export {
  fetchMakcorpsHotelQuotes,
  makcorpsConfigFromSharedEnv,
  type MakcorpsClientConfig,
} from './client.js';
export { MakcorpsHotelQuoteInputSchema, type MakcorpsHotelQuoteInput } from './types.js';
export { parseMakcorpsResponse, type ParsedMakcorpsEntry } from './parse.js';
