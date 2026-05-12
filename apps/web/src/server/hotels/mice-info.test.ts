import { describe, expect, it } from 'vitest';

import { readMiceInfo, type HotelDetailRow } from './get-hotel-by-slug';

/**
 * Build a minimal HotelDetailRow with `mice_info` set to the value
 * under test. Every other field is irrelevant to this reader and
 * stubbed with the smallest legal placeholder; `readMiceInfo` is a
 * pure projection of `row.mice_info`.
 */
function rowWith(mice: unknown): HotelDetailRow {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    slug: 'x',
    slug_en: null,
    name: 'X',
    name_en: null,
    stars: 5,
    is_palace: false,
    region: 'R',
    department: null,
    city: 'C',
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
    priority: 'P2',
    google_rating: null,
    google_reviews_count: null,
    phone_e164: null,
    opened_at: null,
    last_renovated_at: null,
    virtual_tour_url: null,
    mice_info: mice,
    is_published: true,
    updated_at: null,
  };
}

const MIN_VALID = {
  contact_email: 'events@example.com',
  total_capacity_seated: 200,
  spaces: [
    {
      key: 'grand-salon',
      name: 'Grand Salon',
      surface_sqm: 280,
      max_seated: 200,
    },
  ],
};

describe('readMiceInfo', () => {
  it('returns null when the column is null', () => {
    expect(readMiceInfo(rowWith(null), 'fr')).toBeNull();
  });

  it('returns null when the column is undefined (legacy rows)', () => {
    expect(readMiceInfo(rowWith(undefined), 'fr')).toBeNull();
  });

  it('returns null on a plain string (DB CHECK is permissive on app-side)', () => {
    expect(readMiceInfo(rowWith('events@example.com'), 'fr')).toBeNull();
  });

  it('returns null when contact_email is missing', () => {
    expect(
      readMiceInfo(
        rowWith({
          total_capacity_seated: 200,
          spaces: [{ key: 'a', name: 'A', surface_sqm: 50, max_seated: 30 }],
        }),
        'fr',
      ),
    ).toBeNull();
  });

  it('returns null when contact_email is malformed', () => {
    expect(readMiceInfo(rowWith({ ...MIN_VALID, contact_email: 'not-an-email' }), 'fr')).toBeNull();
  });

  it('returns null when spaces array is empty', () => {
    expect(readMiceInfo(rowWith({ ...MIN_VALID, spaces: [] }), 'fr')).toBeNull();
  });

  it('returns null when a space carries a non-kebab key', () => {
    expect(
      readMiceInfo(
        rowWith({
          ...MIN_VALID,
          spaces: [{ key: 'Grand Salon!', name: 'A', surface_sqm: 50, max_seated: 30 }],
        }),
        'fr',
      ),
    ).toBeNull();
  });

  it('returns null when a space carries a negative max_seated', () => {
    expect(
      readMiceInfo(
        rowWith({
          ...MIN_VALID,
          spaces: [{ key: 'a', name: 'A', surface_sqm: 50, max_seated: -10 }],
        }),
        'fr',
      ),
    ).toBeNull();
  });

  it('returns null when an event_type is outside the allowed set', () => {
    expect(
      readMiceInfo(
        rowWith({
          ...MIN_VALID,
          event_types: ['corporate-meeting', 'bar-mitzvah'],
        }),
        'fr',
      ),
    ).toBeNull();
  });

  it('returns null when a configuration is outside the allowed set', () => {
    expect(
      readMiceInfo(
        rowWith({
          ...MIN_VALID,
          spaces: [
            {
              key: 'a',
              name: 'A',
              surface_sqm: 50,
              max_seated: 30,
              configurations: ['theatre', 'hammock'],
            },
          ],
        }),
        'fr',
      ),
    ).toBeNull();
  });

  it('returns null when brochure_url is http (not https)', () => {
    expect(
      readMiceInfo(
        rowWith({ ...MIN_VALID, brochure_url: 'http://example.com/brochure.pdf' }),
        'fr',
      ),
    ).toBeNull();
  });

  it('accepts a minimal valid payload and projects it', () => {
    const result = readMiceInfo(rowWith(MIN_VALID), 'fr');
    expect(result).not.toBeNull();
    expect(result?.contactEmail).toBe('events@example.com');
    expect(result?.totalCapacitySeated).toBe(200);
    expect(result?.spaces).toHaveLength(1);
    expect(result?.spaces[0]?.key).toBe('grand-salon');
    expect(result?.spaces[0]?.configurations).toEqual([]);
    expect(result?.spaces[0]?.hasNaturalLight).toBe(false);
    expect(result?.spaces[0]?.notes).toBeNull();
    expect(result?.eventTypes).toEqual([]);
    expect(result?.brochureUrl).toBeNull();
    expect(result?.maxRoomHeightM).toBeNull();
    expect(result?.summary).toBeNull();
  });

  it('picks the FR summary when locale=fr and falls back to EN otherwise', () => {
    const both = readMiceInfo(
      rowWith({ ...MIN_VALID, summary_fr: 'Bonjour', summary_en: 'Hello' }),
      'fr',
    );
    expect(both?.summary).toBe('Bonjour');

    const enOnly = readMiceInfo(rowWith({ ...MIN_VALID, summary_en: 'Hello' }), 'fr');
    expect(enOnly?.summary).toBe('Hello');

    const enLocale = readMiceInfo(
      rowWith({ ...MIN_VALID, summary_fr: 'Bonjour', summary_en: 'Hello' }),
      'en',
    );
    expect(enLocale?.summary).toBe('Hello');

    const frOnlyEnLocale = readMiceInfo(rowWith({ ...MIN_VALID, summary_fr: 'Bonjour' }), 'en');
    expect(frOnlyEnLocale?.summary).toBe('Bonjour');
  });

  it('localizes per-space notes the same way', () => {
    const result = readMiceInfo(
      rowWith({
        ...MIN_VALID,
        spaces: [
          {
            key: 'grand-salon',
            name: 'Grand Salon',
            surface_sqm: 280,
            max_seated: 200,
            notes_fr: 'Lumière naturelle',
            notes_en: 'Natural light',
          },
        ],
      }),
      'en',
    );
    expect(result?.spaces[0]?.notes).toBe('Natural light');
  });

  it('preserves configurations and event types when valid', () => {
    const result = readMiceInfo(
      rowWith({
        ...MIN_VALID,
        event_types: ['corporate-meeting', 'wedding', 'gala-dinner'],
        spaces: [
          {
            key: 'grand-salon',
            name: 'Grand Salon',
            surface_sqm: 280,
            max_seated: 200,
            configurations: ['theatre', 'banquet', 'cocktail'],
            has_natural_light: true,
          },
        ],
      }),
      'fr',
    );
    expect(result?.eventTypes).toEqual(['corporate-meeting', 'wedding', 'gala-dinner']);
    expect(result?.spaces[0]?.configurations).toEqual(['theatre', 'banquet', 'cocktail']);
    expect(result?.spaces[0]?.hasNaturalLight).toBe(true);
  });

  it('accepts a brochure_url over https', () => {
    const result = readMiceInfo(
      rowWith({ ...MIN_VALID, brochure_url: 'https://example.com/brochure.pdf' }),
      'fr',
    );
    expect(result?.brochureUrl).toBe('https://example.com/brochure.pdf');
  });
});
