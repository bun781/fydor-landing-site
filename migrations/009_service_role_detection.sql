-- 009: Fix service-role detection so server RPCs work again.
--
-- Migrations 001/003/007/008 guard privileged functions with
--   current_setting('request.jwt.claim.role') = 'service_role'
-- That GUC comes from PostgREST v8 and is no longer populated by the
-- PostgREST versions Supabase runs today (claims moved to the JSON GUC
-- request.jwt.claims), and requests authenticated with the new
-- sb_secret_* API keys don't carry it either. Result: every guarded RPC
-- (enable_contributor, submit_draft, transition_submission, ...) raised
-- "service role required", which surfaced in the contributor UI as
-- "credential required" when saving a draft or submitting a pack.

create or replace function public.is_service_role() returns boolean
language plpgsql stable set search_path = public as $$
declare claims jsonb;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    claims := null;
  end;
  return coalesce(claims->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role'
      or coalesce(current_setting('role', true), '') = 'service_role';
end $$;

revoke all on function public.is_service_role() from public;
grant execute on function public.is_service_role() to service_role, authenticated, anon;

-- Rewrite every deployed function that still uses the legacy check, in place.
do $migrate$
declare fn record; def text;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'is_service_role'
      and p.prosrc like $like$%request.jwt.claim.role%$like$
  loop
    def := pg_get_functiondef(fn.oid);
    def := replace(
      def,
      $old$coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role'$old$,
      $new$not public.is_service_role()$new$
    );
    execute def;
  end loop;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'is_service_role'
      and p.prosrc like $like$%request.jwt.claim.role%$like$
  ) then
    raise exception 'legacy service-role checks remain after rewrite';
  end if;
end $migrate$;
