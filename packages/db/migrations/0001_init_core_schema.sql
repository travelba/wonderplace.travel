-- ConciergeTravel.fr — Phase 2 initial schema (CDC §4 + skills supabase-postgres-rls / auth-role-management)
--
-- JSONB shapes validated in app layer via Zod; never trust client JSON without parse.
--
-- RBAC for staff: policies use (auth.jwt() ->> 'role'). Mirror app_metadata.role into JWT
-- via Supabase Custom Access Token Hook (see docs/02-data-model.md).

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- authors (public personas for editorial attribution)
-- ---------------------------------------------------------------------------
create table public.authors (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  bio_fr text,
  bio_en text,
  avatar_cloudinary_id text,
  website_url_fr text,
  website_url_en text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint authors_slug_ck check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint authors_slug_unique unique (slug)
);

create trigger authors_set_updated_at
before update on public.authors
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- hotels
-- ---------------------------------------------------------------------------
create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  slug_en text,
  name text not null,
  name_en text,
  stars smallint not null default 5,
  constraint hotels_stars_ck check (stars = 5),
  is_palace boolean not null default false,
  region text not null,
  department text,
  city text not null,
  district text,
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  amadeus_hotel_id text,
  little_hotel_id text,
  makcorps_hotel_id text,
  booking_mode text not null,
  constraint hotels_booking_mode_ck check (
    booking_mode in ('amadeus', 'little', 'email', 'display_only')
  ),
  description_fr text,
  description_en text,
  highlights jsonb,
  amenities jsonb,
  restaurant_info jsonb,
  spa_info jsonb,
  google_place_id text,
  google_rating numeric(2, 1),
  google_reviews_count integer,
  last_reviews_sync timestamptz,
  meta_title_fr text,
  meta_title_en text,
  meta_desc_fr text,
  meta_desc_en text,
  faq_content jsonb,
  is_little_catalog boolean not null default false,
  atout_france_id text,
  priority text not null default 'P1',
  constraint hotels_priority_ck check (priority in ('P0', 'P1', 'P2')),
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hotels_slug_ck check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint hotels_slug_en_ck check (
    slug_en is null or slug_en ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint hotels_slug_unique unique (slug),
  constraint hotels_slug_en_unique unique (slug_en)
);

create index hotels_published_region_city_idx on public.hotels (is_published, region, city);
create unique index hotels_makcorps_hotel_id_idx
  on public.hotels (makcorps_hotel_id)
  where makcorps_hotel_id is not null;

create index hotels_faq_content_gin on public.hotels using gin (faq_content jsonb_path_ops);
create index hotels_amenities_gin on public.hotels using gin (amenities jsonb_path_ops);

create trigger hotels_set_updated_at
before update on public.hotels
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- hotel_rooms
-- ---------------------------------------------------------------------------
create table public.hotel_rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  room_code text not null,
  name_fr text,
  name_en text,
  description_fr text,
  description_en text,
  max_occupancy integer,
  bed_type text,
  size_sqm integer,
  amenities jsonb,
  images jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hotel_rooms_hotel_room_unique unique (hotel_id, room_code)
);

create index hotel_rooms_hotel_id_idx on public.hotel_rooms (hotel_id);

create index hotel_rooms_amenities_gin on public.hotel_rooms using gin (amenities jsonb_path_ops);

create trigger hotel_rooms_set_updated_at
before update on public.hotel_rooms
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- editorial_pages
-- ---------------------------------------------------------------------------
create table public.editorial_pages (
  id uuid primary key default gen_random_uuid(),
  slug_fr text not null,
  slug_en text,
  type text not null,
  constraint editorial_pages_type_ck check (
    type in ('classement', 'thematique', 'region', 'guide', 'comparatif', 'saisonnier')
  ),
  title_fr text not null,
  title_en text,
  meta_desc_fr text,
  meta_desc_en text,
  aeo_block_fr text,
  aeo_block_en text,
  hotel_ids uuid[],
  author_id uuid references public.authors (id) on delete set null,
  last_updated date,
  faq_content jsonb,
  word_count_target integer,
  status text not null default 'draft',
  constraint editorial_pages_status_ck check (status in ('draft', 'published')),
  priority text not null default 'P2',
  constraint editorial_pages_priority_ck check (priority in ('P0', 'P1', 'P2', 'P3')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint editorial_pages_slug_fr_ck check (slug_fr ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint editorial_pages_slug_en_ck check (
    slug_en is null or slug_en ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint editorial_pages_slug_fr_unique unique (slug_fr),
  constraint editorial_pages_slug_en_unique unique (slug_en)
);

create index editorial_pages_type_status_priority_idx
  on public.editorial_pages (type, status, priority);

create index editorial_pages_faq_content_gin
  on public.editorial_pages using gin (faq_content jsonb_path_ops);

create trigger editorial_pages_set_updated_at
before update on public.editorial_pages
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles (Supabase Auth extension)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale_pref text not null default 'fr',
  constraint profiles_locale_pref_ck check (locale_pref in ('fr', 'en')),
  newsletter_opt_in boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- loyalty_members
-- ---------------------------------------------------------------------------
create table public.loyalty_members (
  id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free',
  constraint loyalty_members_tier_ck check (tier in ('free', 'premium')),
  tier_expiry date,
  total_bookings integer not null default 0,
  premium_price numeric(8, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger loyalty_members_set_updated_at
before update on public.loyalty_members
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_ref text not null,
  amadeus_pnr text,
  little_booking_id text,
  hotel_id uuid references public.hotels (id) on delete restrict,
  room_id uuid references public.hotel_rooms (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  guest_firstname text not null,
  guest_lastname text not null,
  guest_email text not null,
  guest_phone text,
  checkin_date date not null,
  checkout_date date not null,
  constraint bookings_stay_ck check (checkout_date > checkin_date),
  nights integer generated always as (checkout_date - checkin_date) stored,
  adults smallint not null default 1,
  children smallint not null default 0,
  rate_code text,
  price_per_night numeric(12, 2),
  total_price numeric(12, 2),
  currency text not null default 'EUR',
  commission_rate numeric(6, 4),
  commission_amount numeric(12, 2),
  cancellation_policy jsonb,
  cancellation_deadline timestamptz,
  payment_status text not null default 'pending',
  constraint bookings_payment_status_ck check (
    payment_status in ('pending', 'authorized', 'captured', 'cancelled', 'refunded')
  ),
  amadeus_payment_ref text,
  status text not null default 'pending',
  constraint bookings_status_ck check (
    status in ('pending', 'confirmed', 'cancelled', 'no_show', 'completed')
  ),
  booking_channel text not null default 'amadeus',
  constraint bookings_channel_ck check (
    booking_channel in ('amadeus', 'little', 'email')
  ),
  loyalty_tier text,
  loyalty_benefits jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint bookings_booking_ref_unique unique (booking_ref),
  constraint bookings_booking_ref_format_ck check (
    booking_ref ~ '^CT-[0-9]{8}-[A-Za-z0-9]{5}$'
  )
);

create index bookings_user_status_idx on public.bookings (user_id, status);
create index bookings_checkin_idx on public.bookings (checkin_date);

create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- booking_requests_email (hôtels hors-réseau)
-- ---------------------------------------------------------------------------
create table public.booking_requests_email (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  submitted_by uuid references auth.users (id) on delete set null,
  guest_firstname text not null,
  guest_lastname text not null,
  guest_email text not null,
  guest_phone text,
  requested_checkin date not null,
  requested_checkout date not null,
  constraint booking_requests_email_stay_ck check (requested_checkout > requested_checkin),
  room_preference text,
  message text,
  status text not null default 'new',
  constraint booking_requests_email_status_ck check (
    status in ('new', 'in_progress', 'quoted', 'booked', 'declined')
  ),
  assigned_to uuid references auth.users (id) on delete set null,
  internal_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index booking_requests_email_hotel_idx on public.booking_requests_email (hotel_id);
create index booking_requests_email_status_idx on public.booking_requests_email (status);

create trigger booking_requests_email_set_updated_at
before update on public.booking_requests_email
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- price_comparisons (Makcorps / persistence)
-- ---------------------------------------------------------------------------
create table public.price_comparisons (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  checkin_date date not null,
  checkout_date date not null,
  constraint price_comparisons_stay_ck check (checkout_date > checkin_date),
  price_concierge numeric(12, 2),
  price_booking numeric(12, 2),
  price_expedia numeric(12, 2),
  price_hotelscom numeric(12, 2),
  price_official numeric(12, 2),
  raw_payload jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index price_comparisons_hotel_dates_idx
  on public.price_comparisons (hotel_id, checkin_date, checkout_date);

create index price_comparisons_expires_idx on public.price_comparisons (expires_at);

-- ---------------------------------------------------------------------------
-- redirects (Payload / SEO — consumée côté serveur)
-- ---------------------------------------------------------------------------
create table public.redirects (
  id uuid primary key default gen_random_uuid(),
  source_path text not null,
  target_path text not null,
  status_code smallint not null default 301,
  constraint redirects_status_code_ck check (status_code in (301, 302, 308)),
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint redirects_source_path_unique unique (source_path)
);

create trigger redirects_set_updated_at
before update on public.redirects
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.authors enable row level security;
alter table public.hotels enable row level security;
alter table public.hotel_rooms enable row level security;
alter table public.editorial_pages enable row level security;
alter table public.profiles enable row level security;
alter table public.loyalty_members enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_requests_email enable row level security;
alter table public.price_comparisons enable row level security;
alter table public.redirects enable row level security;
alter table public.audit_logs enable row level security;

-- JWT role helper (text, empty if missing)
-- staff = editor | seo | operator | admin

-- authors: public read
create policy authors_select_public
  on public.authors
  for select
  to anon, authenticated
  using (true);

create policy authors_write_staff
  on public.authors
  for all
  to authenticated
  using ((auth.jwt() ->> 'role') in ('editor', 'seo', 'admin'))
  with check ((auth.jwt() ->> 'role') in ('editor', 'seo', 'admin'));

-- hotels: published visible to world; staff sees all; staff mutates
create policy hotels_select_published
  on public.hotels
  for select
  to anon, authenticated
  using (is_published = true);

create policy hotels_write_staff
  on public.hotels
  for all
  to authenticated
  using ((auth.jwt() ->> 'role') in ('editor', 'seo', 'operator', 'admin'))
  with check ((auth.jwt() ->> 'role') in ('editor', 'seo', 'operator', 'admin'));

-- hotel_rooms: visible if parent hotel published
create policy hotel_rooms_select_published
  on public.hotel_rooms
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.hotels h
      where h.id = hotel_rooms.hotel_id
        and h.is_published = true
    )
  );

create policy hotel_rooms_write_staff
  on public.hotel_rooms
  for all
  to authenticated
  using ((auth.jwt() ->> 'role') in ('editor', 'seo', 'operator', 'admin'))
  with check ((auth.jwt() ->> 'role') in ('editor', 'seo', 'operator', 'admin'));

-- editorial
create policy editorial_pages_select_published
  on public.editorial_pages
  for select
  to anon, authenticated
  using (status = 'published');

create policy editorial_pages_write_editorial
  on public.editorial_pages
  for all
  to authenticated
  using ((auth.jwt() ->> 'role') in ('editor', 'seo', 'admin'))
  with check ((auth.jwt() ->> 'role') in ('editor', 'seo', 'admin'));

-- profiles
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- loyalty
create policy loyalty_select_own_or_staff
  on public.loyalty_members
  for select
  to authenticated
  using (
    id = auth.uid()
    or (auth.jwt() ->> 'role') in ('operator', 'admin')
  );

create policy loyalty_write_staff
  on public.loyalty_members
  for all
  to authenticated
  using ((auth.jwt() ->> 'role') in ('operator', 'admin'))
  with check ((auth.jwt() ->> 'role') in ('operator', 'admin'));

-- bookings
create policy bookings_select_own
  on public.bookings
  for select
  to authenticated
  using (user_id = auth.uid());

create policy bookings_select_staff
  on public.bookings
  for select
  to authenticated
  using ((auth.jwt() ->> 'role') in ('operator', 'admin'));

create policy bookings_insert_own
  on public.bookings
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy bookings_update_own
  on public.bookings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy bookings_update_staff
  on public.bookings
  for update
  to authenticated
  using ((auth.jwt() ->> 'role') in ('operator', 'admin'))
  with check ((auth.jwt() ->> 'role') in ('operator', 'admin'));

-- booking_requests_email
create policy booking_requests_email_select
  on public.booking_requests_email
  for select
  to authenticated
  using (
    submitted_by = auth.uid()
    or (auth.jwt() ->> 'role') in ('operator', 'admin')
  );

create policy booking_requests_email_insert_customer
  on public.booking_requests_email
  for insert
  to authenticated
  with check (
    coalesce(auth.jwt() ->> 'role', 'customer') not in ('editor', 'seo', 'operator', 'admin')
      and (
        submitted_by is null
        or submitted_by = auth.uid()
      )
  );

create policy booking_requests_email_insert_staff
  on public.booking_requests_email
  for insert
  to authenticated
  with check (
    (auth.jwt() ->> 'role') in ('operator', 'admin')
  );

create policy booking_requests_email_update_staff
  on public.booking_requests_email
  for update
  to authenticated
  using ((auth.jwt() ->> 'role') in ('operator', 'admin'))
  with check ((auth.jwt() ->> 'role') in ('operator', 'admin'));

create policy booking_requests_email_delete_staff
  on public.booking_requests_email
  for delete
  to authenticated
  using ((auth.jwt() ->> 'role') in ('operator', 'admin'));

-- price_comparisons (server-side + staff tooling)
create policy price_comparisons_staff
  on public.price_comparisons
  for all
  to authenticated
  using ((auth.jwt() ->> 'role') in ('operator', 'admin', 'seo'))
  with check ((auth.jwt() ->> 'role') in ('operator', 'admin', 'seo'));

-- redirects
create policy redirects_staff
  on public.redirects
  for all
  to authenticated
  using ((auth.jwt() ->> 'role') in ('seo', 'admin'))
  with check ((auth.jwt() ->> 'role') in ('seo', 'admin'));

-- audit_logs
create policy audit_logs_staff_read
  on public.audit_logs
  for select
  to authenticated
  using ((auth.jwt() ->> 'role') in ('operator', 'admin'));
