/**
 * Public surface for Algolia **catalog search** in `apps/web`.
 * Do not import `./index` from the web app: the admin barrel uses `.js`
 * import specifiers that Next.js/webpack cannot resolve from TypeScript sources.
 */
export type { AlgoliaCityRecord, AlgoliaHotelRecord } from './types';
export { AlgoliaCityRecordSchema, AlgoliaHotelRecordSchema } from './types';
export { citiesIndexName, hotelsIndexName, type SearchLocale } from './index-names';
