/**
 * Little Hotelier — vendor client (skill: little-hotelier).
 */
export const LITTLE_INTEGRATION_VERSION = '0.0.1' as const;

export type { LittleHotelierError } from './errors.js';
export {
  fetchLittleHotelierProperties,
  littleHotelierConfigFromSharedEnv,
  type LittleHotelierClientConfig,
} from './client.js';
export { normalizeLittlePropertiesList } from './types.js';
