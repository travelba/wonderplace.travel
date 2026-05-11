/**
 * Amadeus GDS Self-Service — public surface (skill: amadeus-gds, api-integration).
 */
export const AMADEUS_INTEGRATION_VERSION = '0.0.1' as const;

export type { AmadeusClient, AmadeusCredentials, PricedOffer } from './amadeus-client.js';
export { createAmadeusClient, createAmadeusClientFromSharedEnv } from './amadeus-client.js';
export * from './cache-keys.js';
export type { AmadeusError } from './errors.js';
export {
  amadeusOfferToDomain,
  DEFAULT_OFFER_LOCK_SECONDS,
  type OfferMappingContext,
} from './map-offer.js';
export { amadeusPoliciesToCancellation } from './map-cancellation-policy.js';
export {
  AMADEUS_SENTIMENT_CATEGORY_KEYS,
  amadeusSentimentToAggregateRating,
  amadeusSentimentToCategoryBreakdown,
  type AmadeusAggregateRating,
  type AmadeusSentimentCategory,
  type AmadeusSentimentCategoryKey,
  type CategoryBreakdownOptions,
} from './map-sentiment.js';
export type { AmadeusOAuthConfig } from './oauth-token.js';
export { getAmadeusAccessToken } from './oauth-token.js';
export * from './types.js';
