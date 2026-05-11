-- ---------------------------------------------------------------------------
-- Auto-create `profiles` and `loyalty_members` rows for every new Supabase
-- Auth user. Without this trigger the RLS policies `profiles_select_own` /
-- `bookings_select_own` would return zero rows on first login.
--
-- Idempotent: rerunning replaces the trigger/function in place.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locale text;
  v_display text;
begin
  v_locale := coalesce(new.raw_user_meta_data ->> 'locale_pref', 'fr');
  if v_locale not in ('fr', 'en') then
    v_locale := 'fr';
  end if;

  v_display := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');

  insert into public.profiles (id, display_name, locale_pref, newsletter_opt_in)
  values (
    new.id,
    v_display,
    v_locale,
    coalesce((new.raw_user_meta_data ->> 'newsletter_opt_in')::boolean, false)
  )
  on conflict (id) do nothing;

  insert into public.loyalty_members (id, tier, total_bookings)
  values (new.id, 'free', 0)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
