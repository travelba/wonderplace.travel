/**
 * Default index settings for `cities_<locale>` (skill: search-engineering).
 * Cities power destination autocomplete in headers and the search page.
 */
export const DEFAULT_CITIES_INDEX_SETTINGS = {
  searchableAttributes: ['name', 'aliases', 'region'],
  attributesForFaceting: ['searchable(region)', 'country_code', 'is_popular'],
  customRanking: ['desc(popularity_score)', 'desc(hotels_count)'],
};
