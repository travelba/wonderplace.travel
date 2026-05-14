-- 0028 — Editorial rankings v2: editorial_sections column.
--
-- Adds a JSONB column to `editorial_rankings` to store the
-- additional long-form editorial sections produced by the v2
-- generator (criteria, trends, gastronomy_focus, spa_focus, etc.).
-- These sections sit beside the ranked entries and push the ranking
-- towards the ≥ 3500-word long-read format.
--
-- Shape:
--   [
--     {
--       key, type, title_fr, title_en,
--       body_fr (≥ 400 words target), body_en
--     },
--     ...
--   ]
--
-- 3-6 sections per ranking is the v2 target.

alter table public.editorial_rankings
  add column if not exists editorial_sections jsonb not null default '[]'::jsonb;

comment on column public.editorial_rankings.editorial_sections is
  'Additional long-form editorial sections beside the ranked entries (criteria, trends, gastronomy_focus, spa_focus, family_focus, romance_focus, value, closing). Each item: {key,type,title_fr,title_en,body_fr,body_en}.';
