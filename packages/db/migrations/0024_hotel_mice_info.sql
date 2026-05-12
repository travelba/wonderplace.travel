-- 0024 — Hotels: B2B / MICE (Meetings, Incentives, Conferences, Events).
--
-- Phase 11.5 (gap analysis Peninsula bloc 14 — "B2B / MICE 0/5").
--
-- Adds one optional `jsonb` column carrying the property's
-- conference & events offer. Surfaces a new section
-- "Événements & séminaires" / "Events & seminars" on the public
-- detail page, providing the corporate buyer (event planner,
-- wedding planner, press attaché) with the data they need before
-- requesting a quote.
--
-- Schema (validated at the application layer in
-- `apps/web/src/server/hotels/get-hotel-by-slug.ts:readMiceInfo`):
--
--   {
--     summary_fr?: string,    -- 1-sentence editorial pitch
--     summary_en?: string,
--     contact_email: string,  -- mandatory CTA (mailto)
--     brochure_url?: string,  -- optional HTTPS PDF
--     total_capacity_seated: int,
--     max_room_height_m?: number,
--     spaces: [{
--       key: string,                 -- kebab-case stable id
--       name: string,
--       surface_sqm: int,
--       max_seated: int,
--       configurations?: string[],   -- "theatre" | "u-shape" | "boardroom" | "banquet" | "cocktail" | "classroom"
--       has_natural_light?: boolean,
--       notes_fr?: string,
--       notes_en?: string
--     }],
--     event_types: string[]   -- "corporate-meeting" | "wedding" | "gala-dinner" | "press-launch" | "incentive" | "private-screening"
--   }
--
-- Why jsonb (not relational tables):
--   - Editorial cadence is slow (a hotel updates its MICE offer 1-2
--     times/year). Modeling 4 normalised tables (mice_spaces,
--     mice_configurations, mice_event_types, junction) would be
--     overkill for a feature that ships v1 with display-only UX.
--   - jsonb keeps the Payload editor experience flat (one
--     collapsible, one JSON field) until we have enough signal to
--     justify a custom Payload form (Phase 12+).
--   - All consumers (UI, JSON-LD, MICE PDF brochure generator)
--     read the structure once per request; we don't need GIN
--     containment queries here.
--
-- The CHECK constraint asserts the shape minimum:
--   - The column is either NULL or a JSON object (not an array, not
--     a scalar — `jsonb_typeof` returns the typed tag).
--   - When set, the object MUST carry `contact_email` (the CTA
--     can't render without it) and a non-empty `spaces` array (a
--     MICE section without rooms is just dead pixels).
--
-- We deliberately do NOT validate sub-fields at the DB level —
-- the Zod schema in `readMiceInfo()` is the single source of truth
-- for shape rules, and tightening the CHECK with a recursive
-- JSON path would couple the DB tightly to the application layer.
-- The trade-off: a malformed sub-field (e.g. negative `max_seated`)
-- reaches the reader, which then drops the whole entry and logs a
-- dev warning. UX-graceful, schema-light.
--
-- Skill: supabase-postgres-rls (additive), content-modeling.

alter table public.hotels
  add column if not exists mice_info jsonb;

alter table public.hotels
  add constraint hotels_mice_info_shape_ck
  check (
    mice_info is null
    or (
      jsonb_typeof(mice_info) = 'object'
      and (mice_info ? 'contact_email')
      and jsonb_typeof(mice_info -> 'contact_email') = 'string'
      and (mice_info ? 'spaces')
      and jsonb_typeof(mice_info -> 'spaces') = 'array'
      and jsonb_array_length(mice_info -> 'spaces') > 0
    )
  );

comment on column public.hotels.mice_info is
  'Optional MICE (Meetings, Incentives, Conferences, Events) offer. Surfaces a B2B section on the public hotel page and a contact CTA (mailto contact_email). NULL when the property does not offer event spaces. Schema validated at the app layer in apps/web/src/server/hotels/get-hotel-by-slug.ts:readMiceInfo.';

----------------------------------------------------------------
-- Migration log
----------------------------------------------------------------
insert into public._cct_sql_migrations (filename, applied_at)
  values ('0024_hotel_mice_info.sql', timezone('utc', now()))
  on conflict do nothing;
