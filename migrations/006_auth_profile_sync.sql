-- Mirror API-safe user fields into public.profiles. Supabase Auth remains the
-- credential and session authority; passwords and tokens are never copied.

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  insert into public.profiles(id, email, display_name, verified_at)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    profile_name,
    new.email_confirmed_at
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    verified_at = excluded.verified_at,
    updated_at = now();

  insert into public.user_roles(user_id, role_id)
  select new.id, id from public.roles where name = 'user'
  on conflict do nothing;

  return new;
end;
$$;

revoke execute on function public.sync_auth_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
  after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
  for each row execute function public.sync_auth_user_profile();

-- Backfill accounts created before this trigger existed.
insert into public.profiles(id, email, display_name, verified_at)
select
  users.id,
  lower(coalesce(users.email, '')),
  nullif(trim(coalesce(
    users.raw_user_meta_data ->> 'username',
    users.raw_user_meta_data ->> 'full_name',
    users.raw_user_meta_data ->> 'name',
    ''
  )), ''),
  users.email_confirmed_at
from auth.users as users
on conflict (id) do update set
  email = excluded.email,
  display_name = coalesce(excluded.display_name, public.profiles.display_name),
  verified_at = excluded.verified_at,
  updated_at = now();

insert into public.user_roles(user_id, role_id)
select profiles.id, roles.id
from public.profiles as profiles
cross join public.roles as roles
where roles.name = 'user'
on conflict do nothing;
