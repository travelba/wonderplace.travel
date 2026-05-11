import 'server-only';

import { algoliasearch } from 'algoliasearch';
import {
  AlgoliaHotelRecordSchema,
  hotelsIndexName,
  type AlgoliaHotelRecord,
  type SearchLocale,
} from '@cct/integrations/algolia-hotel-catalog';

import { env } from '@/lib/env';

const HOTEL_RECORD_KEYS = [
  'objectID',
  'name',
  'city',
  'district',
  'region',
  'landmarks',
  'aliases',
  'description_excerpt',
  'amenities_top',
  'themes',
  'slug',
  'url_path',
  'is_palace',
  'stars',
  'is_little_catalog',
  'priority',
  'priority_score',
  'google_rating',
  'google_reviews_count',
] as const;

function pickHotelHitFields(hit: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of HOTEL_RECORD_KEYS) {
    if (key in hit) {
      const value = hit[key];
      if (value !== undefined) {
        out[key] = value;
      }
    }
  }
  return out;
}

/**
 * Server-only catalog search (search-only Algolia API key — skill: search-engineering).
 *
 * Degrades gracefully to an empty result set whenever Algolia is
 * unreachable OR the env vars are absent (CI smoke build, preview).
 * The whole function body sits inside one try/catch so even the
 * `algoliasearch()` constructor can throw without bringing down the
 * route.
 */
export async function searchHotelsCatalogOnServer(
  locale: SearchLocale,
  query: string,
  hitsPerPage: number,
): Promise<readonly AlgoliaHotelRecord[]> {
  try {
    const appId = env.NEXT_PUBLIC_ALGOLIA_APP_ID;
    const searchKey = env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
    if (!appId || !searchKey) return [];

    const client = algoliasearch(appId, searchKey);
    const res = await client.searchSingleIndex<Record<string, unknown>>({
      indexName: hotelsIndexName(env.ALGOLIA_INDEX_PREFIX, locale),
      searchParams: {
        query,
        hitsPerPage,
        attributesToRetrieve: [...HOTEL_RECORD_KEYS],
      },
    });

    const out: AlgoliaHotelRecord[] = [];
    for (const hit of res.hits) {
      const parsed = AlgoliaHotelRecordSchema.safeParse(pickHotelHitFields(hit));
      if (parsed.success) {
        out.push(parsed.data);
      }
    }
    return out;
  } catch (e) {
    if (process.env['NODE_ENV'] !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[hotels-catalog] search failed:', e);
    }
    return [];
  }
}
