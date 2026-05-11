-- 0013 — Hotel awards (jsonb).
--
-- Phase 10.4 (gap analysis Peninsula §11 — score 0/5 → 4/5 once shipped).
-- Awards & distinctions are a major EEAT signal for luxury hotels and a
-- direct input to:
--   * Schema.org Hotel.awards / LodgingBusiness.awards (string[]).
--   * The reassurance/proof block on the hotel detail page.
--   * The AEO/LLM extract — concrete proof points (Forbes 5★, Palace, …)
--     dramatically improve LLM answers vs. paraphrasing.
--
-- Shape (validated by Zod in the app):
--   [
--     {
--       "name_fr":   "Distinction Palace",
--       "name_en":   "Palace distinction",
--       "issuer":    "Atout France",
--       "year?":     2014,
--       "url?":      "https://...",
--       "image?":    "cct/awards/palace-atout-france"   -- Cloudinary public_id
--     },
--     ...
--   ]
--
-- Bilingual `name_fr` / `name_en` are required so the same row renders on
-- both FR and EN locales. `issuer` is locale-agnostic (proper noun).
-- `year` and `url` are optional (some distinctions are evergreen). `image`
-- is reserved for future badge rendering (not used in Phase 10.4 UI).
--
-- Skill: supabase-postgres-rls (additive, no RLS change) + structured-data-schema-org.

alter table public.hotels
  add column if not exists awards jsonb;

create index if not exists hotels_awards_gin
  on public.hotels using gin (awards jsonb_path_ops);

comment on column public.hotels.awards is
  'Awards & distinctions array. Each item: {name_fr, name_en, issuer, year?, url?, image?}. See migration 0013 for shape.';
