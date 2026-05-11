/**
 * Default index settings for `hotels_<locale>` (skill: search-engineering).
 * Call once per index via `AlgoliaIndexingService.configureHotelsIndex`.
 */
export const DEFAULT_HOTELS_INDEX_SETTINGS = {
  searchableAttributes: [
    'name',
    'city',
    'district',
    'region',
    'landmarks',
    'aliases',
    'description_excerpt',
    'amenities_top',
  ],
  attributesForFaceting: [
    'searchable(region)',
    'searchable(city)',
    'is_palace',
    'stars',
    'searchable(themes)',
    'is_little_catalog',
    'priority',
  ],
  customRanking: ['desc(priority_score)', 'desc(google_rating)', 'desc(google_reviews_count)'],
};
