-- 0025 — Hotels: external identifiers (OTA + knowledge-graph + reservation).
--
-- Phase 12.x (gap analysis "fiches Palace de référence"). The audit on
-- 30 published Palaces showed that the existing schema covered editorial
-- data well but exposed *zero* of the external identifiers that drive
--   (a) the booking engine (Amadeus, Little Hotelier),
--   (b) the price comparator (Makcorps already there, but not the
--       upstream OTA ids that power the persisted_fallback),
--   (c) AggregateRating in JSON-LD (Google Places, TripAdvisor),
--   (d) agentic discoverability (Wikidata / Wikipedia / Commons),
--   (e) the booking-mode=email CTA on hotels not in the GDS catalog.
--
-- This migration adds one column per identifier so each one is
--   - indexable (we'll join from cron syncs and admin lookups),
--   - independently editable in Payload (one field, one source),
--   - searchable (SELECT WHERE wikidata_id = 'Q...').
--
-- Why not a single `external_ids jsonb`?
--   - JSONB blobs hide the schema from the editor and from typed reads.
--   - Several of these IDs are used as JOIN keys in cron scripts
--     (price-comparison history, reviews sync) — indexing a jsonb key
--     requires an expression index and loses query plan stability.
--   - Each ID has a *very* different lifecycle: Wikidata is monthly,
--     Google Place is yearly, TripAdvisor moves rarely. Splitting
--     them into columns lets us track `updated_at_<source>` later
--     without rewriting a JSON blob on every refresh.
--
-- All values are nullable: an early-stage editorial fiche may have
-- only a Wikidata ID; we'll backfill the rest via cron from there
-- (`scripts/editorial-pilot/src/enrich/wikidata-resolver.ts` cascades
-- a single SPARQL into ~10 sister identifiers).
--
-- Format constraints — kept narrow enough to catch typos but lax enough
-- to accept future vendor formats:
--   - wikidata_id     ~ '^Q[1-9][0-9]*$'           (e.g. Q1573604)
--   - tripadvisor_location_id  ~ '^[0-9]+$'        (numeric)
--   - booking_com_hotel_id     ~ '^[a-z0-9-]+$'    (slug-style)
--   - expedia_property_id      ~ '^[0-9]+$'
--   - hotels_com_hotel_id      ~ '^[0-9]+$'
--   - agoda_hotel_id           ~ '^[0-9]+$'
--   - atout_france_id          ~ '^[A-Z0-9-]+$'    (regulator format, kept flexible)
--   - official_url             ~ '^https?://'
--   - email_reservations       ~ '@'               (light, RFC-compliant validation lives in app)
--   - commons_category         ~ '^[^/]+$'         (no leading "Category:" or slashes)
--
-- Skill: supabase-postgres-rls (additive), content-modeling, geo-llm-optimization.

alter table public.hotels
  add column if not exists wikidata_id text,
  add column if not exists wikipedia_url_fr text,
  add column if not exists wikipedia_url_en text,
  add column if not exists tripadvisor_location_id text,
  add column if not exists booking_com_hotel_id text,
  add column if not exists expedia_property_id text,
  add column if not exists hotels_com_hotel_id text,
  add column if not exists agoda_hotel_id text,
  add column if not exists official_url text,
  add column if not exists email_reservations text,
  add column if not exists commons_category text,
  add column if not exists external_sameas jsonb;

-- Shape constraints (additive — only enforced on new writes; existing
-- NULLs pass through).

alter table public.hotels
  add constraint hotels_wikidata_id_ck
  check (wikidata_id is null or wikidata_id ~ '^Q[1-9][0-9]*$');

alter table public.hotels
  add constraint hotels_tripadvisor_id_ck
  check (tripadvisor_location_id is null or tripadvisor_location_id ~ '^[0-9]+$');

alter table public.hotels
  add constraint hotels_booking_id_ck
  check (booking_com_hotel_id is null or booking_com_hotel_id ~ '^[a-z0-9-]+$');

alter table public.hotels
  add constraint hotels_expedia_id_ck
  check (expedia_property_id is null or expedia_property_id ~ '^[0-9]+$');

alter table public.hotels
  add constraint hotels_hotelscom_id_ck
  check (hotels_com_hotel_id is null or hotels_com_hotel_id ~ '^[0-9]+$');

alter table public.hotels
  add constraint hotels_agoda_id_ck
  check (agoda_hotel_id is null or agoda_hotel_id ~ '^[0-9]+$');

alter table public.hotels
  add constraint hotels_official_url_ck
  check (official_url is null or official_url ~ '^https?://');

alter table public.hotels
  add constraint hotels_email_reservations_ck
  check (email_reservations is null or email_reservations like '%@%.%');

alter table public.hotels
  add constraint hotels_commons_category_ck
  check (commons_category is null or commons_category !~ '^Category:|/');

alter table public.hotels
  add constraint hotels_external_sameas_shape_ck
  check (
    external_sameas is null
    or jsonb_typeof(external_sameas) = 'object'
  );

-- Indexes on the most-queried OTA / KG identifiers. Partial indexes
-- because the columns are nullable and we only ever look up rows that
-- *have* the identifier (cron refresh + admin lookup).

create index if not exists hotels_wikidata_id_idx
  on public.hotels (wikidata_id)
  where wikidata_id is not null;

create index if not exists hotels_tripadvisor_id_idx
  on public.hotels (tripadvisor_location_id)
  where tripadvisor_location_id is not null;

create index if not exists hotels_booking_id_idx
  on public.hotels (booking_com_hotel_id)
  where booking_com_hotel_id is not null;

-- Column documentation (visible in Supabase Studio + pg_dump).

comment on column public.hotels.wikidata_id is
  'Wikidata entity ID (e.g. Q1573604). Cascades into 10+ sister identifiers via one SPARQL — see scripts/editorial-pilot/src/enrich/wikidata-resolver.ts. Surfaces in JSON-LD as Schema.org additionalType and sameAs (knowledge-graph anchor for AI Overview).';

comment on column public.hotels.wikipedia_url_fr is
  'French Wikipedia article URL. Surfaces in JSON-LD `subjectOf` (Article schema) and as a sameAs link. Validated by Zod at the reader (https only, *.wikipedia.org host).';

comment on column public.hotels.wikipedia_url_en is
  'English Wikipedia article URL. Same handling as the French variant.';

comment on column public.hotels.tripadvisor_location_id is
  'TripAdvisor numeric location ID. Used to fetch AggregateRating (TripAdvisor Content API) and as a sameAs in JSON-LD. The actual rating snapshot lives in tripadvisor_rating/tripadvisor_reviews_count (added in a later migration when the sync is wired).';

comment on column public.hotels.booking_com_hotel_id is
  'Booking.com slug-style hotel ID (e.g. "le-bristol-paris"). Used by the price comparator persisted fallback (price_comparisons_history.price_booking) and as a sameAs target. We never expose this on the public UI per addendum v3.2 (no logos / no clickable refs).';

comment on column public.hotels.expedia_property_id is
  'Expedia numeric property ID. Used by the price comparator persisted fallback. Same display restriction as Booking.';

comment on column public.hotels.hotels_com_hotel_id is
  'Hotels.com numeric hotel ID. Used by the price comparator persisted fallback. Same display restriction.';

comment on column public.hotels.agoda_hotel_id is
  'Agoda numeric hotel ID. Reserved for the next vendor enabled in the comparator (currently Makcorps + Apify only).';

comment on column public.hotels.official_url is
  'Hotel official website (HTTPS). Surfaces in JSON-LD `url` *alongside* the canonical fiche URL when present (Schema.org allows multiple URLs on a Hotel) and as a sameAs. Powers the "Site officiel" link in the press kit section.';

comment on column public.hotels.email_reservations is
  'Reservation email (booking-mode=email CTA). Surfaces as the mailto target on the booking widget for hotels that are neither in the Amadeus catalog nor in Little Hotelier. Never logged or rendered as plain text outside the CTA.';

comment on column public.hotels.commons_category is
  'Wikimedia Commons category name (without the "Category:" prefix). Powers the photo-import pipeline that pulls CC-licensed images from Commons into Cloudinary. Stored separately from external_sameas because the photo-pipeline reads it on every refresh while sameAs links are emit-only.';

comment on column public.hotels.external_sameas is
  'Optional jsonb dictionary of social / press / industry links surfaced as Schema.org sameAs. Keys are vendor slugs ("instagram", "facebook", "youtube", "linkedin", "michelin", "tablet", "lhw", "virtuoso", "forbes"). Each value is an HTTPS URL. Validated by Zod at the reader; the JSON-LD builder filters out non-HTTPS entries defensively.';

----------------------------------------------------------------
-- Migration log
----------------------------------------------------------------
insert into public._cct_sql_migrations (filename, applied_at)
  values ('0025_hotel_external_ids.sql', timezone('utc', now()))
  on conflict do nothing;
