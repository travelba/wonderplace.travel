-- 0020 — Hotels: optional E.164 telephone column.
--
-- Phase 10.29 (gap analysis Peninsula §6 — JSON-LD enrichment).
--
-- The `Hotel` JSON-LD builder (`@cct/seo`) already accepts a
-- `telephone` input; the only thing missing was a column to source
-- the value from. We add `phone_e164` as a nullable text column with
-- a CHECK constraint enforcing the E.164 format (international
-- number, leading `+`, country code, 4-15 digits).
--
-- Why E.164 (not free-text):
--   - Google's Hotel rich-result documentation explicitly recommends
--     E.164 because the format is unambiguous (no spaces, no
--     parentheses) and click-to-call works on every device.
--   - Brevo + Amadeus payment forms already collect guest phones in
--     E.164 — keeping the same convention site-wide avoids two
--     parallel mental models.
--   - The CHECK constraint is permissive on length (4-15 digits) to
--     accommodate small countries (San Marino, Andorra) without
--     forcing a country-aware library at the DB level.
--
-- Format presentation (e.g. `+33 1 58 12 28 88` for human reading)
-- happens at render time in the page — we never store the spaces.
--
-- Skill: supabase-postgres-rls (additive), structured-data-schema-org.

alter table public.hotels
  add column if not exists phone_e164 text;

alter table public.hotels
  add constraint hotels_phone_e164_ck
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{3,14}$');

comment on column public.hotels.phone_e164 is
  'Hotel front-desk phone in E.164 format (no spaces, leading "+", country code, 4-15 digits). Surfaces as `Hotel.telephone` in the JSON-LD and as a click-to-call link on the fiche.';
