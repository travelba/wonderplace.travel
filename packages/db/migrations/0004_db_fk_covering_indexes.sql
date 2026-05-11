-- 0004 — Covering indexes for foreign keys flagged by Supabase advisor
-- (lint `unindexed_foreign_keys`). Each FK below referenced a table that was
-- already indexed on its PK, but the *referencing* column was not — so
-- cascading DELETEs and JOINs forced a sequential scan.
--
-- Skill: supabase-postgres-rls (perf section).

create index if not exists audit_logs_actor_id_idx
  on public.audit_logs (actor_id);

create index if not exists booking_requests_email_assigned_to_idx
  on public.booking_requests_email (assigned_to);

create index if not exists booking_requests_email_submitted_by_idx
  on public.booking_requests_email (submitted_by);

create index if not exists bookings_hotel_id_idx
  on public.bookings (hotel_id);

create index if not exists bookings_room_id_idx
  on public.bookings (room_id);

create index if not exists editorial_pages_author_id_idx
  on public.editorial_pages (author_id);

insert into public._cct_sql_migrations (filename, applied_at)
  values ('0004_db_fk_covering_indexes.sql', timezone('utc', now()))
  on conflict do nothing;
