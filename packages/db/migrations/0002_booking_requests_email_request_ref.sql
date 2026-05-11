-- ConciergeTravel.fr — Phase 6 wave A
--
-- Adds a public-facing `request_ref` (CT-YYYYMMDD-XXXXX) to
-- `booking_requests_email` so the email-mode tunnel can surface a stable
-- confirmation code to the guest (mirrors `bookings.booking_ref`).
--
-- Skill: booking-engine, supabase-postgres-rls.

alter table public.booking_requests_email
  add column if not exists request_ref text;

-- Backfill any rows lacking a request_ref with a deterministic placeholder
-- derived from the row id (uuid hex is `[0-9a-f]`, upper()-cased into
-- `[0-9A-F]` ⊂ the constraint alphabet). New inserts come with a freshly
-- generated CT-YYYYMMDD-XXXXX reference (see
-- `apps/web/src/server/booking/email-request.ts`).
update public.booking_requests_email
   set request_ref = concat(
     'CT-',
     upper(substring(replace(id::text, '-', '') from 1 for 8)),
     '-',
     upper(substring(replace(id::text, '-', '') from 9 for 5))
   )
 where request_ref is null;

alter table public.booking_requests_email
  alter column request_ref set not null;

alter table public.booking_requests_email
  add constraint booking_requests_email_request_ref_unique unique (request_ref);

alter table public.booking_requests_email
  add constraint booking_requests_email_request_ref_format_ck
  check (request_ref ~ '^CT-[0-9A-Z]{8}-[A-Z0-9]{5}$');

create index if not exists booking_requests_email_request_ref_idx
  on public.booking_requests_email (request_ref);
