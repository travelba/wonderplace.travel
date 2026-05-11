import type { SearchLocale } from './index-names.js';
import type { AlgoliaCityRecord, CitySourceRow } from './types.js';

const ALIASES_MAX = 10;
const POPULARITY_POPULAR_BOOST = 1000;

/**
 * `hotels_count` dominates ranking; `is_popular` provides an editorial boost
 * for cornerstone destinations regardless of inventory size.
 */
export function popularityScore(row: CitySourceRow): number {
  const base = row.hotels_count;
  return row.is_popular ? base + POPULARITY_POPULAR_BOOST : base;
}

function trimmedAliases(raw: readonly string[] | undefined): string[] {
  if (raw === undefined) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.length > 0) {
      out.push(item);
    }
    if (out.length >= ALIASES_MAX) break;
  }
  return out;
}

export function buildCityAlgoliaRecord(
  locale: SearchLocale,
  row: CitySourceRow,
): AlgoliaCityRecord {
  const name =
    locale === 'fr'
      ? row.name
      : row.name_en !== null && row.name_en !== undefined && row.name_en !== ''
        ? row.name_en
        : row.name;
  const slug =
    locale === 'en'
      ? row.slug_en !== null && row.slug_en !== undefined && row.slug_en !== ''
        ? row.slug_en
        : row.slug
      : row.slug;
  const aliases = trimmedAliases(row.aliases);
  const urlPath = locale === 'fr' ? `/destinations/${slug}` : `/en/destinations/${slug}`;

  const base: AlgoliaCityRecord = {
    objectID: row.id,
    name,
    region: row.region,
    country_code: row.country_code,
    slug,
    url_path: urlPath,
    hotels_count: row.hotels_count,
    is_popular: row.is_popular,
    popularity_score: popularityScore(row),
  };

  if (aliases.length > 0) {
    return { ...base, aliases };
  }
  return base;
}
