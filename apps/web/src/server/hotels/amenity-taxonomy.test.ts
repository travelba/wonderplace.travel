import { describe, expect, it } from 'vitest';

import {
  AMENITY_CATEGORIES,
  AMENITY_TAXONOMY,
  amenityOrder,
  categorizeAmenity,
  categoryOrder,
  isPremiumAmenity,
} from './amenity-taxonomy';

describe('amenity-taxonomy', () => {
  it('categorizes registered keys', () => {
    expect(categorizeAmenity('spa')).toBe('wellness');
    expect(categorizeAmenity('michelin_restaurant')).toBe('dining');
    expect(categorizeAmenity('wifi')).toBe('connectivity');
    expect(categorizeAmenity('rolls_royce')).toBe('services');
  });

  it('falls back to "other" for unknown keys', () => {
    expect(categorizeAmenity('not-a-real-amenity')).toBe('other');
    expect(categorizeAmenity('')).toBe('other');
  });

  it('flags premium amenities', () => {
    expect(isPremiumAmenity('spa')).toBe(true);
    expect(isPremiumAmenity('michelin_restaurant')).toBe(true);
    expect(isPremiumAmenity('butler_service')).toBe(true);
    expect(isPremiumAmenity('peninsula_time')).toBe(true);
    expect(isPremiumAmenity('wifi')).toBe(false);
    expect(isPremiumAmenity('unknown')).toBe(false);
  });

  it('returns a stable order within a category for registered keys', () => {
    expect(amenityOrder('spa')).toBeLessThan(amenityOrder('fitness'));
    expect(amenityOrder('michelin_restaurant')).toBeLessThan(amenityOrder('bar'));
  });

  it('lands unknown keys after registered ones', () => {
    expect(amenityOrder('unknown')).toBeGreaterThan(amenityOrder('wifi'));
  });

  it('exposes categories in a deterministic, exhaustive order', () => {
    expect(AMENITY_CATEGORIES[0]).toBe('wellness');
    expect(AMENITY_CATEGORIES[AMENITY_CATEGORIES.length - 1]).toBe('other');
    expect(new Set(AMENITY_CATEGORIES).size).toBe(AMENITY_CATEGORIES.length);
  });

  it('categoryOrder respects the declared array', () => {
    expect(categoryOrder('wellness')).toBeLessThan(categoryOrder('services'));
    expect(categoryOrder('services')).toBeLessThan(categoryOrder('other'));
  });

  it('every registry entry uses a valid category', () => {
    for (const descriptor of Object.values(AMENITY_TAXONOMY)) {
      expect(AMENITY_CATEGORIES).toContain(descriptor.category);
    }
  });

  it('registry keys are kebab- or snake-friendly identifiers', () => {
    for (const key of Object.keys(AMENITY_TAXONOMY)) {
      expect(key).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
