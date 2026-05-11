import { err, type Result } from '@cct/domain/shared';

import type { AlgoliaIndexingError } from './errors.js';
import { buildCityAlgoliaRecord } from './map-city-record.js';
import type { AlgoliaIndexingService } from './indexing-service.js';
import { AlgoliaCityRecordSchema, CitySourceRowSchema, type CitySourceRow } from './types.js';

/**
 * Mirrors Payload publish rules for cities: unpublished → delete from both
 * locales, published → upsert FR + EN records.
 */
export async function syncCityPublicationToAlgolia(
  svc: AlgoliaIndexingService,
  raw: CitySourceRow,
): Promise<Result<void, AlgoliaIndexingError>> {
  const parsed = CitySourceRowSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const details = first ? `${first.path.join('.')}: ${first.message}` : 'invalid payload';
    return err({ kind: 'invalid_hotel_payload', details });
  }

  const row = parsed.data;
  if (!row.is_published) {
    return svc.deleteCityAllLocales(row.id);
  }

  const fr = AlgoliaCityRecordSchema.safeParse(buildCityAlgoliaRecord('fr', row));
  const en = AlgoliaCityRecordSchema.safeParse(buildCityAlgoliaRecord('en', row));
  if (!fr.success) {
    return err({ kind: 'invalid_hotel_payload', details: `fr city mapper: ${fr.error.message}` });
  }
  if (!en.success) {
    return err({ kind: 'invalid_hotel_payload', details: `en city mapper: ${en.error.message}` });
  }

  const rFr = await svc.upsertCityRecord('fr', fr.data);
  if (!rFr.ok) return rFr;
  return svc.upsertCityRecord('en', en.data);
}
