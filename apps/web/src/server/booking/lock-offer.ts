import 'server-only';

import { startDraftFromOffer, type Offer } from '@cct/domain/booking';
import { err, ok, type Result } from '@cct/domain/shared';

import { getAmadeusClient } from '@/lib/amadeus';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

import { createFakeOfferForDev, isFakeOffersEnabled } from './dev-fake-offer';
import { getFakePaidHotelHead } from './dev-fake-hotel';
import { saveDraft, type DraftHotelSnapshot } from './draft-store';

export interface LockOfferInput {
  readonly offerId: string;
  readonly hotelId: string;
  readonly locale: 'fr' | 'en';
  /**
   * Dev/preview only. When `true` AND `NODE_ENV !== 'production'`, the
   * Amadeus `priceOffer` call is bypassed in favour of a synthetic offer
   * derived from the provided stay/guest counts. Lets you exercise the
   * full tunnel without live GDS credentials.
   */
  readonly fake?: boolean;
  readonly stay?: { readonly checkIn: string; readonly checkOut: string };
  readonly guests?: { readonly adults: number; readonly children: number };
}

export type LockOfferError =
  | { readonly kind: 'offer_expired' }
  | { readonly kind: 'offer_not_available' }
  | { readonly kind: 'pricing_changed' }
  | { readonly kind: 'hotel_not_bookable_online'; readonly hotelId: string }
  | { readonly kind: 'upstream'; readonly details: string }
  | { readonly kind: 'invariant'; readonly details: string };

export interface LockOfferSuccess {
  readonly draftId: string;
  readonly ttlSec: number;
  readonly hotelName: string;
}

async function fetchHotelSnapshot(hotelId: string): Promise<DraftHotelSnapshot | null> {
  const fake = getFakePaidHotelHead(hotelId);
  if (fake !== null) {
    return { id: fake.id, name: fake.name, city: fake.city, region: fake.region };
  }
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('hotels')
      .select('id, name, city, region, booking_mode, is_published')
      .eq('id', hotelId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      id: string;
      name: string;
      city: string;
      region: string;
      booking_mode: string;
      is_published: boolean;
    };
    if (!row.is_published) return null;
    if (row.booking_mode !== 'amadeus' && row.booking_mode !== 'little') return null;
    return { id: row.id, name: row.name, city: row.city, region: row.region };
  } catch {
    // Missing Supabase env or transient outage: caller surfaces a
    // `hotel_not_bookable_online` error to the visitor rather than 500.
    return null;
  }
}

function newDraftId(): string {
  return crypto.randomUUID();
}

/**
 * Wave C entry point — `priceOffer` against Amadeus, build a `BookingDraft`
 * in state `offer_locked`, persist it in Redis with TTL = remaining offer
 * lock window. Caller (route handler) sets the draft-id cookie and
 * redirects to `/reservation/invite`.
 */
export async function lockOffer(
  input: LockOfferInput,
): Promise<Result<LockOfferSuccess, LockOfferError>> {
  const hotel = await fetchHotelSnapshot(input.hotelId);
  if (!hotel) {
    return err({ kind: 'hotel_not_bookable_online', hotelId: input.hotelId });
  }

  let offer: Offer;
  if (input.fake === true && isFakeOffersEnabled()) {
    if (input.stay === undefined || input.guests === undefined) {
      return err({
        kind: 'invariant',
        details: 'fake mode requires explicit stay and guests inputs',
      });
    }
    offer = createFakeOfferForDev({
      hotelId: input.hotelId,
      stay: input.stay,
      guests: input.guests,
    });
  } else {
    const amadeus = getAmadeusClient();
    const priced = await amadeus.priceOffer({ offerId: input.offerId });
    if (!priced.ok) {
      const e = priced.error;
      switch (e.kind) {
        case 'offer_expired':
          return err({ kind: 'offer_expired' });
        case 'offer_not_available':
          return err({ kind: 'offer_not_available' });
        case 'pricing_changed':
          return err({ kind: 'pricing_changed' });
        case 'http':
          return err({ kind: 'upstream', details: `http_${e.error.kind}` });
        case 'parse_failure':
        case 'mapping_failure':
        case 'oauth_rejected':
        case 'not_implemented':
          return err({ kind: 'upstream', details: e.kind });
      }
    }
    offer = priced.value.offer;
  }
  if (offer.hotelId !== input.hotelId) {
    return err({
      kind: 'invariant',
      details: `offer.hotelId ${offer.hotelId} does not match request ${input.hotelId}`,
    });
  }

  const draft = startDraftFromOffer({
    id: newDraftId(),
    mode: 'amadeus',
    offer,
  });

  const expiresAtMs = Date.parse(offer.expiresAt);
  const ttlSec = Number.isFinite(expiresAtMs)
    ? Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000))
    : 10 * 60;

  await saveDraft(
    {
      draft,
      hotel,
      locale: input.locale,
    },
    ttlSec,
  );

  return ok({ draftId: draft.id, ttlSec, hotelName: hotel.name });
}
