-- Preserve the username supplied during signup in the server-side profile.
-- Keep the original three-argument function for existing bootstrap callers;
-- authenticated requests use this four-argument overload.

create or replace function public.ensure_profile(
  p_user uuid,
  p_email text,
  p_username text,
  p_verified timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id,email,display_name,verified_at)
    values (p_user, lower(p_email), nullif(trim(p_username), ''), p_verified)
  on conflict (id) do update set
    email=excluded.email,
    display_name=coalesce(nullif(trim(excluded.display_name), ''), profiles.display_name),
    verified_at=coalesce(profiles.verified_at,excluded.verified_at),
    updated_at=now();
  insert into user_roles(user_id,role_id)
    select p_user,id from roles where name='user' on conflict do nothing;
end $$;

revoke execute on function public.ensure_profile(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ensure_profile(uuid,text,text,timestamptz) to service_role;
