import 'server-only';

import { algoliasearch } from 'algoliasearch';
import {
  AlgoliaCityRecordSchema,
  citiesIndexName,
  type AlgoliaCityRecord,
  type SearchLocale,
} from '@cct/integrations/algolia-hotel-catalog';

import { env } from '@/lib/env';

const CITY_RECORD_KEYS = [
  'objectID',
  'name',
  'region',
  'country_code',
  'aliases',
  'slug',
  'url_path',
  'hotels_count',
  'is_popular',
  'popularity_score',
] as const;

function pickCityHitFields(hit: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CITY_RECORD_KEYS) {
    if (key in hit) {
      const value = hit[key];
      if (value !== undefined) {
        out[key] = value;
      }
    }
  }
  return out;
}

export async function searchCitiesCatalogOnServer(
  locale: SearchLocale,
  query: string,
  hitsPerPage: number,
): Promise<readonly AlgoliaCityRecord[]> {
  const client = algoliasearch(env.NEXT_PUBLIC_ALGOLIA_APP_ID, env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY);
  try {
    const res = await client.searchSingleIndex<Record<string, unknown>>({
      indexName: citiesIndexName(env.ALGOLIA_INDEX_PREFIX, locale),
      searchParams: {
        query,
        hitsPerPage,
        attributesToRetrieve: [...CITY_RECORD_KEYS],
      },
    });

    const out: AlgoliaCityRecord[] = [];
    for (const hit of res.hits) {
      const parsed = AlgoliaCityRecordSchema.safeParse(pickCityHitFields(hit));
      if (parsed.success) {
        out.push(parsed.data);
      }
    }
    return out;
  } catch {
    return [];
  }
}
