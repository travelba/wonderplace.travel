-- 0007 — Final tune-up for Supabase `auth_rls_initplan` advisor.
--
-- The 0005 rewrite wrapped `auth.jwt() ->> 'role'` inside a SELECT, but the
-- linter only credits the optimisation when the `auth.<fn>()` call itself is
-- the *direct* child of the subquery. We therefore move the subquery one
-- level inwards: `((select auth.jwt()) ->> 'role')`.
--
-- We also tackle two remaining advisor findings:
--   * `anon_security_definer_function_executable` —
--     `public.handle_new_auth_user` is a trigger function and should never
--     be invocable via PostgREST. We REVOKE EXECUTE from anon/authenticated.
--   * `rls_enabled_no_policy` on `public._cct_sql_migrations` — RLS is now
--     pointless after 0006's REVOKE; disabling it silences the warning while
--     keeping the table inaccessible to non-service-role traffic.
--
-- Skill: supabase-postgres-rls + security-engineering.

----------------------------------------------------------------
-- audit_logs
----------------------------------------------------------------
drop policy if exists audit_logs_staff_read on public.audit_logs;
create policy audit_logs_staff_read on public.audit_logs
  for select to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin']));

----------------------------------------------------------------
-- authors
----------------------------------------------------------------
drop policy if exists authors_insert_staff on public.authors;
create policy authors_insert_staff on public.authors
  for insert to authenticated
  with check (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'admin']));

drop policy if exists authors_update_staff on public.authors;
create policy authors_update_staff on public.authors
  for update to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'admin']))
  with check (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'admin']));

drop policy if exists authors_delete_staff on public.authors;
create policy authors_delete_staff on public.authors
  for delete to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'admin']));

----------------------------------------------------------------
-- hotels
----------------------------------------------------------------
drop policy if exists hotels_insert_staff on public.hotels;
create policy hotels_insert_staff on public.hotels
  for insert to authenticated
  with check (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

drop policy if exists hotels_update_staff on public.hotels;
create policy hotels_update_staff on public.hotels
  for update to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']))
  with check (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

drop policy if exists hotels_delete_staff on public.hotels;
create policy hotels_delete_staff on public.hotels
  for delete to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

----------------------------------------------------------------
-- hotel_rooms
----------------------------------------------------------------
drop policy if exists hotel_rooms_insert_staff on public.hotel_rooms;
create policy hotel_rooms_insert_staff on public.hotel_rooms
  for insert to authenticated
  with check (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

drop policy if exists hotel_rooms_update_staff on public.hotel_rooms;
create policy hotel_rooms_update_staff on public.hotel_rooms
  for update to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']))
  with check (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

drop policy if exists hotel_rooms_delete_staff on public.hotel_rooms;
create policy hotel_rooms_delete_staff on public.hotel_rooms
  for delete to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'operator', 'admin']));

----------------------------------------------------------------
-- editorial_pages
----------------------------------------------------------------
drop policy if exists editorial_pages_insert_editorial on public.editorial_pages;
create policy editorial_pages_insert_editorial on public.editorial_pages
  for insert to authenticated
  with check (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'admin']));

drop policy if exists editorial_pages_update_editorial on public.editorial_pages;
create policy editorial_pages_update_editorial on public.editorial_pages
  for update to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'admin']))
  with check (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'admin']));

drop policy if exists editorial_pages_delete_editorial on public.editorial_pages;
create policy editorial_pages_delete_editorial on public.editorial_pages
  for delete to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['editor', 'seo', 'admin']));

----------------------------------------------------------------
-- loyalty_members
----------------------------------------------------------------
drop policy if exists loyalty_members_select on public.loyalty_members;
create policy loyalty_members_select on public.loyalty_members
  for select to authenticated
  using (
    id = (select auth.uid())
    or ((select auth.jwt()) ->> 'role') = any (array['operator', 'admin'])
  );

drop policy if exists loyalty_members_insert_staff on public.loyalty_members;
create policy loyalty_members_insert_staff on public.loyalty_members
  for insert to authenticated
  with check (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin']));

drop policy if exists loyalty_members_update_staff on public.loyalty_members;
create policy loyalty_members_update_staff on public.loyalty_members
  for update to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin']))
  with check (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin']));

drop policy if exists loyalty_members_delete_staff on public.loyalty_members;
create policy loyalty_members_delete_staff on public.loyalty_members
  for delete to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin']));

----------------------------------------------------------------
-- bookings
----------------------------------------------------------------
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select auth.jwt()) ->> 'role') = any (array['operator', 'admin'])
  );

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select auth.jwt()) ->> 'role') = any (array['operator', 'admin'])
  )
  with check (
    user_id = (select auth.uid())
    or ((select auth.jwt()) ->> 'role') = any (array['operator', 'admin'])
  );

----------------------------------------------------------------
-- booking_requests_email
----------------------------------------------------------------
drop policy if exists booking_requests_email_select on public.booking_requests_email;
create policy booking_requests_email_select on public.booking_requests_email
  for select to authenticated
  using (
    submitted_by = (select auth.uid())
    or ((select auth.jwt()) ->> 'role') = any (array['operator', 'admin'])
  );

drop policy if exists booking_requests_email_insert on public.booking_requests_email;
create policy booking_requests_email_insert on public.booking_requests_email
  for insert to authenticated
  with check (
    ((select auth.jwt()) ->> 'role') = any (array['operator', 'admin'])
    or (
      coalesce(((select auth.jwt()) ->> 'role'), 'customer') <> all (
        array['editor', 'seo', 'operator', 'admin']
      )
      and (submitted_by is null or submitted_by = (select auth.uid()))
    )
  );

drop policy if exists booking_requests_email_update_staff on public.booking_requests_email;
create policy booking_requests_email_update_staff on public.booking_requests_email
  for update to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin']))
  with check (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin']));

drop policy if exists booking_requests_email_delete_staff on public.booking_requests_email;
create policy booking_requests_email_delete_staff on public.booking_requests_email
  for delete to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin']));

----------------------------------------------------------------
-- price_comparisons
----------------------------------------------------------------
drop policy if exists price_comparisons_staff on public.price_comparisons;
create policy price_comparisons_staff on public.price_comparisons
  for all to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin', 'seo']))
  with check (((select auth.jwt()) ->> 'role') = any (array['operator', 'admin', 'seo']));

----------------------------------------------------------------
-- redirects
----------------------------------------------------------------
drop policy if exists redirects_staff on public.redirects;
create policy redirects_staff on public.redirects
  for all to authenticated
  using (((select auth.jwt()) ->> 'role') = any (array['seo', 'admin']))
  with check (((select auth.jwt()) ->> 'role') = any (array['seo', 'admin']));

----------------------------------------------------------------
-- handle_new_auth_user — trigger function, not for direct RPC
----------------------------------------------------------------
revoke execute on function public.handle_new_auth_user() from public;
revoke execute on function public.handle_new_auth_user() from anon;
revoke execute on function public.handle_new_auth_user() from authenticated;

----------------------------------------------------------------
-- _cct_sql_migrations — disable RLS, grants already revoked in 0006
----------------------------------------------------------------
alter table public._cct_sql_migrations disable row level security;

insert into public._cct_sql_migrations (filename, applied_at)
  values ('0007_db_rls_initplan_v2.sql', timezone('utc', now()))
  on conflict do nothing;
