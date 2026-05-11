-- 0019 — Hotel rooms: signature flag, indicative price, display order.
--
-- Phase 10.23 (gap analysis Peninsula §5 — room sub-pages enrichment).
--
-- The room sub-page catalog already ships with slug, long description
-- and hero (migration 0010). Three remaining gaps:
--
--   1. `is_signature` — a boolean editorial flag marking the property's
--      hero suites (e.g. Eiffel Tower Suite, Peninsula Suite). The
--      public list card uses it to render a "Signature" badge, and the
--      sub-page meta-title gets a `— Suite signature` suffix. Cardinal
--      for SEO because the signature suite typically captures the
--      property's hero queries (e.g. "suite vue Tour Eiffel Peninsula").
--
--   2. `indicative_price_minor` — a jsonb price range expressed in the
--      currency's minor unit (cents for EUR), so we can render
--      "À partir de 1 200 €" on the list card without doing a live
--      Amadeus call. Editorial range only; never used for actual
--      booking. Shape: `{ from: int, to?: int, currency: string }`.
--
--   3. `display_order` — an integer that overrides the default sort
--      order (currently insertion order). Lower comes first. Lets
--      editors push the signature suite to the top and the cheapest
--      room to the bottom without ALTER-ing the table.
--
-- Notes on `indicative_price_minor`:
--   - Stored as jsonb (not a numeric column) because the range may be
--     one-sided ("from 1 200 €", no upper bound) and we want to surface
--     a currency code per row in case we later add a multi-currency
--     property (cf. Phase 11+ currency selector). Validated at read
--     time by Zod.
--   - "Minor unit" matches the existing Amadeus offer pricing
--     convention used in `packages/integrations/amadeus`. Keeps a
--     single mental model across the codebase.
--   - GIN index because we'll likely filter by currency or unbounded-
--     range presence in the catalog list view later.
--
-- Skill: supabase-postgres-rls (additive), content-modeling.

alter table public.hotel_rooms
  add column if not exists is_signature boolean not null default false,
  add column if not exists indicative_price_minor jsonb,
  add column if not exists display_order integer;

create index if not exists hotel_rooms_is_signature_idx
  on public.hotel_rooms (hotel_id, is_signature)
  where is_signature = true;

create index if not exists hotel_rooms_display_order_idx
  on public.hotel_rooms (hotel_id, display_order nulls last, id);

create index if not exists hotel_rooms_indicative_price_minor_gin_idx
  on public.hotel_rooms using gin (indicative_price_minor);

comment on column public.hotel_rooms.is_signature is
  'Editorial signature-suite flag. Drives the "Signature" badge on the list card and a meta-title suffix on the sub-page.';

comment on column public.hotel_rooms.indicative_price_minor is
  'Editorial indicative price range. Shape: { from: int, to?: int, currency: "EUR" | "USD" | "GBP" | "CHF" }, amounts in minor units (cents for EUR).';

comment on column public.hotel_rooms.display_order is
  'Manual sort key for the room list. Lower comes first; NULLs sort last (default ordering kicks in via the secondary id key).';
