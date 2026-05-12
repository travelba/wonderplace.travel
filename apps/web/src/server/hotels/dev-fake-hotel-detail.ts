import 'server-only';

import type {
  HotelDetail,
  HotelDetailRow,
  HotelRoomRow,
  SupportedLocale,
} from '@/server/hotels/get-hotel-by-slug';

/**
 * Dev/E2E-only synthetic hotel-detail fixture for `/[locale]/hotel/[slug]`.
 * Same activation contract as `dev-fake-hotel.ts`:
 *
 *  - Reads `CCT_E2E_FAKE_HOTEL_ID` (the canonical UUID exposed to the
 *    tests via `e2e/fixtures/env.ts`).
 *  - Both the FR slug (`hotel-de-test-e2e`) and the EN slug
 *    (`hotel-de-test-e2e-en`) resolve to the same synthetic detail.
 *  - The fake hotel is published, email-mode, located in Paris with
 *    real-looking lat/long so the JSON-LD `geo` block is exercised.
 *
 * The shape MUST stay aligned with `HotelDetailRow` — when that schema
 * changes the seam is the first thing to update. The `id` matches the
 * fake offer seam so the same hotel can drive the booking-email tunnel
 * spec too.
 */

export const FAKE_HOTEL_DETAIL_SLUG_FR = 'hotel-de-test-e2e';
export const FAKE_HOTEL_DETAIL_SLUG_EN = 'hotel-de-test-e2e-en';

function configuredFakeId(): string | undefined {
  const raw = process.env['CCT_E2E_FAKE_HOTEL_ID'];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function buildRow(locale: SupportedLocale): HotelDetailRow {
  const id = configuredFakeId() ?? '00000000-0000-0000-0000-000000000000';
  return {
    id,
    slug: FAKE_HOTEL_DETAIL_SLUG_FR,
    slug_en: FAKE_HOTEL_DETAIL_SLUG_EN,
    name: 'Hôtel de Test (E2E)',
    name_en: 'Test Hotel (E2E)',
    stars: 5,
    is_palace: false,
    region: 'Île-de-France',
    department: 'Paris',
    city: 'Paris',
    district: '1er arrondissement',
    address: '1 rue de Rivoli',
    postal_code: '75001',
    latitude: 48.8566,
    longitude: 2.3522,
    description_fr:
      'Un hôtel fictif servant aux tests end-to-end. La description française décrit un établissement parisien intimiste idéal pour valider la fiche hôtel.\n\nDeuxième paragraphe pour exercer le rendu multi-paragraphe.',
    description_en:
      'A synthetic hotel used for end-to-end testing. This English description verifies locale fallback in the public detail page.',
    highlights: ['Vue sur les Tuileries', 'Spa privé', 'Conciergerie 24/7'],
    amenities: ['Wi-Fi gratuit', 'Petit-déjeuner inclus', 'Animaux acceptés'],
    faq_content: [
      {
        question_fr: 'Quel est l’horaire du check-in ?',
        question_en: 'What is the check-in time?',
        answer_fr: 'À partir de 15h00.',
        answer_en: 'From 3:00 PM.',
      },
      {
        question_fr: 'Le petit-déjeuner est-il inclus ?',
        question_en: 'Is breakfast included?',
        answer_fr: 'Oui, dans tous les tarifs.',
        answer_en: 'Yes, included in every rate.',
      },
    ],
    meta_title_fr: null,
    meta_title_en: null,
    meta_desc_fr: null,
    meta_desc_en: null,
    // `email` so the booking section renders the "request via email" CTA
    // — keeps the fake hotel testable without firing any Amadeus stub.
    booking_mode: 'email',
    // Email-mode → no Amadeus property code. Sentiment fetch is skipped
    // upstream when this is null, which means E2E doesn't need to mock
    // any Amadeus rating endpoint.
    amadeus_hotel_id: null,
    priority: 'P1',
    google_rating: 4.7,
    google_reviews_count: 312,
    phone_e164: '+33199990000',
    // Editorial history (Phase 11.2). The synthetic E2E hotel inherits a
    // deterministic 2010 opening — old enough to populate the JSON-LD
    // `foundingDate` field but not so old it tempts smoke tests into
    // asserting on real historical hotels.
    opened_at: '2010-06-01',
    last_renovated_at: null,
    is_published: true,
    updated_at: '2026-05-01T10:00:00.000Z',
    // Inventory counts surface in JSON-LD Hotel.numberOfRooms and the
    // HotelFactSheet UI. Synthetic values for the E2E hotel are fine; the
    // JSON-LD only emits them when positive.
    number_of_rooms: 80,
    number_of_suites: 12,
    // No hero/gallery for the E2E synthetic hotel — keeps the fake
    // testable without Cloudinary credentials at build time.
    hero_image: null,
    // `locale` reserved for future locale-conditional fields — currently
    // unused but kept in the signature so it's obvious the row CAN vary.
    ...(locale === 'en' ? {} : {}),
  };
}

function buildRooms(): readonly HotelRoomRow[] {
  return [
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'chambre-deluxe-roi',
      room_code: 'TEST-KING',
      name: 'Chambre Deluxe Roi',
      description: 'Vue jardin, lit king-size, salle de bain en marbre.',
      max_occupancy: 2,
      bed_type: 'King',
      size_sqm: 35,
      amenities: ['Vue jardin', 'Lit king-size', 'Salle de bain marbre'],
      isSignature: false,
      indicativePrice: { fromMinor: 95000, toMinor: 130000, currency: 'EUR' },
      displayOrder: 20,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'suite-junior-tuileries',
      room_code: 'TEST-SUITE',
      name: 'Suite Junior Tuileries',
      description: 'Vue Tuileries, salon séparé, bain à remous.',
      max_occupancy: 3,
      bed_type: 'King',
      size_sqm: 55,
      amenities: ['Vue Tuileries', 'Salon séparé', 'Bain à remous'],
      isSignature: true,
      indicativePrice: { fromMinor: 220000, toMinor: null, currency: 'EUR' },
      displayOrder: 10,
    },
  ];
}

export function isFakeHotelDetailEnabled(): boolean {
  return configuredFakeId() !== undefined;
}

/**
 * Returns the synthetic detail when the seam is enabled AND the slug
 * matches one of the fake slugs. Returns `null` otherwise so the
 * caller falls through to the real Supabase lookup.
 */
export function getFakeHotelDetailBySlug(
  slug: string,
  locale: SupportedLocale,
): HotelDetail | null {
  if (!isFakeHotelDetailEnabled()) return null;
  if (slug !== FAKE_HOTEL_DETAIL_SLUG_FR && slug !== FAKE_HOTEL_DETAIL_SLUG_EN) return null;
  return { row: buildRow(locale), rooms: buildRooms() };
}
