-- Supabase-native counters replace the external cache dependency.
-- These functions are server-only: browser clients never receive the service key.

create table if not exists public.rate_limit_windows (
  bucket_key text primary key check (char_length(bucket_key) between 1 and 240),
  request_count integer not null check (request_count >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists rate_limit_windows_expiry_idx on public.rate_limit_windows(expires_at);

create or replace function public.enforce_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_count integer; v_now timestamptz := now();
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'service role required'; end if;
  if char_length(coalesce(p_key, '')) not between 1 and 240 then raise exception 'invalid rate limit key'; end if;
  if p_limit not between 1 and 100000 or p_window_seconds not between 1 and 86400 then raise exception 'invalid rate limit window'; end if;
  delete from rate_limit_windows where ctid in (select ctid from rate_limit_windows where expires_at <= v_now limit 100);
  insert into rate_limit_windows(bucket_key, request_count, expires_at, updated_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_seconds), v_now)
  on conflict (bucket_key) do update set
    request_count = case when rate_limit_windows.expires_at <= v_now then 1 else rate_limit_windows.request_count + 1 end,
    expires_at = case when rate_limit_windows.expires_at <= v_now then v_now + make_interval(secs => p_window_seconds) else rate_limit_windows.expires_at end,
    updated_at = v_now
  returning request_count into v_count;
  return jsonb_build_object('allowed', v_count <= p_limit, 'count', v_count);
end $$;

create table if not exists public.website_metrics (
  metric_key text primary key check (char_length(metric_key) between 1 and 120),
  metric_value bigint not null check (metric_value >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.download_count(p_increment boolean, p_base_count integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_count bigint;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'service role required'; end if;
  if p_base_count < 0 then raise exception 'invalid base count'; end if;
  insert into website_metrics(metric_key, metric_value) values ('download_count', p_base_count) on conflict do nothing;
  if p_increment then
    update website_metrics set metric_value = metric_value + 1, updated_at = now() where metric_key = 'download_count' returning metric_value into v_count;
  else
    select metric_value into v_count from website_metrics where metric_key = 'download_count';
  end if;
  return coalesce(v_count, p_base_count);
end $$;

revoke all on table public.rate_limit_windows, public.website_metrics from public, anon, authenticated;
revoke execute on function public.enforce_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke execute on function public.download_count(boolean,integer) from public, anon, authenticated;
grant execute on function public.enforce_rate_limit(text,integer,integer) to service_role;
grant execute on function public.download_count(boolean,integer) to service_role;
