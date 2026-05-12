-- 0011 — Hotel location enrichment (POIs + transports).
--
-- Phase 10.2 (gap analysis Peninsula §10 — score 1/5 → 4/5 once shipped).
-- The fiche needs richer "emplacement" data than a single lat/long to satisfy
-- both:
--   * SEO: rich snippet candidates for queries like "hotel près arc triomphe"
--     (proximity-by-text often outranks lat/long alone).
--   * AEO/LLM: the AI summary block can quote concrete distances and walking
--     times, which is exactly what LLMs prefer to surface in answers.
--
-- We add:
--   * `points_of_interest` (jsonb): array of
--       { name, type, distance_meters, walk_minutes,
--         category?, name_en?, latitude?, longitude? }
--     `type` is a free-text label like "monument", "shopping", "museum"
--     (validated by Zod in the app — keeps editorial flexibility).
--   * `transports` (jsonb): array of
--       { mode, line?, station, distance_meters, walk_minutes,
--         station_en?, notes_fr?, notes_en? }
--     `mode` ∈ { metro, rer, tram, bus, train, taxi, airport_shuttle }.
--
-- Both columns are NULLable & additive — existing hotels keep rendering the
-- "no enriched location" branch in `<HotelLocation>`.
--
-- Skill: supabase-postgres-rls (additive, no RLS change) + content-modeling.

alter table public.hotels
  add column if not exists points_of_interest jsonb,
  add column if not exists transports jsonb;

-- GIN indexes power future filters like "hotels within X meters of Arc de
-- Triomphe" or "hotels with metro line 1 access" — same pattern as the
-- already-indexed `amenities`/`faq_content` columns.
create index if not exists hotels_points_of_interest_gin
  on public.hotels using gin (points_of_interest jsonb_path_ops);

create index if not exists hotels_transports_gin
  on public.hotels using gin (transports jsonb_path_ops);

comment on column public.hotels.points_of_interest is
  'Array of { name, type, distance_meters, walk_minutes, category?, name_en?, latitude?, longitude? } describing landmarks near the hotel.';
comment on column public.hotels.transports is
  'Array of { mode, line?, station, distance_meters, walk_minutes, station_en?, notes_fr?, notes_en? }. mode ∈ {metro,rer,tram,bus,train,taxi,airport_shuttle}.';
