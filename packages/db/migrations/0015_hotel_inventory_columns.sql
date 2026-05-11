-- 0015 — Hotel inventory counts.
--
-- Phase 10.8 (gap analysis Peninsula §15 — Hotel JSON-LD enrichment).
--
-- Adds two integer columns describing the property's room inventory.
-- These map 1:1 to Schema.org `Hotel.numberOfRooms` (an absolute integer
-- count of all bookable units) and an editorial `numberOfSuites` count
-- that we surface in the fact-sheet UI block (Phase 10.9).
--
-- Why on `hotels` rather than derived from `hotel_rooms`:
--   * `hotel_rooms` lists *categories* of rooms (e.g. "Deluxe Room",
--     "Eiffel Tower Suite"), not individual bookable units. The Peninsula
--     Paris ships ~200 keys spread across only 3 categories in our seed.
--   * Google Rich Results expects an absolute integer; deriving it
--     from a SUM(unit_count) join would require a new column on
--     `hotel_rooms` anyway.
--   * The editorial team often has the headline count well before
--     they've modelled the full category matrix, so storing it on the
--     parent unblocks SEO publishing.
--
-- Both columns are nullable for now — display-only legacy entries may
-- not have public inventory data. The page renders the JSON-LD field
-- only when a non-null positive value is present, keeping Google's
-- rich-results validator happy.
--
-- Skill: supabase-postgres-rls (additive), structured-data-schema-org.

alter table public.hotels
  add column if not exists number_of_rooms integer
    check (number_of_rooms is null or number_of_rooms > 0),
  add column if not exists number_of_suites integer
    check (number_of_suites is null or number_of_suites >= 0);

comment on column public.hotels.number_of_rooms is
  'Total number of bookable units (all categories combined). Maps to Schema.org Hotel.numberOfRooms. NULL when unknown.';

comment on column public.hotels.number_of_suites is
  'Editorial count of suites (subset of number_of_rooms). Surfaced in the HotelFactSheet UI block.';
