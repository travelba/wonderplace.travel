-- 0006 — Hide the internal migration runner state table from the PostgREST
-- API. `public._cct_sql_migrations` is only ever touched by our own runner
-- via the service-role key (which bypasses RLS), so there's no legitimate
-- reason for anon / authenticated roles to see it.
--
-- We do *not* move it to a separate schema (would force the runner to be
-- aware of search_path quirks). Instead we revoke the default grants so
-- PostgREST returns `relation does not exist` and Supabase advisors stop
-- flagging the table as "RLS enabled, no policies".
--
-- Skill: security-engineering (least privilege).

revoke all on table public._cct_sql_migrations from anon;
revoke all on table public._cct_sql_migrations from authenticated;

-- Keep service_role grants intact (the runner uses the service-role key).
grant select, insert on table public._cct_sql_migrations to service_role;

comment on table public._cct_sql_migrations is
  'Internal migration runner state. Service-role only — exposed neither to anon nor authenticated.';

insert into public._cct_sql_migrations (filename, applied_at)
  values ('0006_db_lock_internal_migrations_table.sql', timezone('utc', now()))
  on conflict do nothing;
