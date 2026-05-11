/**
 * Algolia admin indexer — Payload `afterChange`, scripts, cron (skill: search-engineering).
 */
export const ALGOLIA_INTEGRATION_VERSION = '0.0.1' as const;

export { DEFAULT_CITIES_INDEX_SETTINGS } from './city-index-settings.js';
export type { AlgoliaIndexingError } from './errors.js';
export { DEFAULT_HOTELS_INDEX_SETTINGS } from './hotel-index-settings.js';
export {
  AlgoliaIndexingService,
  createAlgoliaIndexingService,
  type AlgoliaIndexingConfig,
} from './indexing-service.js';
export { citiesIndexName, hotelsIndexName, type SearchLocale } from './index-names.js';
export { buildCityAlgoliaRecord, popularityScore } from './map-city-record.js';
export { buildHotelAlgoliaRecord, priorityScore } from './map-hotel-record.js';
export { syncCityPublicationToAlgolia } from './sync-city.js';
export {
  createAlgoliaIndexingServiceFromSharedEnv,
  syncHotelPublicationToAlgolia,
} from './sync-hotel.js';
export {
  DEFAULT_HOTEL_SYNONYMS_EN,
  DEFAULT_HOTEL_SYNONYMS_FR,
  defaultHotelSynonyms,
  type SynonymEntry,
} from './synonyms.js';
export {
  AlgoliaCityRecordSchema,
  AlgoliaHotelRecordSchema,
  CitySourceRowSchema,
  HotelSourceRowSchema,
  type AlgoliaCityRecord,
  type AlgoliaHotelRecord,
  type CitySourceRow,
  type HotelSourceRow,
} from './types.js';
