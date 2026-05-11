-- 0005 — RLS performance consolidation. Fixes two Supabase advisor warnings:
--
--   1. `auth_rls_initplan` — every call to `auth.uid()` / `auth.jwt() ->> 'role'`
--      inside a USING / WITH CHECK clause is re-evaluated *per row*. Wrapping
--      them in `(select ...)` lets Postgres evaluate once per query.
--   2. `multiple_permissive_policies` — staff write policies declared
--      `FOR ALL` overlapped read policies for the same role, so the planner
--      evaluated both for every SELECT. We split each staff `FOR ALL` into
--      separate `FOR INSERT / UPDATE / DELETE` policies so SELECT is owned by
--      a single permissive policy, and merge owner+staff SELECT/UPDATE
--      branches where both targeted the `authenticated` role.
--
-- Skill: supabase-postgres-rls (RLS perf + ABAC patterns).

----------------------------------------------------------------
-- audit_logs
----------------------------------------------------------------
drop policy if exists audit_logs_staff_read on public.audit_logs;
create policy audit_logs_staff_read on public.audit_logs
  for select to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['operator', 'admin']));

----------------------------------------------------------------
-- authors
----------------------------------------------------------------
drop policy if exists authors_write_staff on public.authors;

create policy authors_insert_staff on public.authors
  for insert to authenticated
  with check ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'admin']));

create policy authors_update_staff on public.authors
  for update to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'admin']))
  with check ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'admin']));

create policy authors_delete_staff on public.authors
  for delete to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'admin']));

----------------------------------------------------------------
-- hotels
----------------------------------------------------------------
drop policy if exists hotels_write_staff on public.hotels;

create policy hotels_insert_staff on public.hotels
  for insert to authenticated
  with check ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

create policy hotels_update_staff on public.hotels
  for update to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']))
  with check ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

create policy hotels_delete_staff on public.hotels
  for delete to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

----------------------------------------------------------------
-- hotel_rooms
----------------------------------------------------------------
drop policy if exists hotel_rooms_write_staff on public.hotel_rooms;

create policy hotel_rooms_insert_staff on public.hotel_rooms
  for insert to authenticated
  with check ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

create policy hotel_rooms_update_staff on public.hotel_rooms
  for update to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']))
  with check ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

create policy hotel_rooms_delete_staff on public.hotel_rooms
  for delete to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

----------------------------------------------------------------
-- editorial_pages
----------------------------------------------------------------
drop policy if exists editorial_pages_write_editorial on public.editorial_pages;

create policy editorial_pages_insert_editorial on public.editorial_pages
  for insert to authenticated
  with check ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'admin']));

create policy editorial_pages_update_editorial on public.editorial_pages
  for update to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'admin']))
  with check ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'admin']));

create policy editorial_pages_delete_editorial on public.editorial_pages
  for delete to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['editor', 'seo', 'admin']));

----------------------------------------------------------------
-- profiles
----------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

----------------------------------------------------------------
-- loyalty_members
----------------------------------------------------------------
drop policy if exists loyalty_select_own_or_staff on public.loyalty_members;
drop policy if exists loyalty_write_staff on public.loyalty_members;

create policy loyalty_members_select on public.loyalty_members
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select auth.jwt() ->> 'role') = any (array['operator', 'admin'])
  );

create policy loyalty_members_insert_staff on public.loyalty_members
  for insert to authenticated
  with check ((select auth.jwt() ->> 'role') = any (array['operator', 'admin']));

create policy loyalty_members_update_staff on public.loyalty_members
  for update to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['operator', 'admin']))
  with check ((select auth.jwt() ->> 'role') = any (array['operator', 'admin']));

create policy loyalty_members_delete_staff on public.loyalty_members
  for delete to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['operator', 'admin']));

----------------------------------------------------------------
-- bookings — merge own+staff for SELECT and UPDATE (single permissive each)
----------------------------------------------------------------
drop policy if exists bookings_select_own on public.bookings;
drop policy if exists bookings_select_staff on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select auth.jwt() ->> 'role') = any (array['operator', 'admin'])
  );

drop policy if exists bookings_insert_own on public.bookings;
create policy bookings_insert_own on public.bookings
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists bookings_update_own on public.bookings;
drop policy if exists bookings_update_staff on public.bookings;
create policy bookings_update on public.bookings
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select auth.jwt() ->> 'role') = any (array['operator', 'admin'])
  )
  with check (
    user_id = (select auth.uid())
    or (select auth.jwt() ->> 'role') = any (array['operator', 'admin'])
  );

----------------------------------------------------------------
-- booking_requests_email — merge insert (customer+staff), wrap auth on others
----------------------------------------------------------------
drop policy if exists booking_requests_email_select on public.booking_requests_email;
create policy booking_requests_email_select on public.booking_requests_email
  for select to authenticated
  using (
    submitted_by = (select auth.uid())
    or (select auth.jwt() ->> 'role') = any (array['operator', 'admin'])
  );

drop policy if exists booking_requests_email_insert_customer on public.booking_requests_email;
drop policy if exists booking_requests_email_insert_staff on public.booking_requests_email;
create policy booking_requests_email_insert on public.booking_requests_email
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'role') = any (array['operator', 'admin'])
    or (
      coalesce((select auth.jwt() ->> 'role'), 'customer') <> all (
        array['editor', 'seo', 'operator', 'admin']
      )
      and (submitted_by is null or submitted_by = (select auth.uid()))
    )
  );

drop policy if exists booking_requests_email_update_staff on public.booking_requests_email;
create policy booking_requests_email_update_staff on public.booking_requests_email
  for update to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['operator', 'admin']))
  with check ((select auth.jwt() ->> 'role') = any (array['operator', 'admin']));

drop policy if exists booking_requests_email_delete_staff on public.booking_requests_email;
create policy booking_requests_email_delete_staff on public.booking_requests_email
  for delete to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['operator', 'admin']));

----------------------------------------------------------------
-- price_comparisons (single policy, FOR ALL is fine — just wrap auth)
----------------------------------------------------------------
drop policy if exists price_comparisons_staff on public.price_comparisons;
create policy price_comparisons_staff on public.price_comparisons
  for all to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['operator', 'admin', 'seo']))
  with check ((select auth.jwt() ->> 'role') = any (array['operator', 'admin', 'seo']));

----------------------------------------------------------------
-- redirects (single policy, FOR ALL is fine — just wrap auth)
----------------------------------------------------------------
drop policy if exists redirects_staff on public.redirects;
create policy redirects_staff on public.redirects
  for all to authenticated
  using ((select auth.jwt() ->> 'role') = any (array['seo', 'admin']))
  with check ((select auth.jwt() ->> 'role') = any (array['seo', 'admin']));

insert into public._cct_sql_migrations (filename, applied_at)
  values ('0005_db_rls_perf_consolidation.sql', timezone('utc', now()))
  on conflict do nothing;
