import { describe, expect, it } from 'vitest';

import { buildCityAlgoliaRecord, popularityScore } from './map-city-record.js';
import type { CitySourceRow } from './types.js';

const baseRow: CitySourceRow = {
  id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  slug: 'paris',
  slug_en: 'paris',
  name: 'Paris',
  name_en: 'Paris',
  region: 'Île-de-France',
  country_code: 'FR',
  hotels_count: 42,
  is_popular: true,
  aliases: ['Lutèce', 'Ville Lumière'],
  is_published: true,
};

describe('buildCityAlgoliaRecord', () => {
  it('builds FR record with aliases and popularity boost', () => {
    const r = buildCityAlgoliaRecord('fr', baseRow);
    expect(r.name).toBe('Paris');
    expect(r.url_path).toBe('/destinations/paris');
    expect(r.popularity_score).toBe(42 + 1000);
    expect(r.aliases).toEqual(['Lutèce', 'Ville Lumière']);
  });

  it('prefers EN slug fallback and skips empty aliases', () => {
    const row: CitySourceRow = {
      ...baseRow,
      name_en: '',
      slug_en: 'paris-city',
      aliases: ['', 'Capital'],
    };
    const r = buildCityAlgoliaRecord('en', row);
    expect(r.name).toBe('Paris');
    expect(r.slug).toBe('paris-city');
    expect(r.url_path).toBe('/en/destinations/paris-city');
    expect(r.aliases).toEqual(['Capital']);
  });

  it('drops aliases field when none remain', () => {
    const row: CitySourceRow = { ...baseRow, aliases: [] };
    const r = buildCityAlgoliaRecord('fr', row);
    expect('aliases' in r ? r.aliases : undefined).toBeUndefined();
  });

  it('popularityScore returns base count when not popular', () => {
    const row: CitySourceRow = { ...baseRow, is_popular: false };
    expect(popularityScore(row)).toBe(42);
  });
});
