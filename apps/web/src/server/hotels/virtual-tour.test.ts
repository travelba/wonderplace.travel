import { describe, expect, it } from 'vitest';

import { readVirtualTour, type HotelDetailRow } from './get-hotel-by-slug';

/**
 * Build a minimal HotelDetailRow with `virtual_tour_url` set to the
 * value under test. Every other field is irrelevant to this reader
 * and stubbed with the smallest legal placeholder; the reader is a
 * pure projection of `row.virtual_tour_url`.
 */
function rowWith(url: string | null): HotelDetailRow {
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
    virtual_tour_url: url,
    is_published: true,
    updated_at: null,
  };
}

describe('readVirtualTour', () => {
  it('returns null when the column is null', () => {
    expect(readVirtualTour(rowWith(null))).toBeNull();
  });

  it('returns null on empty / whitespace-only strings', () => {
    expect(readVirtualTour(rowWith(''))).toBeNull();
    expect(readVirtualTour(rowWith('   '))).toBeNull();
  });

  it('returns null on plain http URLs', () => {
    expect(readVirtualTour(rowWith('http://my.matterport.com/show/?m=abc'))).toBeNull();
  });

  it('returns null on malformed URLs', () => {
    expect(readVirtualTour(rowWith('not a url'))).toBeNull();
    expect(readVirtualTour(rowWith('javascript:alert(1)'))).toBeNull();
  });

  it('returns null on disallowed hosts', () => {
    expect(readVirtualTour(rowWith('https://evil.example.com/show?m=abc'))).toBeNull();
    // Subdomain-takeover pattern — `my.matterport.com` is a suffix of
    // `my.matterport.com.evil.test` for a naive regex but not for the
    // URL hostname check.
    expect(readVirtualTour(rowWith('https://my.matterport.com.evil.test/x'))).toBeNull();
    // Matterport `kiosk` subdomain — deliberately not in the allowlist
    // because it forces a different UX that we don't want inside our
    // own page.
    expect(readVirtualTour(rowWith('https://kiosk.matterport.com/show/?m=abc'))).toBeNull();
  });

  it('rejects URLs with user-info credentials', () => {
    expect(readVirtualTour(rowWith('https://user@my.matterport.com/show?m=abc'))).toBeNull();
    expect(readVirtualTour(rowWith('https://u:p@kuula.co/share/abc'))).toBeNull();
  });

  it('rejects non-default ports', () => {
    expect(readVirtualTour(rowWith('https://my.matterport.com:8443/show?m=abc'))).toBeNull();
  });

  it('rejects URLs longer than 512 chars', () => {
    const long = `https://my.matterport.com/show/?m=${'a'.repeat(700)}`;
    expect(readVirtualTour(rowWith(long))).toBeNull();
  });

  it('accepts a canonical Matterport URL and tags the provider', () => {
    const url = 'https://my.matterport.com/show/?m=zEWsxhZpGba';
    const result = readVirtualTour(rowWith(url));
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('matterport');
    expect(result?.url).toBe(url);
  });

  it('accepts a canonical Kuula URL and tags the provider', () => {
    const url = 'https://kuula.co/share/abc123?fs=1&vr=1';
    const result = readVirtualTour(rowWith(url));
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('kuula');
  });

  it('trims surrounding whitespace before parsing', () => {
    const url = '  https://my.matterport.com/show/?m=abc  ';
    const result = readVirtualTour(rowWith(url));
    expect(result?.provider).toBe('matterport');
  });
});
