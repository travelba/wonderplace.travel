-- 0021 — User favorites (CDC §2.1, bloc 1 — auth-gated wishlist).
--
-- Phase 11.1 — closes the last open P2 item of the gap analysis "Reste à
-- faire" table on the hotel detail page header.
--
-- One row per (signed-in user, hotel) pair. Toggling a heart on the fiche
-- is a single INSERT or DELETE — there is no UPDATE path. We keep the
-- table deliberately narrow so future extensions (note, tags, sort order)
-- live in side tables, not as JSONB on the favorite row.
--
-- Privacy
-- -------
-- Unlike `bookings` (operators read everything for support) or
-- `loyalty_members` (staff read for tier audit), favorites are strictly
-- *private*: nobody sees a user's wishlist except the user themselves.
-- The RLS policies reflect that — operators and admins are NOT allowed
-- to read or write rows, even though their JWT role would normally
-- bypass the own-only check. If, later, a "guest concierge view"
-- feature needs operator access, we'll add a dedicated policy then.
--
-- Skill: supabase-postgres-rls, security-engineering.

----------------------------------------------------------------
-- Table
----------------------------------------------------------------
create table if not exists public.user_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_favorites_pk primary key (user_id, hotel_id)
);

comment on table public.user_favorites is
  'Per-user hotel wishlist (CDC §2.1). Private — neither operators nor admins can read others'' favorites.';
comment on column public.user_favorites.user_id is
  'FK to auth.users. Cascade-deletes when the account is removed.';
comment on column public.user_favorites.hotel_id is
  'FK to public.hotels. Cascade-deletes when the hotel is removed from the catalog.';

-- "My favorites" feed ordering on the future /compte/favoris page.
-- The PK index covers (user_id, hotel_id) for existence checks but is
-- not ordered usefully for created_at — add a dedicated index.
create index if not exists user_favorites_user_id_created_at_idx
  on public.user_favorites (user_id, created_at desc);

-- "How many users favorited this hotel?" — feeds a future popularity
-- signal in search/recommendation. Cheap to maintain (small table).
create index if not exists user_favorites_hotel_id_idx
  on public.user_favorites (hotel_id);

----------------------------------------------------------------
-- RLS — own-only
----------------------------------------------------------------
alter table public.user_favorites enable row level security;

drop policy if exists user_favorites_select_own on public.user_favorites;
create policy user_favorites_select_own on public.user_favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_favorites_insert_own on public.user_favorites;
create policy user_favorites_insert_own on public.user_favorites
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_favorites_delete_own on public.user_favorites;
create policy user_favorites_delete_own on public.user_favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Intentionally NO update policy — the row carries no mutable field.
-- If user_id or hotel_id ever changes, that's a delete + insert, not
-- an update.

----------------------------------------------------------------
-- Migration log
----------------------------------------------------------------
insert into public._cct_sql_migrations (filename, applied_at)
  values ('0021_user_favorites.sql', timezone('utc', now()))
  on conflict do nothing;
