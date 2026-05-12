import 'server-only';

import {
  FAKE_HOTEL_DETAIL_SLUG_EN,
  FAKE_HOTEL_DETAIL_SLUG_FR,
  getFakeHotelDetailBySlug,
  isFakeHotelDetailEnabled,
} from '@/server/hotels/dev-fake-hotel-detail';
import type { HotelRoomDetail, HotelRoomDetailRow } from '@/server/hotels/get-room-by-slug';
import type { SupportedLocale } from '@/server/hotels/get-hotel-by-slug';

/**
 * Dev/E2E-only synthetic room-detail fixture for
 * `/[locale]/hotel/[slug]/chambres/[roomSlug]`. Same activation contract
 * as `dev-fake-hotel-detail.ts`:
 *
 *  - Reads `CCT_E2E_FAKE_HOTEL_ID` (the canonical UUID exposed to the
 *    tests via `e2e/fixtures/env.ts`).
 *  - Only fires when the hotel slug matches one of the fake hotel slugs
 *    AND the room slug matches one of the two fake rooms declared by
 *    `dev-fake-hotel-detail.ts#buildRooms`.
 *
 * Why a dedicated fixture? `getRoomBySlug` reads `hotel_rooms` directly
 * from Supabase — the fake hotel-detail seam doesn't help here. We re-use
 * the fake hotel + handcraft the room shape so the JSON-LD / CSP-nonce
 * E2E surface gets full coverage without seeding the real DB.
 */

const FAKE_ROOM_SLUG_DELUXE_KING = 'chambre-deluxe-roi';
const FAKE_ROOM_SLUG_JUNIOR_SUITE = 'suite-junior-tuileries';

const FAKE_ROOMS: Readonly<Record<string, HotelRoomDetailRow>> = {
  [FAKE_ROOM_SLUG_DELUXE_KING]: {
    id: '22222222-2222-4222-8222-222222222222',
    slug: FAKE_ROOM_SLUG_DELUXE_KING,
    roomCode: 'TEST-KING',
    name: 'Chambre Deluxe Roi',
    shortDescription: 'Vue jardin, lit king-size, salle de bain en marbre.',
    longDescription:
      'Chambre fictive servant aux tests E2E. Lit king-size, vue jardin, salle de bain en marbre, dressing privatif. Idéale pour valider le rendu de la sous-page chambre sans seed Supabase.',
    maxOccupancy: 2,
    bedType: 'King',
    sizeSqm: 35,
    amenities: ['Vue jardin', 'Lit king-size', 'Salle de bain marbre'],
    heroImage: null,
    images: [],
    isSignature: false,
    indicativePrice: { fromMinor: 95000, toMinor: 130000, currency: 'EUR' },
  },
  [FAKE_ROOM_SLUG_JUNIOR_SUITE]: {
    id: '33333333-3333-4333-8333-333333333333',
    slug: FAKE_ROOM_SLUG_JUNIOR_SUITE,
    roomCode: 'TEST-SUITE',
    name: 'Suite Junior Tuileries',
    shortDescription: 'Vue Tuileries, salon séparé, bain à remous.',
    longDescription:
      'Suite Junior fictive avec vue sur les Tuileries, salon séparé, bain à remous, dressing. Référencée par les tests E2E de la fiche chambre.',
    maxOccupancy: 3,
    bedType: 'King',
    sizeSqm: 55,
    amenities: ['Vue Tuileries', 'Salon séparé', 'Bain à remous'],
    heroImage: null,
    images: [],
    isSignature: true,
    indicativePrice: { fromMinor: 220000, toMinor: null, currency: 'EUR' },
  },
};

function isFakeHotelSlug(slug: string): boolean {
  return slug === FAKE_HOTEL_DETAIL_SLUG_FR || slug === FAKE_HOTEL_DETAIL_SLUG_EN;
}

/**
 * Returns the synthetic room detail when the seam is enabled AND both the
 * hotel slug and the room slug match a fake fixture. Returns `null`
 * otherwise so the caller falls through to the real Supabase lookup.
 */
export function getFakeRoomBySlug(
  hotelSlug: string,
  roomSlug: string,
  locale: SupportedLocale,
): HotelRoomDetail | null {
  if (!isFakeHotelDetailEnabled()) return null;
  if (!isFakeHotelSlug(hotelSlug)) return null;
  const room = FAKE_ROOMS[roomSlug];
  if (room === undefined) return null;
  const hotel = getFakeHotelDetailBySlug(hotelSlug, locale);
  if (hotel === null) return null;
  return { hotel, room };
}
