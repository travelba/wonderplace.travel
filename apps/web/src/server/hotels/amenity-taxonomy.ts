/**
 * Amenity taxonomy — CDC §2 bloc 7.
 *
 * Stable, typed registry that maps the open-ended `hotels.amenities[].key`
 * values to a canonical category, display order, and bilingual labels.
 * This file is the single source of truth for:
 *   - the grouped UI on the hotel detail page (`HotelAmenities`);
 *   - amenity filtering in search (later: surface "spa", "indoor pool"
 *     as facet values);
 *   - the JSON-LD `LocationFeatureSpecification` (kept flat for now).
 *
 * Why a TS registry rather than a DB table:
 *   - Categories evolve with editorial language, not user-generated data;
 *     versioning them in code keeps the diff readable and reviewable.
 *   - Unknown keys gracefully fall back to "other" — no JOIN, no NULL
 *     branch, no runtime migration. A future move to a Payload-managed
 *     collection only needs to swap this module out behind the same API.
 *   - Editorial team adds a key here when introducing it in a seed/CMS
 *     entry; lint rule would later enforce "every amenity key in DB exists
 *     in this registry" (Phase 11+).
 *
 * Skill: domain-driven-design, content-modeling.
 */

/** Canonical category of an amenity — order matters: it drives section order. */
export const AMENITY_CATEGORIES = [
  'wellness',
  'dining',
  'services',
  'family',
  'connectivity',
  'business',
  'accessibility',
  'sustainability',
  'other',
] as const;

export type AmenityCategory = (typeof AMENITY_CATEGORIES)[number];

export interface AmenityDescriptor {
  readonly key: string;
  readonly category: AmenityCategory;
  /** Sort order **within** a category. Lower comes first. */
  readonly order?: number;
  /** Hints the UI to render the chip with a "premium" emphasis. */
  readonly isPremium?: boolean;
}

/**
 * Canonical registry. Keys here are the stable identifiers persisted in
 * `hotels.amenities[].key` and `hotel_rooms.amenities[].key`.
 *
 * To extend: add a row here, then publish an editorial entry that uses
 * the same key. Unknown keys fall back to `other` — they still render,
 * just without categorization or icon.
 */
export const AMENITY_TAXONOMY: Readonly<Record<string, AmenityDescriptor>> = {
  // --- wellness ---
  spa: { key: 'spa', category: 'wellness', order: 10, isPremium: true },
  indoor_pool: { key: 'indoor_pool', category: 'wellness', order: 20 },
  outdoor_pool: { key: 'outdoor_pool', category: 'wellness', order: 21 },
  fitness: { key: 'fitness', category: 'wellness', order: 30 },
  hammam: { key: 'hammam', category: 'wellness', order: 40 },
  sauna: { key: 'sauna', category: 'wellness', order: 41 },
  yoga: { key: 'yoga', category: 'wellness', order: 50 },

  // --- dining ---
  michelin_restaurant: {
    key: 'michelin_restaurant',
    category: 'dining',
    order: 10,
    isPremium: true,
  },
  fine_dining: { key: 'fine_dining', category: 'dining', order: 11 },
  cantonese_restaurant: { key: 'cantonese_restaurant', category: 'dining', order: 20 },
  italian_restaurant: { key: 'italian_restaurant', category: 'dining', order: 21 },
  bistro: { key: 'bistro', category: 'dining', order: 22 },
  bar: { key: 'bar', category: 'dining', order: 30 },
  rooftop_bar: { key: 'rooftop_bar', category: 'dining', order: 31, isPremium: true },
  cigar_lounge: { key: 'cigar_lounge', category: 'dining', order: 40 },
  afternoon_tea: { key: 'afternoon_tea', category: 'dining', order: 50 },
  room_service_24h: { key: 'room_service_24h', category: 'dining', order: 60 },

  // --- services ---
  concierge_24h: { key: 'concierge_24h', category: 'services', order: 10 },
  butler_service: { key: 'butler_service', category: 'services', order: 11, isPremium: true },
  valet: { key: 'valet', category: 'services', order: 20 },
  rolls_royce: { key: 'rolls_royce', category: 'services', order: 30, isPremium: true },
  airport_shuttle: { key: 'airport_shuttle', category: 'services', order: 31 },
  housekeeping_twice_daily: { key: 'housekeeping_twice_daily', category: 'services', order: 40 },
  laundry: { key: 'laundry', category: 'services', order: 41 },
  florist: { key: 'florist', category: 'services', order: 50 },
  peninsula_time: { key: 'peninsula_time', category: 'services', order: 60, isPremium: true },

  // --- family ---
  family_friendly: { key: 'family_friendly', category: 'family', order: 10 },
  kids_club: { key: 'kids_club', category: 'family', order: 20 },
  babysitting: { key: 'babysitting', category: 'family', order: 21 },
  cribs_available: { key: 'cribs_available', category: 'family', order: 30 },
  pet_friendly: { key: 'pet_friendly', category: 'family', order: 40 },

  // --- connectivity ---
  wifi: { key: 'wifi', category: 'connectivity', order: 10 },
  wifi_premium: { key: 'wifi_premium', category: 'connectivity', order: 11 },
  in_room_tablet: { key: 'in_room_tablet', category: 'connectivity', order: 20 },

  // --- business ---
  business_center: { key: 'business_center', category: 'business', order: 10 },
  meeting_rooms: { key: 'meeting_rooms', category: 'business', order: 20 },
  private_events: { key: 'private_events', category: 'business', order: 30 },
  ballroom: { key: 'ballroom', category: 'business', order: 40 },

  // --- accessibility ---
  step_free_access: { key: 'step_free_access', category: 'accessibility', order: 10 },
  accessible_rooms: { key: 'accessible_rooms', category: 'accessibility', order: 20 },
  elevator: { key: 'elevator', category: 'accessibility', order: 30 },

  // --- sustainability (Phase 11 — placeholders for future seeds) ---
  green_key: { key: 'green_key', category: 'sustainability', order: 10 },
  electric_charging: { key: 'electric_charging', category: 'sustainability', order: 20 },
};

/**
 * Resolve an amenity key to its category. Unknown keys (legacy editorial,
 * free-form Payload entries) bucket into `other` — they still render but
 * are not promoted to a specific group.
 */
export function categorizeAmenity(key: string): AmenityCategory {
  const descriptor = AMENITY_TAXONOMY[key];
  return descriptor !== undefined ? descriptor.category : 'other';
}

/**
 * Sort key for an amenity within its category. Returns a large fallback so
 * unregistered keys land at the end of their group, preserving relative
 * order amongst themselves via the stable sort.
 */
export function amenityOrder(key: string): number {
  const descriptor = AMENITY_TAXONOMY[key];
  return descriptor?.order ?? 999;
}

/** True when the amenity should get the "premium" visual treatment. */
export function isPremiumAmenity(key: string): boolean {
  return AMENITY_TAXONOMY[key]?.isPremium === true;
}

/** Display order of categories (driven by the const array above). */
export function categoryOrder(category: AmenityCategory): number {
  const idx = AMENITY_CATEGORIES.indexOf(category);
  return idx === -1 ? AMENITY_CATEGORIES.length : idx;
}
