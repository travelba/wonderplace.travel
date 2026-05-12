import { describe, expect, it } from 'vitest';

import {
  HotelDetailRowSchema,
  readHotelHistoryDates,
  type HotelDetailRow,
} from './get-hotel-by-slug';

/**
 * Build a minimal valid HotelDetailRow with the date fields overridden.
 * The base row only needs to satisfy the schema; every other field can
 * be a sensible "absent" value because the reader under test only looks
 * at `opened_at` / `last_renovated_at`.
 */
function makeRow(overrides: {
  opened_at: string | null;
  last_renovated_at: string | null;
}): HotelDetailRow {
  return HotelDetailRowSchema.parse({
    id: '00000000-0000-0000-0000-000000000000',
    slug: 'test-hotel',
    slug_en: null,
    name: 'Test Hotel',
    name_en: null,
    stars: 5,
    is_palace: false,
    region: 'Île-de-France',
    department: null,
    city: 'Paris',
    district: null,
    address: null,
    postal_code: null,
    latitude: null,
    longitude: null,
    description_fr: null,
    description_en: null,
    highlights: null,
    amenities: null,
    faq_content: null,
    restaurant_info: null,
    spa_info: null,
    points_of_interest: null,
    transports: null,
    policies: null,
    awards: null,
    signature_experiences: null,
    featured_reviews: null,
    hero_image: null,
    gallery_images: null,
    long_description_sections: null,
    number_of_rooms: null,
    number_of_suites: null,
    meta_title_fr: null,
    meta_title_en: null,
    meta_desc_fr: null,
    meta_desc_en: null,
    booking_mode: 'display_only',
    amadeus_hotel_id: null,
    priority: 'P1',
    google_rating: null,
    google_reviews_count: null,
    phone_e164: null,
    opened_at: overrides.opened_at,
    last_renovated_at: overrides.last_renovated_at,
    is_published: true,
    updated_at: '2026-05-12T00:00:00Z',
  });
}

describe('readHotelHistoryDates', () => {
  it('returns null for all fields when both columns are null', () => {
    const row = makeRow({ opened_at: null, last_renovated_at: null });
    expect(readHotelHistoryDates(row)).toEqual({
      openedDate: null,
      openedYear: null,
      lastRenovatedDate: null,
      lastRenovatedYear: null,
    });
  });

  it('parses a well-formed opening date', () => {
    const row = makeRow({ opened_at: '1908-04-01', last_renovated_at: null });
    expect(readHotelHistoryDates(row)).toEqual({
      openedDate: '1908-04-01',
      openedYear: 1908,
      lastRenovatedDate: null,
      lastRenovatedYear: null,
    });
  });

  it('parses both opening and renovation dates', () => {
    const row = makeRow({ opened_at: '1908-04-01', last_renovated_at: '2014-08-01' });
    expect(readHotelHistoryDates(row)).toEqual({
      openedDate: '1908-04-01',
      openedYear: 1908,
      lastRenovatedDate: '2014-08-01',
      lastRenovatedYear: 2014,
    });
  });

  it('drops malformed strings silently', () => {
    expect(
      readHotelHistoryDates(makeRow({ opened_at: 'not-a-date', last_renovated_at: null })),
    ).toEqual({
      openedDate: null,
      openedYear: null,
      lastRenovatedDate: null,
      lastRenovatedYear: null,
    });
    expect(readHotelHistoryDates(makeRow({ opened_at: '1908', last_renovated_at: null }))).toEqual({
      openedDate: null,
      openedYear: null,
      lastRenovatedDate: null,
      lastRenovatedYear: null,
    });
  });

  it('drops out-of-range years defensively (pre-1500 or far future)', () => {
    expect(
      readHotelHistoryDates(makeRow({ opened_at: '1100-01-01', last_renovated_at: null })),
    ).toEqual({
      openedDate: null,
      openedYear: null,
      lastRenovatedDate: null,
      lastRenovatedYear: null,
    });
    expect(
      readHotelHistoryDates(makeRow({ opened_at: '3000-01-01', last_renovated_at: null })),
    ).toEqual({
      openedDate: null,
      openedYear: null,
      lastRenovatedDate: null,
      lastRenovatedYear: null,
    });
  });

  it('trims leading and trailing whitespace before parsing', () => {
    const row = makeRow({ opened_at: '  1908-04-01  ', last_renovated_at: null });
    expect(readHotelHistoryDates(row)).toEqual({
      openedDate: '1908-04-01',
      openedYear: 1908,
      lastRenovatedDate: null,
      lastRenovatedYear: null,
    });
  });
});
