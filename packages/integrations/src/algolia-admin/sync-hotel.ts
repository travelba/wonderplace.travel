import { loadSharedEnv, type SharedEnv } from '@cct/config/env';
import { err, type Result } from '@cct/domain/shared';

import type { AlgoliaIndexingError } from './errors.js';
import { AlgoliaHotelRecordSchema, HotelSourceRowSchema, type HotelSourceRow } from './types.js';
import { createAlgoliaIndexingService, type AlgoliaIndexingService } from './indexing-service.js';
import { buildHotelAlgoliaRecord } from './map-hotel-record.js';

export function createAlgoliaIndexingServiceFromSharedEnv(
  source?: SharedEnv,
): AlgoliaIndexingService {
  const env = source ?? loadSharedEnv();
  return createAlgoliaIndexingService({
    appId: env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    apiKey: env.ALGOLIA_ADMIN_API_KEY,
    indexPrefix: env.ALGOLIA_INDEX_PREFIX,
  });
}

/**
 * Mirrors Payload publish rules: unpublished → delete objects; published → FR + EN indices.
 */
export async function syncHotelPublicationToAlgolia(
  svc: AlgoliaIndexingService,
  raw: HotelSourceRow,
): Promise<Result<void, AlgoliaIndexingError>> {
  const parsed = HotelSourceRowSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const details = first ? `${first.path.join('.')}: ${first.message}` : 'invalid payload';
    return err({ kind: 'invalid_hotel_payload', details });
  }

  const row = parsed.data;
  if (!row.is_published) {
    return svc.deleteHotelAllLocales(row.id);
  }

  const fr = AlgoliaHotelRecordSchema.safeParse(buildHotelAlgoliaRecord('fr', row));
  const en = AlgoliaHotelRecordSchema.safeParse(buildHotelAlgoliaRecord('en', row));
  if (!fr.success) {
    return err({ kind: 'invalid_hotel_payload', details: `fr mapper: ${fr.error.message}` });
  }
  if (!en.success) {
    return err({ kind: 'invalid_hotel_payload', details: `en mapper: ${en.error.message}` });
  }

  const rFr = await svc.upsertHotelRecord('fr', fr.data);
  if (!rFr.ok) return rFr;
  return svc.upsertHotelRecord('en', en.data);
}
