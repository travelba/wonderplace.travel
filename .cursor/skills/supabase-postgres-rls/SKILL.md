---
name: supabase-postgres-rls
description: Supabase PostgreSQL schema, migrations, and Row-Level Security policies for ConciergeTravel.fr. Use when adding/altering tables, indexes, RLS policies, generated columns, JSONB fields, or any database concern.
---

# Supabase PostgreSQL + RLS — ConciergeTravel.fr

The cahier des charges mandates **Supabase PostgreSQL with RLS native** (CDC §2). Every table that holds business data must have RLS enabled with explicit policies. We never disable RLS.

## Triggers

Invoke when:
- Creating a migration in `packages/db/migrations/`.
- Adding or altering tables: `hotels`, `hotel_rooms`, `bookings`, `editorial_pages`, `loyalty_members`, `booking_requests_email`, `price_comparisons`, `authors`, `profiles`, `redirects`, etc.
- Writing or editing RLS policies.
- Adding indexes, generated columns, JSONB fields, enum types.

## Tables and core fields (CDC v3.0 §4)

### `hotels`
- `id uuid pk default gen_random_uuid()`, `slug text unique not null`, `slug_en text unique`
- `name text not null`, `name_en text`
- `stars int check (stars = 5)`, `is_palace bool default false`
- `region text not null`, `department text`, `city text not null`, `district text`
- `address text`, `latitude decimal(9,6)`, `longitude decimal(9,6)`
- `amadeus_hotel_id text`, `little_hotel_id text`, `makcorps_hotel_id text` (cf. addendum v3.2)
- `booking_mode text not null check (booking_mode in ('amadeus','little','email','display_only'))`
- `description_fr text`, `description_en text`
- `highlights jsonb`, `amenities jsonb`, `restaurant_info jsonb`, `spa_info jsonb`
- `google_place_id text`, `google_rating decimal(2,1)`, `google_reviews_count int`, `last_reviews_sync timestamptz`
- `meta_title_fr/_en text`, `meta_desc_fr/_en text`, `faq_content jsonb`
- `is_little_catalog bool default false`
- `atout_france_id text`, `priority text default 'P1' check (priority in ('P0','P1','P2'))`
- `is_published bool default false`, `created_at`, `updated_at` (trigger)

### `hotel_rooms`
- `id uuid pk`, `hotel_id uuid references hotels(id) on delete cascade`
- `room_code text not null`, `name_fr/_en text`, `description_fr/_en text`
- `max_occupancy int`, `bed_type text`, `size_sqm int`, `amenities jsonb`, `images jsonb`

### `bookings`
- `id uuid pk`, `booking_ref text unique not null` (format `CT-YYYYMMDD-XXXXX`)
- `amadeus_pnr text`, `little_booking_id text`
- `hotel_id uuid references hotels(id)`, `room_id uuid references hotel_rooms(id)`
- `user_id uuid references auth.users(id)`
- Guest: `guest_firstname/lastname/email/phone`
- Stay: `checkin_date`, `checkout_date`, `nights int generated always as (checkout_date - checkin_date) stored`, `adults`, `children`
- Pricing: `rate_code`, `price_per_night`, `total_price`, `currency default 'EUR'`, `commission_rate`, `commission_amount`
- `cancellation_policy jsonb` (verbatim from Amadeus), `cancellation_deadline timestamptz`
- `payment_status text default 'pending' check (... in ('pending','authorized','captured','cancelled','refunded'))`
- `amadeus_payment_ref text`
- `status text default 'pending' check (... in ('pending','confirmed','cancelled','no_show','completed'))`
- `booking_channel text default 'amadeus' check (... in ('amadeus','little','email'))`
- `loyalty_tier text`, `loyalty_benefits jsonb`

### `editorial_pages`
- `id uuid`, `slug_fr text unique not null`, `slug_en text unique`
- `type text check (type in ('classement','thematique','region','guide','comparatif','saisonnier'))`
- `title_fr/_en`, `meta_desc_fr/_en`, `aeo_block_fr/_en` (40–60 mots)
- `hotel_ids uuid[]`, `author_id uuid references authors(id)`, `last_updated date`, `faq_content jsonb`, `word_count_target int`
- `status text default 'draft' check (status in ('draft','published'))`, `priority text check (priority in ('P0','P1','P2','P3'))`

### `loyalty_members`
- `id uuid pk references auth.users(id) on delete cascade`
- `tier text default 'free' check (tier in ('free','premium'))`, `tier_expiry date`, `total_bookings int default 0`
- `premium_price decimal(8,2)`

### `booking_requests_email`
- `id`, `hotel_id`, `guest_*`, `requested_checkin/checkout`, `room_preference`, `message`, `status (new/in_progress/quoted/booked/declined)`, `assigned_to`, `internal_notes`, `created_at`

### `price_comparisons`
- `id`, `hotel_id`, `checkin_date`, `checkout_date`, `price_concierge`, `price_booking`, `price_expedia`, `price_hotelscom`, `price_official`, `expires_at`

### `authors`, `profiles`, `redirects`

## Non-negotiable rules

### RLS
- `alter table <t> enable row level security;` on every business table.
- `service_role` bypass for migrations and admin server work; never expose service role to the client.
- Policies separated per role: `anon`, `authenticated`, `editor` (claim-based), `admin`, `operator`.
- Public read on `hotels`, `editorial_pages`, `hotel_rooms` only when `is_published = true`.
- Booking write policies allow only matching `auth.uid() = user_id` for SELECT/UPDATE; INSERT goes through service role from server actions.
- Loyalty members readable by owner + admin; writable by service role.

### Migrations
- Files numbered `NNNN_description.sql`. Idempotent if possible. Drizzle schema kept in sync.
- Each migration is reviewable as plain SQL. We commit raw SQL, not ORM-generated.
- New columns are nullable or have defaults to keep deploy zero-downtime.

### Indexes
- `hotels(slug)` unique, `hotels(is_published, region, city)`, `hotels(makcorps_hotel_id) where makcorps_hotel_id is not null`.
- `bookings(user_id, status)`, `bookings(checkin_date)` for reporting.
- GIN on `hotels.faq_content`, `editorial_pages.faq_content`, `hotels.amenities`.
- `editorial_pages(slug_fr)` unique, `(type, status, priority)`.

### Generated columns and triggers
- `bookings.nights` generated.
- `updated_at` trigger via shared function `set_updated_at()`.
- Slug uniqueness validated by partial unique indexes when locale is involved.

### JSONB
- Validated by Zod at app layer before insert/update.
- Document expected shape in a comment at the top of the migration.

## Anti-patterns to refuse

- Disabling RLS to "make it work".
- Adding a policy `using (true)` for any role that accepts user input.
- Writing migrations through Supabase Studio UI (must be in versioned SQL).
- Storing card data, even hashed (CDC §11 — PCI is delegated to Amadeus).
- Selecting `*` from `auth.users` in app code.

## References

- CDC v3.0 §4 (data model), §11 (security), addendum v3.2 (price_comparisons + makcorps_hotel_id).
- `auth-role-management`, `security-engineering` skills.
