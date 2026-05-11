import { err, ok, type Result } from '@cct/domain/shared';
import { algoliasearch, type Algoliasearch } from 'algoliasearch';

import { DEFAULT_CITIES_INDEX_SETTINGS } from './city-index-settings.js';
import type { AlgoliaIndexingError } from './errors.js';
import { DEFAULT_HOTELS_INDEX_SETTINGS } from './hotel-index-settings.js';
import { citiesIndexName, hotelsIndexName, type SearchLocale } from './index-names.js';
import type { SynonymEntry } from './synonyms.js';
import type { AlgoliaCityRecord, AlgoliaHotelRecord } from './types.js';

export type AlgoliaIndexingConfig = {
  readonly appId: string;
  readonly apiKey: string;
  readonly indexPrefix: string;
};

function mapCaughtError(e: unknown): AlgoliaIndexingError {
  if (
    e !== null &&
    typeof e === 'object' &&
    'message' in e &&
    typeof (e as { message: unknown }).message === 'string'
  ) {
    const message = (e as { message: string }).message;
    if ('status' in e && typeof (e as { status: unknown }).status === 'number') {
      return { kind: 'algolia_upstream', message, status: (e as { status: number }).status };
    }
    return { kind: 'algolia_upstream', message };
  }
  return { kind: 'algolia_upstream', message: 'unknown Algolia error' };
}

const LOCALES: readonly SearchLocale[] = ['fr', 'en'];

export class AlgoliaIndexingService {
  private readonly client: Algoliasearch;
  readonly indexPrefix: string;

  constructor(cfg: AlgoliaIndexingConfig) {
    this.client = algoliasearch(cfg.appId, cfg.apiKey);
    this.indexPrefix = cfg.indexPrefix;
  }

  async configureHotelsIndex(locale: SearchLocale): Promise<Result<void, AlgoliaIndexingError>> {
    try {
      await this.client.setSettings({
        indexName: hotelsIndexName(this.indexPrefix, locale),
        indexSettings: { ...DEFAULT_HOTELS_INDEX_SETTINGS },
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err(mapCaughtError(e));
    }
  }

  async upsertHotelRecord(
    locale: SearchLocale,
    record: AlgoliaHotelRecord,
  ): Promise<Result<void, AlgoliaIndexingError>> {
    try {
      await this.client.saveObjects({
        indexName: hotelsIndexName(this.indexPrefix, locale),
        objects: [record],
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err(mapCaughtError(e));
    }
  }

  async deleteHotelRecord(
    locale: SearchLocale,
    objectId: string,
  ): Promise<Result<void, AlgoliaIndexingError>> {
    try {
      await this.client.deleteObject({
        indexName: hotelsIndexName(this.indexPrefix, locale),
        objectID: objectId,
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err(mapCaughtError(e));
    }
  }

  async deleteHotelAllLocales(objectId: string): Promise<Result<void, AlgoliaIndexingError>> {
    for (const loc of LOCALES) {
      const r = await this.deleteHotelRecord(loc, objectId);
      if (!r.ok) return r;
    }
    return ok(undefined);
  }

  async configureCitiesIndex(locale: SearchLocale): Promise<Result<void, AlgoliaIndexingError>> {
    try {
      await this.client.setSettings({
        indexName: citiesIndexName(this.indexPrefix, locale),
        indexSettings: { ...DEFAULT_CITIES_INDEX_SETTINGS },
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err(mapCaughtError(e));
    }
  }

  async upsertCityRecord(
    locale: SearchLocale,
    record: AlgoliaCityRecord,
  ): Promise<Result<void, AlgoliaIndexingError>> {
    try {
      await this.client.saveObjects({
        indexName: citiesIndexName(this.indexPrefix, locale),
        objects: [record],
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err(mapCaughtError(e));
    }
  }

  async deleteCityRecord(
    locale: SearchLocale,
    objectId: string,
  ): Promise<Result<void, AlgoliaIndexingError>> {
    try {
      await this.client.deleteObject({
        indexName: citiesIndexName(this.indexPrefix, locale),
        objectID: objectId,
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err(mapCaughtError(e));
    }
  }

  async deleteCityAllLocales(objectId: string): Promise<Result<void, AlgoliaIndexingError>> {
    for (const loc of LOCALES) {
      const r = await this.deleteCityRecord(loc, objectId);
      if (!r.ok) return r;
    }
    return ok(undefined);
  }

  /**
   * Replaces the synonym set for `hotels_<locale>`. Always uses
   * `replaceExistingSynonyms: true` so default seed lists are idempotent.
   */
  async setHotelsSynonyms(
    locale: SearchLocale,
    entries: readonly SynonymEntry[],
  ): Promise<Result<void, AlgoliaIndexingError>> {
    try {
      await this.client.saveSynonyms({
        indexName: hotelsIndexName(this.indexPrefix, locale),
        synonymHit: entries.map((e) => ({
          objectID: e.objectID,
          type: 'synonym',
          synonyms: [...e.synonyms],
        })),
        replaceExistingSynonyms: true,
      });
      return ok(undefined);
    } catch (e: unknown) {
      return err(mapCaughtError(e));
    }
  }
}

export function createAlgoliaIndexingService(cfg: AlgoliaIndexingConfig): AlgoliaIndexingService {
  return new AlgoliaIndexingService(cfg);
}
