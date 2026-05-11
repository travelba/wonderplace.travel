import { z } from 'zod';

/**
 * Postgres / Payload-aligned hotel row consumed by the indexer (see `hotels` table).
 */
export const HotelSourceRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  slug_en: z.string().nullable().optional(),
  name: z.string(),
  name_en: z.string().nullable().optional(),
  city: z.string(),
  district: z.string().nullable().optional(),
  region: z.string(),
  is_palace: z.boolean(),
  stars: z.number().int().min(1).max(5),
  amenities: z.unknown().optional(),
  highlights: z.unknown().optional(),
  description_fr: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  is_little_catalog: z.boolean(),
  priority: z.enum(['P0', 'P1', 'P2']),
  google_rating: z.union([z.number(), z.string()]).nullable().optional(),
  google_reviews_count: z.number().int().nullable().optional(),
  is_published: z.boolean(),
});

export type HotelSourceRow = z.infer<typeof HotelSourceRowSchema>;

const optionalStringArray = z.array(z.string()).optional();

/** Record shape stored in Algolia `hotels_<locale>` indices (skill: search-engineering). */
export const AlgoliaHotelRecordSchema = z
  .object({
    objectID: z.string().uuid(),
    name: z.string(),
    city: z.string(),
    district: z.string().optional(),
    region: z.string(),
    landmarks: optionalStringArray,
    aliases: optionalStringArray,
    description_excerpt: z.string(),
    amenities_top: z.array(z.string()),
    themes: z.array(z.string()),
    slug: z.string(),
    url_path: z.string(),
    is_palace: z.boolean(),
    stars: z.number().int(),
    is_little_catalog: z.boolean(),
    priority: z.enum(['P0', 'P1', 'P2']),
    priority_score: z.number().int(),
    google_rating: z.number().nullable().optional(),
    google_reviews_count: z.number().int().nullable().optional(),
  })
  .strict();

export type AlgoliaHotelRecord = z.infer<typeof AlgoliaHotelRecordSchema>;

/**
 * Postgres / Payload-aligned city row consumed by the indexer (see `cities` table).
 * Skill: search-engineering — used to power destination autocomplete.
 */
export const CitySourceRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  slug_en: z.string().nullable().optional(),
  name: z.string(),
  name_en: z.string().nullable().optional(),
  region: z.string(),
  country_code: z.string().length(2).default('FR'),
  hotels_count: z.number().int().nonnegative().default(0),
  is_popular: z.boolean().default(false),
  aliases: z.array(z.string()).optional(),
  is_published: z.boolean(),
});

export type CitySourceRow = z.infer<typeof CitySourceRowSchema>;

/** Record shape stored in Algolia `cities_<locale>` indices. */
export const AlgoliaCityRecordSchema = z
  .object({
    objectID: z.string().uuid(),
    name: z.string(),
    region: z.string(),
    country_code: z.string().length(2),
    aliases: optionalStringArray,
    slug: z.string(),
    url_path: z.string(),
    hotels_count: z.number().int().nonnegative(),
    is_popular: z.boolean(),
    popularity_score: z.number().int(),
  })
  .strict();

export type AlgoliaCityRecord = z.infer<typeof AlgoliaCityRecordSchema>;
