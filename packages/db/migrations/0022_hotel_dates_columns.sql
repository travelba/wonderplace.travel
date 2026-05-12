-- 0022 — Hotels: editorial opening and last-renovation dates.
--
-- Phase 11.2 (gap analysis Peninsula §6 — `0022_hotels_meta_extra.sql`).
--
-- Adds two optional `date` columns capturing the hotel's editorial
-- history. Used by:
--
--   1. The JSON-LD `Hotel` node, where `opened_at.year` surfaces as
--      Schema.org `foundingDate` (inherited from Organization). Google
--      and LLM ingestion pipelines (Perplexity, SearchGPT) weight this
--      strongly when answering "How old is X?" or "When was X built?"
--      queries.
--   2. The HotelFactSheet UI block, which renders a single line
--      "Ouverture 1908 · Rénové en 2014" — short, factual, quotable.
--
-- We deliberately store full `date` values (not just years) even though
-- the public surface only renders the year. Editorial often knows the
-- exact opening date (anniversary press releases, palace files) and a
-- date-typed column lets us add a `formatted_at` strftime later without
-- a column-type migration.
--
-- Why nullable:
--   - Legacy display-only hotels often have no documented opening date.
--   - Renovation history may be unknown for boutique properties.
--   - Nullable columns keep the public page rendering "Ouvert : —"
--     entries off the screen rather than hard-coding sentinel years
--     like `1900-01-01`.
--
-- CHECK constraints
--   - `opened_at` must not be in the future (defensive — typos that
--     write 2034 instead of 1934 are caught at write time).
--   - `last_renovated_at` must be >= `opened_at` when both are set
--     (a renovation older than the opening makes no editorial sense).
--   - Lower bound on `opened_at` is 1500-01-01 — the oldest currently
--     operating French hotel (Hôtel de la Cité in Carcassonne, 1908
--     in its current form, but the building dates back to 12th century)
--     would still pass. This is a typo-catcher, not a curation rule.
--
-- Skill: supabase-postgres-rls (additive), structured-data-schema-org.

alter table public.hotels
  add column if not exists opened_at date,
  add column if not exists last_renovated_at date;

alter table public.hotels
  add constraint hotels_opened_at_ck
  check (
    opened_at is null
    or (opened_at >= date '1500-01-01' and opened_at <= current_date)
  );

alter table public.hotels
  add constraint hotels_renovated_after_opened_ck
  check (
    last_renovated_at is null
    or opened_at is null
    or last_renovated_at >= opened_at
  );

alter table public.hotels
  add constraint hotels_renovated_not_in_future_ck
  check (
    last_renovated_at is null
    or last_renovated_at <= current_date
  );

comment on column public.hotels.opened_at is
  'Date of the hotel''s first opening to guests. Renders as the year in HotelFactSheet UI and as Schema.org `Hotel.foundingDate` in JSON-LD. NULL when undocumented.';

comment on column public.hotels.last_renovated_at is
  'Date of the most recent significant renovation (decade-level). Editorial signal for "recently refurbished" framing. NULL when no renovation is documented.';

----------------------------------------------------------------
-- Migration log
----------------------------------------------------------------
insert into public._cct_sql_migrations (filename, applied_at)
  values ('0022_hotel_dates_columns.sql', timezone('utc', now()))
  on conflict do nothing;
