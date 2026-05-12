-- 0016 — Hotel long-form description sections.
--
-- Phase 10.10 (gap analysis Peninsula §4 — score 3/5 → 5/5 once shipped).
--
-- Adds a single jsonb column storing the hotel's long-form story as
-- an ordered array of typed sections, each rendered as an `<h3 id>`
-- + a body block on the public detail page.
--
-- Shape (validated by Zod at the read boundary in
-- `apps/web/src/server/hotels/get-hotel-by-slug.ts`):
--
--   [
--     {
--       "anchor": "histoire",
--       "title_fr": "Histoire & héritage",
--       "title_en": "History & heritage",
--       "body_fr": "Le palace occupe…",  -- paragraphs separated by \n\n
--       "body_en": "The palace occupies…"
--     },
--     …
--   ]
--
-- Why jsonb-array rather than two long text columns?
--   * Type-safe at the boundary (Zod array of objects); a free-form
--     `text` column would force an in-app markdown parser, which we
--     don't want to ship.
--   * Generates the page's table of contents in O(N) by iterating the
--     array (no DOM scraping required).
--   * Maps 1:1 to a future Payload `Hotels.story[]` array field —
--     editorial flow without schema migration.
--
-- A GIN index would be overkill (we never filter on the body text);
-- the column is purely a render-time payload.
--
-- The "short" `description_fr` / `description_en` text columns stay
-- in place for the hero paragraph and meta-description fallbacks.
-- The new column is the canonical source for the "About" section
-- (long-form, structured).
--
-- Skill: supabase-postgres-rls (additive), content-modeling.

alter table public.hotels
  add column if not exists long_description_sections jsonb;

comment on column public.hotels.long_description_sections is
  'Ordered array of long-form story sections (anchor, title_fr/en, body_fr/en). See migration 0016 for shape. Renders the "About" section + TOC on the public hotel page.';
