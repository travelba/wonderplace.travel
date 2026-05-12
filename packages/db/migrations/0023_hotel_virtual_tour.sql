-- 0023 — Hotels: virtual tour URL (Matterport / Kuula iframe embed).
--
-- Phase 11.4 (gap analysis Peninsula §5 — "Matterport tour 3D").
--
-- Adds one optional `text` column carrying the external URL of an
-- immersive 3D / 360° tour of the property. The public hotel detail
-- page renders this inside a sandboxed `<iframe>` below the photo
-- gallery and surfaces it as Schema.org `Hotel.tourBookingPage` in
-- JSON-LD (a Google-supported field for "where can I view/book a
-- tour of this place?").
--
-- Why only two providers (Matterport + Kuula):
--   - The Content-Security-Policy `frame-src` directive must
--     explicitly whitelist every host the page may embed (see
--     `apps/web/src/lib/security/csp.ts`). Allowing an open
--     `frame-src https:` would torpedo CSP's value as an
--     anti-clickjacking control.
--   - Editorial workflow controls which providers we curate.
--     Letting any host through here would force a CSP relaxation
--     each time a new vendor surfaces.
--   - Both vendors expose stable iframe contracts:
--       * Matterport — `https://my.matterport.com/show/?m={modelId}`
--         (also `kiosk.matterport.com` for the touch-screen variant
--         which we deliberately reject — we never want kiosk UX
--         inside our own page).
--       * Kuula — `https://kuula.co/share/{id}` or `https://kuula.co/post/{id}`.
--
-- Future providers (Spinview, Roundme, …) can be added by:
--   1. Extending the CHECK regex below in a follow-up migration.
--   2. Adding the host to `FRAME_HOSTS` in `csp.ts`.
--   3. Documenting the per-vendor iframe contract in
--      `apps/web/src/components/hotel/hotel-virtual-tour.tsx`.
--
-- Length cap: 512 chars — Matterport `?m=` model IDs are 11
-- characters; Kuula IDs are 7-10. Even with query params (presets,
-- branding) the longest real URLs sit well under 200. 512 is a
-- defensive ceiling against editorial copy-paste of tracking
-- garbage.
--
-- We deliberately do NOT model this as jsonb (with provider /
-- title / language fields) — those derived facts are extractable
-- from the URL and the page already carries the hotel title. A
-- plain text column keeps the migration tight and the seed file
-- trivially readable.
--
-- Skill: supabase-postgres-rls (additive), security-engineering.

alter table public.hotels
  add column if not exists virtual_tour_url text;

-- HTTPS-only, host-restricted to vetted providers, max length 512.
-- The regex is intentionally narrow: anchored on either
-- `https://my.matterport.com/` or `https://kuula.co/` to forbid
-- subdomain takeover via `https://my.matterport.com.evil.test`.
-- Trailing path/query characters are restricted to a conservative
-- URL-safe set; this rejects whitespace, fragments containing
-- script payloads, and embedded HTML entities.
alter table public.hotels
  add constraint hotels_virtual_tour_url_ck
  check (
    virtual_tour_url is null
    or (
      length(virtual_tour_url) <= 512
      and virtual_tour_url ~ '^https://(my\.matterport\.com|kuula\.co)/[A-Za-z0-9/_\-.?=&%]+$'
    )
  );

comment on column public.hotels.virtual_tour_url is
  'External URL of an immersive 3D / 360° tour (Matterport or Kuula). Rendered as a sandboxed iframe on the hotel detail page and emitted as Schema.org Hotel.tourBookingPage in JSON-LD. NULL when no tour is curated. See migration 0023 + apps/web/src/lib/security/csp.ts.';

----------------------------------------------------------------
-- Migration log
----------------------------------------------------------------
insert into public._cct_sql_migrations (filename, applied_at)
  values ('0023_hotel_virtual_tour.sql', timezone('utc', now()))
  on conflict do nothing;
