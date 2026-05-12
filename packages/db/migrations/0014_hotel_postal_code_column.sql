-- 0014 — Hotel postal code.
--
-- Phase 10.7 (gap analysis Peninsula §15 — score 4/5 → 5/5 once shipped).
--
-- Why a dedicated column:
--   * Schema.org `PostalAddress.postalCode` is REQUIRED for Google's hotel
--     rich-result to validate. Before this migration we passed an empty
--     string at the page level, which Google Rich Results Test silently
--     drops.
--   * Algolia / search filtering by arrondissement (e.g. "Paris 16e")
--     becomes a single-column FROM clause rather than a regex over
--     `address`.
--   * GDPR-safe: postal code is not PII on its own and is required by
--     Atout France for travel-agency invoicing.
--
-- The column is nullable in this migration: we own all currently-seeded
-- hotels (Peninsula Paris only) and the seed pipeline populates the value
-- in the same release. A follow-up migration in Phase 11 will tighten this
-- to NOT NULL once the editorial team has back-filled every Payload entry.
--
-- Shape: bare French postcode `\d{5}` (also supports overseas with leading
-- zeros: 97400 Réunion, 98800 New Caledonia, …). Validation is enforced
-- by Zod at the read boundary (`get-hotel-by-slug.ts`); we keep the SQL
-- check loose so editorial can tag international properties later.
--
-- Skill: supabase-postgres-rls (additive, no RLS change), seo-technical.

alter table public.hotels
  add column if not exists postal_code text;

comment on column public.hotels.postal_code is
  'Postal code (FR: \d{5}). Required for Schema.org PostalAddress. Will be tightened to NOT NULL in Phase 11. See migration 0014.';
