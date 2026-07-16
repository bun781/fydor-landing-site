-- Complete administrator and moderation workflow.
-- The protected administrator is anchored to an auth user id, never inferred by
-- browser code. Apply after 006_auth_profile_sync.sql.

create table if not exists public.protected_administrators (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  bootstrap_email text not null unique,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists publishing_suspended_at timestamptz;

alter table public.contributor_drafts
  add column if not exists contributor_note text;

alter table public.submission_versions
  add column if not exists contributor_note text;

alter table public.submissions
  add column if not exists archived_from_state text;

alter table public.reviewer_feedback
  add column if not exists lesson_index integer,
  add column if not exists target_type text not null default 'sentence',
  add column if not exists target_path text,
  add column if not exists visibility text not null default 'contributor';

alter table public.reviewer_feedback drop constraint if exists reviewer_feedback_target_type_check;
alter table public.reviewer_feedback add constraint reviewer_feedback_target_type_check
  check (target_type in ('pack','metadata','lesson','sentence','annotation'));
alter table public.reviewer_feedback drop constraint if exists reviewer_feedback_visibility_check;
alter table public.reviewer_feedback add constraint reviewer_feedback_visibility_check
  check (visibility in ('contributor','internal'));
alter table public.reviewer_feedback drop constraint if exists reviewer_feedback_lesson_index_check;
alter table public.reviewer_feedback add constraint reviewer_feedback_lesson_index_check
  check (lesson_index is null or lesson_index >= 0);
create index if not exists reviewer_feedback_target_idx
  on public.reviewer_feedback(submission_id, submission_version, target_type, lesson_index, sentence_index);
create index if not exists profiles_publishing_suspended_idx
  on public.profiles(publishing_suspended_at) where publishing_suspended_at is not null;
create index if not exists submissions_admin_queue_idx
  on public.submissions(state, base_language, target_language, created_at desc);

create or replace function public.copy_submission_contributor_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contributor_note is null then
    select drafts.contributor_note into new.contributor_note
    from contributor_drafts drafts join submissions submitted on submitted.source_draft_id=drafts.id
    where submitted.id=new.submission_id;
  end if;
  return new;
end $$;
drop trigger if exists copy_submission_contributor_note on public.submission_versions;
create trigger copy_submission_contributor_note before insert on public.submission_versions
for each row execute function public.copy_submission_contributor_note();

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  profile_name text;
  protected_email constant text := 'minhnhannguyen28@gmail.com';
begin
  profile_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  insert into public.profiles(id, email, display_name, verified_at)
  values (new.id, lower(coalesce(new.email, '')), profile_name, new.email_confirmed_at)
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    verified_at = excluded.verified_at,
    updated_at = now();

  insert into public.user_roles(user_id, role_id)
  select new.id, id from public.roles where name = 'user'
  on conflict do nothing;

  if lower(coalesce(new.email, '')) = protected_email and new.email_confirmed_at is not null then
    insert into public.user_roles(user_id, role_id, granted_by)
    select new.id, id, new.id from public.roles where name = 'super_admin'
    on conflict (user_id, role_id) do update set
      suspended_at = null,
      expires_at = null,
      version = public.user_roles.version + 1;
    insert into public.protected_administrators(user_id, bootstrap_email, reason)
    values (new.id, protected_email, 'initial administrator bootstrap')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- Backfill safely when the initial account already exists and is verified.
insert into public.protected_administrators(user_id, bootstrap_email, reason)
select users.id, 'minhnhannguyen28@gmail.com', 'initial administrator bootstrap'
from auth.users as users
where lower(users.email) = 'minhnhannguyen28@gmail.com'
  and users.email_confirmed_at is not null
on conflict do nothing;

insert into public.user_roles(user_id, role_id, granted_by)
select protected.user_id, roles.id, protected.user_id
from public.protected_administrators as protected
join public.roles as roles on roles.name = 'super_admin'
on conflict (user_id, role_id) do update set
  suspended_at = null,
  expires_at = null,
  version = public.user_roles.version + 1;

create or replace function public.bootstrap_super_admin(p_email text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid; v_new integer := 0; normalized_email text := lower(trim(p_email));
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if normalized_email <> 'minhnhannguyen28@gmail.com' then raise exception 'bootstrap email is not authorized'; end if;
  select id into v_user from auth.users where lower(email)=normalized_email and email_confirmed_at is not null;
  if v_user is null then raise exception 'verified user not found'; end if;
  perform ensure_profile(v_user, normalized_email, now());
  insert into user_roles(user_id,role_id,granted_by) select v_user,id,v_user from roles where name='super_admin'
  on conflict(user_id,role_id) do update set suspended_at=null,expires_at=null,version=user_roles.version+1;
  get diagnostics v_new = row_count;
  insert into protected_administrators(user_id,bootstrap_email,reason)
  values(v_user,normalized_email,'initial administrator bootstrap') on conflict do nothing;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason)
  values(v_user,v_user,'bootstrap_granted','super_admin','initial controlled bootstrap');
  return jsonb_build_object('userId',v_user,'assigned',v_new > 0);
end $$;

create or replace function public.revoke_super_admin(p_email text,p_reason text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid; v_role smallint; v_remaining integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  select id into v_user from auth.users where lower(email)=lower(p_email);
  if v_user is null then raise exception 'user not found'; end if;
  if exists(select 1 from protected_administrators where user_id=v_user) then
    raise exception 'protected initial administrator requires break-glass database recovery';
  end if;
  select id into v_role from roles where name='super_admin';
  select count(distinct ur.user_id) into v_remaining
  from user_roles ur join roles r on r.id=ur.role_id
  where r.name in ('admin','super_admin') and not (ur.user_id=v_user and r.name='super_admin')
    and ur.suspended_at is null and (ur.expires_at is null or ur.expires_at>now());
  if v_remaining=0 then raise exception 'cannot remove the last active administrator'; end if;
  update user_roles set suspended_at=now(),version=version+1
  where user_id=v_user and role_id=v_role and suspended_at is null;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason)
  values(v_user,v_user,'super_admin_revoked','super_admin',p_reason);
  return jsonb_build_object('userId',v_user,'revoked',true);
end $$;

create or replace function public.set_administrator(p_actor uuid,p_target uuid,p_enabled boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role_id smallint; target_profile profiles; v_remaining integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if not has_role(p_actor,'super_admin') then raise exception 'super administrator role required'; end if;
  if p_actor=p_target then raise exception 'self role changes are forbidden'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  if not p_enabled and exists(select 1 from protected_administrators where user_id=p_target) then
    raise exception 'protected initial administrator cannot be demoted';
  end if;
  select * into target_profile from profiles where id=p_target and active and verified_at is not null for update;
  if target_profile.id is null then raise exception 'verified active user required'; end if;
  select id into v_role_id from roles where name='admin';
  if p_enabled then
    insert into user_roles(user_id,role_id,granted_by) values(p_target,v_role_id,p_actor)
    on conflict(user_id,role_id) do update set suspended_at=null,expires_at=null,version=user_roles.version+1;
  else
    select count(distinct ur.user_id) into v_remaining
    from user_roles ur join roles r on r.id=ur.role_id
    where r.name in ('admin','super_admin') and not (ur.user_id=p_target and r.name='admin')
      and ur.suspended_at is null and (ur.expires_at is null or ur.expires_at>now());
    if v_remaining=0 then raise exception 'cannot remove the last active administrator'; end if;
    update user_roles set suspended_at=now(),version=version+1 where user_id=p_target and role_id=v_role_id;
  end if;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason)
  values(p_actor,p_target,case when p_enabled then 'admin_granted' else 'admin_removed' end,'admin',p_reason);
  return jsonb_build_object('userId',p_target,'enabled',p_enabled);
end $$;

create or replace function public.set_contributor(p_actor uuid,p_target uuid,p_enabled boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role_id smallint; target_profile profiles;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if not (has_role(p_actor,'admin') or has_role(p_actor,'super_admin')) then raise exception 'admin role required'; end if;
  if p_actor=p_target then raise exception 'self role changes are forbidden'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  select * into target_profile from profiles where id=p_target and active and verified_at is not null for update;
  if target_profile.id is null then raise exception 'verified active user required'; end if;
  select id into v_role_id from roles where name='contributor';
  if p_enabled then
    insert into user_roles(user_id,role_id,granted_by) values(p_target,v_role_id,p_actor)
    on conflict(user_id,role_id) do update set suspended_at=null,expires_at=null,version=user_roles.version+1;
  else
    update user_roles set suspended_at=now(),version=version+1 where user_id=p_target and role_id=v_role_id;
  end if;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason)
  values(p_actor,p_target,case when p_enabled then 'contributor_granted' else 'contributor_removed' end,'contributor',p_reason);
  return jsonb_build_object('userId',p_target,'enabled',p_enabled);
end $$;

create or replace function public.set_publishing_suspension(p_actor uuid,p_target uuid,p_suspended boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if not (has_role(p_actor,'admin') or has_role(p_actor,'super_admin')) then raise exception 'admin role required'; end if;
  if p_actor=p_target then raise exception 'self role changes are forbidden'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  if exists(select 1 from protected_administrators where user_id=p_target) then raise exception 'protected initial administrator cannot be suspended'; end if;
  update profiles set publishing_suspended_at=case when p_suspended then now() else null end,updated_at=now()
  where id=p_target and active;
  if not found then raise exception 'active user required'; end if;
  insert into permission_events(actor_id,target_user_id,action,reason)
  values(p_actor,p_target,case when p_suspended then 'publishing_suspended' else 'publishing_restored' end,p_reason);
  return jsonb_build_object('userId',p_target,'suspended',p_suspended);
end $$;

create or replace function public.enforce_publishing_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if new.state='submitted' then
    owner:=new.creator_id;
    if exists(select 1 from profiles where id=owner and publishing_suspended_at is not null) then
      raise exception 'publishing access is suspended';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists enforce_submission_publishing_access on public.submissions;
create trigger enforce_submission_publishing_access before insert or update of state on public.submissions
for each row execute function public.enforce_publishing_access();

create or replace function public.transition_submission(p_actor uuid,p_submission uuid,p_expected_version integer,p_expected_row_version integer,p_next text,p_reason text,p_action_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions; roles_now text[]; permitted boolean:=false; pub_id uuid; snapshot jsonb; checksum text; previous_state text; next_state text:=p_next; restore_state text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  roles_now:=active_roles(p_actor);
  select * into s from submissions where id=p_submission for update;
  if s.id is null then raise exception 'submission not found'; end if;
  previous_state:=s.state;
  if exists(select 1 from audit_events where action_id=p_action_id) then return jsonb_build_object('submissionId',s.id,'version',s.current_version,'state',s.state,'rowVersion',s.row_version); end if;
  if s.current_version<>p_expected_version or s.row_version<>p_expected_row_version then raise exception 'stale submission version'; end if;
  if p_next='restore' then
    if s.state<>'archived' then raise exception 'invalid submission transition'; end if;
    next_state:=coalesce(s.archived_from_state,'approved');
  end if;
  if s.state='submitted' and next_state in ('changes_requested','language_approved','rejected') then
    permitted := ('admin'=any(roles_now) or 'super_admin'=any(roles_now)) or
      ('moderator'=any(roles_now) and exists(select 1 from moderation_assignments where submission_id=s.id and moderator_id=p_actor and state='active') and exists(select 1 from moderator_language_assignments where moderator_id=p_actor and language_code=s.target_language and suspended_at is null and (expires_at is null or expires_at>now())));
  elsif s.state='submitted' and next_state='approved' then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='submitted' and next_state='archived' then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='submitted' and next_state='withdrawn' then permitted:=s.creator_id=p_actor;
  elsif s.state='language_approved' and next_state in ('approved','changes_requested','rejected') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='approved' and next_state in ('published','changes_requested','archived') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='published' and next_state in ('approved','archived') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state in ('rejected','changes_requested') and next_state='archived' then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='archived' and p_next='restore' then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  else raise exception 'invalid submission transition'; end if;
  if not permitted then raise exception 'permission denied'; end if;
  if next_state in ('changes_requested','rejected','archived') and nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  if next_state='published' then
    select canonical_json,content_hash into snapshot,checksum from submission_versions where submission_id=s.id and version=s.current_version;
    if snapshot is null then raise exception 'immutable submission version not found'; end if;
    insert into published_lessons(stable_lesson_id,submission_id,published_version,title,description,target_language,base_language,level,tags,sentence_count,contributor_id,schema_version,lesson_version,checksum,content_hash)
    values(coalesce(snapshot->>'id','lesson-'||s.id),s.id,s.current_version,snapshot->>'title',coalesce(snapshot->>'description',''),snapshot->>'language',snapshot->>'baseLanguage',coalesce(snapshot->>'level',''),coalesce(array(select jsonb_array_elements_text(snapshot->'tags')),'{}'),(select coalesce(sum(jsonb_array_length(lesson->'sentences')),0) from jsonb_array_elements(snapshot->'lessons') lesson),s.creator_id,(snapshot->>'schemaVersion')::integer,coalesce(snapshot->>'version',s.current_version::text),checksum,checksum)
    on conflict(submission_id) do update set published_version=excluded.published_version,title=excluded.title,description=excluded.description,target_language=excluded.target_language,base_language=excluded.base_language,level=excluded.level,tags=excluded.tags,sentence_count=excluded.sentence_count,schema_version=excluded.schema_version,lesson_version=excluded.lesson_version,checksum=excluded.checksum,content_hash=excluded.content_hash,updated_at=now(),archived_at=null returning id into pub_id;
  elsif previous_state='published' and next_state in ('approved','archived') then
    update published_lessons set archived_at=now(),updated_at=now() where submission_id=s.id;
  end if;
  update submissions set state=next_state,row_version=row_version+1,updated_at=now(),
    archived_from_state=case when next_state='archived' then previous_state when previous_state='archived' then null else archived_from_state end
  where id=s.id returning * into s;
  if next_state='changes_requested' then
    update contributor_drafts set state='changes_requested',revision=revision+1,updated_at=now() where id=s.source_draft_id;
    delete from sentence_review_progress where draft_id=s.source_draft_id;
  elsif next_state='withdrawn' then update contributor_drafts set state='withdrawn',updated_at=now() where id=s.source_draft_id; end if;
  if next_state in ('changes_requested','language_approved','rejected','approved') then update moderation_assignments set state='completed',released_at=now() where submission_id=s.id and state='active'; end if;
  if next_state in ('changes_requested','rejected') then
    insert into reviewer_feedback(submission_id,submission_version,author_id,target_type,category,body,visibility)
    values(s.id,s.current_version,p_actor,'pack','other',trim(p_reason),'contributor');
  end if;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,previous_state,next_state,reason,submission_version,action_id,metadata)
  values(p_actor,roles_now,case when p_next='restore' then 'submission_restored' else 'submission_transition' end,'submission',s.id::text,previous_state,next_state,p_reason,s.current_version,p_action_id,jsonb_build_object('requestedAction',p_next));
  insert into notifications(user_id,kind,title,body,link_path,group_key)
  values(s.creator_id,next_state,replace(initcap(next_state),'_',' '),s.title||' is now '||replace(next_state,'_',' ')||'.','/contribute?submission='||s.id,s.id::text);
  return jsonb_build_object('submissionId',s.id,'version',s.current_version,'state',s.state,'rowVersion',s.row_version,'publishedLessonId',pub_id);
end $$;

create or replace function public.prevent_audit_event_mutation() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'audit events are immutable';
end $$;
drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function public.prevent_audit_event_mutation();

alter table public.protected_administrators enable row level security;
revoke all on table public.protected_administrators from anon, authenticated;
revoke execute on function public.set_contributor(uuid,uuid,boolean,text) from public, anon, authenticated;
revoke execute on function public.set_publishing_suspension(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.set_contributor(uuid,uuid,boolean,text) to service_role;
grant execute on function public.set_publishing_suspension(uuid,uuid,boolean,text) to service_role;
