-- 0010 — Hotel room subpages: slug + long descriptions + hero media.
--
-- Phase 10.1 (gap analysis Peninsula §6 — score 1/5 → 4/5 once shipped).
-- Each room type becomes an indexable sub-page at
-- `/hotel/{hotel-slug}/chambres/{room-slug}`, which requires:
--
--   * a URL-safe `slug` (unique within a hotel),
--   * a long, editorial-grade description (FR + EN) distinct from the
--     short list-card teaser already in `description_fr`/`description_en`,
--   * a dedicated hero image (Cloudinary public_id) for the LCP slot of
--     the sub-page — falls back to `images[0]` then to the hotel hero.
--
-- The new `slug` column is filled from `room_code` for any existing rows
-- (room_code already respects the `[a-z0-9-]` slug grammar in our seed
-- data), then a CHECK + UNIQUE constraint enforces the contract going
-- forward. Editors will be able to override the slug from the back-office
-- once Phase 8.1 (Payload sync) lands.
--
-- Skill: supabase-postgres-rls (additive, no RLS change) + content-modeling.

alter table public.hotel_rooms
  add column if not exists slug text,
  add column if not exists long_description_fr text,
  add column if not exists long_description_en text,
  add column if not exists hero_image text;

-- Backfill `slug` from `room_code` so the NOT NULL + check land cleanly.
-- `room_code` is currently used as a stable identifier and follows the
-- same `[a-z0-9-]+` shape on every existing record.
update public.hotel_rooms
   set slug = room_code
 where slug is null;

-- Idempotent constraint adds (Postgres has no `if not exists` for
-- constraints; we look them up in the catalog first).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hotel_rooms_slug_ck'
  ) then
    alter table public.hotel_rooms
      add constraint hotel_rooms_slug_ck
      check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'hotel_rooms_hotel_slug_unique'
  ) then
    alter table public.hotel_rooms
      add constraint hotel_rooms_hotel_slug_unique
      unique (hotel_id, slug);
  end if;
end$$;

alter table public.hotel_rooms
  alter column slug set not null;

comment on column public.hotel_rooms.slug is
  'URL-safe slug used in /hotel/{hotel}/chambres/{room-slug}. Unique within a hotel.';
comment on column public.hotel_rooms.long_description_fr is
  'Editorial long-form FR description (200-600 words). Rendered on the room sub-page.';
comment on column public.hotel_rooms.long_description_en is
  'Editorial long-form EN description. Falls back to FR when null.';
comment on column public.hotel_rooms.hero_image is
  'Cloudinary public_id for the room sub-page hero. Falls back to images[0] then hotel hero.';
