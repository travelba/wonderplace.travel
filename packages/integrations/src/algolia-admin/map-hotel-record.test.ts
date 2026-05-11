import { describe, expect, it } from 'vitest';

import { buildHotelAlgoliaRecord } from './map-hotel-record.js';
import type { HotelSourceRow } from './types.js';

const baseRow: HotelSourceRow = {
  id: '8b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b2b',
  slug: 'hotel-test',
  slug_en: 'hotel-test-en',
  name: 'Hôtel Test',
  name_en: 'Hotel Test',
  city: 'Paris',
  district: null,
  region: 'Île-de-France',
  is_palace: true,
  stars: 5,
  amenities: [{ label: 'Spa' }, 'Piscine'],
  highlights: ['Art déco', 'Rooftop'],
  description_fr: 'Un établissement magnifique ' + 'x'.repeat(300),
  description_en: null,
  is_little_catalog: false,
  priority: 'P0',
  google_rating: '4.8',
  google_reviews_count: 120,
  is_published: true,
};

describe('buildHotelAlgoliaRecord', () => {
  it('builds FR excerpt and maps amenities + themes', () => {
    const r = buildHotelAlgoliaRecord('fr', baseRow);
    expect(r.name).toBe('Hôtel Test');
    expect(r.description_excerpt.endsWith('…')).toBe(true);
    expect(r.description_excerpt.length).toBeLessThanOrEqual(201);
    expect(r.amenities_top).toEqual(['Spa', 'Piscine']);
    expect(r.themes).toEqual(['Art déco', 'Rooftop']);
    expect(r.priority_score).toBe(100);
    expect(r.google_rating).toBe(4.8);
    expect(r.url_path).toBe('/hotel/hotel-test');
  });

  it('prefers EN slug and fallback name', () => {
    const partial: HotelSourceRow = {
      ...baseRow,
      name_en: '',
      slug_en: 'only-en-slug',
    };
    const r = buildHotelAlgoliaRecord('en', partial);
    expect(r.name).toBe('Hôtel Test');
    expect(r.slug).toBe('only-en-slug');
    // url_path is unlocalized — locale prefix is applied at render time.
    expect(r.url_path).toBe('/hotel/only-en-slug');
  });

  it('drops empty optional district field', () => {
    const r = buildHotelAlgoliaRecord('fr', baseRow);
    expect('district' in r ? r.district : undefined).toBeUndefined();
  });

  it('includes district when set', () => {
    const withDistrict: HotelSourceRow = { ...baseRow, district: '8ᵉ arr.' };
    const r = buildHotelAlgoliaRecord('fr', withDistrict);
    expect(r.district).toBe('8ᵉ arr.');
  });
});
