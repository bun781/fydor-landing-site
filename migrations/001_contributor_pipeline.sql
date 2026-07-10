-- Fydor contributor/moderation schema for Supabase Postgres.
-- Apply with the Supabase migration runner. All privileged mutations below are
-- SECURITY DEFINER functions with database role checks; browser roles are never trusted.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id smallserial primary key,
  name text not null unique check (name in ('user','contributor','moderator','admin','super_admin'))
);
insert into public.roles(name) values ('user'),('contributor'),('moderator'),('admin'),('super_admin') on conflict do nothing;

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id smallint not null references public.roles(id) on delete restrict,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  suspended_at timestamptz,
  version integer not null default 1,
  primary key (user_id, role_id)
);
create index if not exists user_roles_active_idx on public.user_roles(user_id, expires_at, suspended_at);

create table if not exists public.supported_languages (
  code text primary key,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.supported_languages(code,label) values
('ar','Arabic'),('bn','Bengali'),('cs','Czech'),('da','Danish'),('de','German'),('el','Greek'),('en','English'),('es','Spanish'),
('fa','Persian'),('fi','Finnish'),('fil','Filipino'),('fr','French'),('he','Hebrew'),('hi','Hindi'),('hu','Hungarian'),('id','Indonesian'),
('it','Italian'),('ja','Japanese'),('ko','Korean'),('ms','Malay'),('nl','Dutch'),('no','Norwegian'),('pl','Polish'),('pt','Portuguese'),
('ro','Romanian'),('ru','Russian'),('sv','Swedish'),('sw','Swahili'),('ta','Tamil'),('th','Thai'),('tr','Turkish'),('uk','Ukrainian'),
('ur','Urdu'),('vi','Vietnamese'),('yue','Cantonese'),('zh','Chinese') on conflict do nothing;

create table if not exists public.moderator_language_assignments (
  moderator_id uuid not null references public.profiles(id) on delete cascade,
  language_code text not null references public.supported_languages(code) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  suspended_at timestamptz,
  version integer not null default 1,
  primary key (moderator_id, language_code)
);

create table if not exists public.contributor_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  purpose text not null default 'contributor' check (purpose = 'contributor'),
  state text not null default 'draft' check (state in ('draft','reviewing','changes_requested','withdrawn')),
  title text not null,
  target_language text not null references public.supported_languages(code),
  base_language text not null references public.supported_languages(code),
  level text not null,
  canonical_json jsonb not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  schema_version integer not null,
  generation_source text not null default 'manual' check (generation_source in ('manual','chatgpt','claude','external')),
  prompt_template_version text,
  conversion_source_lesson_id text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contributor_drafts_owner_idx on public.contributor_drafts(owner_id, updated_at desc);

create table if not exists public.sentence_review_progress (
  draft_id uuid not null references public.contributor_drafts(id) on delete cascade,
  sentence_index integer not null check (sentence_index >= 0),
  status text not null check (status in ('unreviewed','reviewed','needs_work')),
  reviewer_note text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (draft_id, sentence_index)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  source_draft_id uuid not null references public.contributor_drafts(id) on delete restrict,
  target_language text not null references public.supported_languages(code),
  base_language text not null references public.supported_languages(code),
  title text not null,
  state text not null check (state in ('submitted','changes_requested','language_approved','approved','published','rejected','withdrawn','archived')),
  current_version integer not null,
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submissions_queue_idx on public.submissions(target_language, state, created_at);
create index if not exists submissions_creator_idx on public.submissions(creator_id, created_at desc);

create table if not exists public.submission_versions (
  submission_id uuid not null references public.submissions(id) on delete restrict,
  version integer not null check (version > 0),
  source_draft_revision integer not null,
  canonical_json jsonb not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  schema_version integer not null,
  generation_source text not null,
  prompt_template_version text,
  creator_confirmed boolean not null,
  submitted_at timestamptz not null default now(),
  primary key (submission_id, version),
  unique (submission_id, content_hash)
);

create table if not exists public.moderation_assignments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  submission_version integer not null,
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  state text not null default 'active' check (state in ('active','released','completed')),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key (submission_id, submission_version) references public.submission_versions(submission_id, version) on delete restrict
);
create unique index if not exists moderation_one_active_idx on public.moderation_assignments(submission_id) where state = 'active';
create index if not exists moderation_workload_idx on public.moderation_assignments(moderator_id, state, assigned_at);

create table if not exists public.reviewer_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  submission_version integer not null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  sentence_index integer,
  category text not null check (category in ('translation','grammar','vocabulary','annotation','formatting','factual_accuracy','naturalness','level_appropriateness','duplicate_content','policy_or_safety','other')),
  body text not null check (char_length(body) between 1 and 8000),
  suggested_patch jsonb,
  resolution_state text not null default 'open' check (resolution_state in ('open','resolved','reopened')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (submission_id, submission_version) references public.submission_versions(submission_id, version) on delete restrict
);
create index if not exists reviewer_feedback_version_idx on public.reviewer_feedback(submission_id, submission_version, sentence_index);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_roles text[] not null default '{}',
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  previous_state text,
  next_state text,
  reason text,
  note text,
  submission_version integer,
  action_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists audit_action_id_unique on public.audit_events(action_id) where action_id is not null;
create index if not exists audit_entity_idx on public.audit_events(entity_type, entity_id, created_at);

create table if not exists public.permission_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  role_name text,
  language_code text,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.published_lessons (
  id uuid primary key default gen_random_uuid(),
  stable_lesson_id text not null unique,
  submission_id uuid not null unique references public.submissions(id) on delete restrict,
  published_version integer not null,
  title text not null,
  description text not null,
  target_language text not null,
  base_language text not null,
  level text not null,
  tags text[] not null default '{}',
  sentence_count integer not null,
  contributor_id uuid not null references public.profiles(id) on delete restrict,
  schema_version integer not null,
  lesson_version text not null,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  license text not null default 'CC BY 4.0',
  compatibility text not null default 'Fydor 2.0+',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (submission_id, published_version) references public.submission_versions(submission_id, version) on delete restrict
);
create index if not exists published_library_idx on public.published_lessons(target_language, base_language, level, published_at desc) where archived_at is null;
create index if not exists published_tags_idx on public.published_lessons using gin(tags);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link_path text not null check (link_path like '/%'),
  group_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, read_at, created_at desc);

create table if not exists public.idempotency_records (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null,
  key text not null,
  request_hash text not null,
  response_json jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, operation, key)
);

create or replace function public.active_roles(p_user uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r.name order by r.name), '{}')
  from user_roles ur join roles r on r.id = ur.role_id
  where ur.user_id = p_user and ur.suspended_at is null and (ur.expires_at is null or ur.expires_at > now())
$$;

create or replace function public.has_role(p_user uuid, p_role text) returns boolean language sql stable security definer set search_path = public as $$
  select p_role = any(public.active_roles(p_user))
$$;

create or replace function public.enable_contributor(p_user uuid) returns text[] language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  insert into user_roles(user_id,role_id,granted_by) select p_user,id,p_user from roles where name='contributor' on conflict do nothing;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason) values(p_user,p_user,'contributor_enabled','contributor','user opted into public contribution');
  return active_roles(p_user);
end $$;

create or replace function public.ensure_profile(p_user uuid, p_email text, p_verified timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id,email,verified_at) values (p_user, lower(p_email), p_verified)
  on conflict (id) do update set email=excluded.email, verified_at=coalesce(profiles.verified_at,excluded.verified_at), updated_at=now();
  insert into user_roles(user_id,role_id) select p_user,id from roles where name='user' on conflict do nothing;
end $$;

create or replace function public.bootstrap_super_admin(p_email text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid; v_new integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  select id into v_user from auth.users where lower(email)=lower(p_email) and email_confirmed_at is not null;
  if v_user is null then raise exception 'verified user not found'; end if;
  perform ensure_profile(v_user, p_email, now());
  insert into user_roles(user_id,role_id,granted_by) select v_user,id,v_user from roles where name='super_admin' on conflict do nothing;
  get diagnostics v_new = row_count;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason) values(v_user,v_user,case when v_new > 0 then 'bootstrap_granted' else 'bootstrap_already_present' end,'super_admin','initial controlled bootstrap');
  return jsonb_build_object('userId',v_user,'assigned',v_new > 0);
end $$;

create or replace function public.super_admin_status(p_email text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid; v_verified boolean; v_assigned boolean;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  select id,email_confirmed_at is not null into v_user,v_verified from auth.users where lower(email)=lower(p_email);
  v_assigned:=v_user is not null and has_role(v_user,'super_admin');
  return jsonb_build_object('found',v_user is not null,'verified',coalesce(v_verified,false),'assigned',v_assigned);
end $$;

create or replace function public.revoke_super_admin(p_email text,p_reason text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid; v_role smallint; v_remaining integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  select id into v_user from auth.users where lower(email)=lower(p_email);
  if v_user is null then raise exception 'user not found'; end if;
  select id into v_role from roles where name='super_admin';
  select count(*) into v_remaining from user_roles where role_id=v_role and user_id<>v_user and suspended_at is null and (expires_at is null or expires_at>now());
  if v_remaining=0 then raise exception 'cannot remove the last active super administrator'; end if;
  update user_roles set suspended_at=now(),version=version+1 where user_id=v_user and role_id=v_role and suspended_at is null;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason) values(v_user,v_user,'super_admin_revoked','super_admin',p_reason);
  return jsonb_build_object('userId',v_user,'revoked',true);
end $$;

create or replace function public.submit_draft(p_actor uuid,p_draft uuid,p_expected_revision integer,p_confirmed boolean,p_idempotency text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d contributor_drafts; s submissions; v integer; sentence_total integer; reviewed_total integer; existing jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if not has_role(p_actor,'contributor') then raise exception 'contributor role required'; end if;
  select response_json into existing from idempotency_records where actor_id=p_actor and operation='submit' and key=p_idempotency;
  if existing is not null then return existing; end if;
  select * into d from contributor_drafts where id=p_draft for update;
  if d.owner_id<>p_actor then raise exception 'draft not found'; end if;
  if d.revision<>p_expected_revision then raise exception 'stale draft revision'; end if;
  if d.state not in ('reviewing','changes_requested','withdrawn') then raise exception 'draft is not ready'; end if;
  if not p_confirmed then raise exception 'creator confirmation required'; end if;
  sentence_total := jsonb_array_length(d.canonical_json->'sentences');
  select count(*) into reviewed_total from sentence_review_progress where draft_id=d.id and status='reviewed';
  if reviewed_total<>sentence_total then raise exception 'every sentence must be reviewed'; end if;
  select * into s from submissions where source_draft_id=d.id order by created_at desc limit 1 for update;
  if s.id is null then
    insert into submissions(creator_id,source_draft_id,target_language,base_language,title,state,current_version)
    values(p_actor,d.id,d.target_language,d.base_language,d.title,'submitted',1) returning * into s; v:=1;
  else
    if s.state not in ('changes_requested','withdrawn') then raise exception 'submission already open'; end if;
    v:=s.current_version+1;
    update submissions set state='submitted',current_version=v,row_version=row_version+1,updated_at=now() where id=s.id returning * into s;
  end if;
  insert into submission_versions(submission_id,version,source_draft_revision,canonical_json,content_hash,schema_version,generation_source,prompt_template_version,creator_confirmed)
  values(s.id,v,d.revision,d.canonical_json,d.content_hash,d.schema_version,d.generation_source,d.prompt_template_version,true);
  update contributor_drafts set state='reviewing',updated_at=now() where id=d.id;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,previous_state,next_state,submission_version,action_id)
  values(p_actor,active_roles(p_actor),'submission_created','submission',s.id::text,d.state,'submitted',v,p_idempotency);
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(p_actor,'submission_received','Submission received',d.title||' was submitted for language review.','/contribute.html?submission='||s.id,s.id::text);
  existing:=jsonb_build_object('submissionId',s.id,'version',v,'state','submitted','contentHash',d.content_hash);
  insert into idempotency_records(actor_id,operation,key,request_hash,response_json) values(p_actor,'submit',p_idempotency,d.content_hash,existing);
  return existing;
end $$;

create or replace function public.claim_submission(p_actor uuid,p_submission uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions; assignment_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if not has_role(p_actor,'moderator') then raise exception 'moderator role required'; end if;
  select * into s from submissions where id=p_submission for update;
  if s.state<>'submitted' or s.current_version<>p_expected_version then raise exception 'submission is stale or not claimable'; end if;
  if not exists(select 1 from moderator_language_assignments where moderator_id=p_actor and language_code=s.target_language and suspended_at is null and (expires_at is null or expires_at>now())) then raise exception 'language is not assigned'; end if;
  insert into moderation_assignments(submission_id,submission_version,moderator_id,assigned_by) values(s.id,s.current_version,p_actor,p_actor) returning id into assignment_id;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,submission_version) values(p_actor,active_roles(p_actor),'moderator_claimed','submission',s.id::text,s.current_version);
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(s.creator_id,'reviewer_assigned','Reviewer assigned',s.title||' has been assigned to a language moderator.','/contribute.html?submission='||s.id,s.id::text);
  return jsonb_build_object('assignmentId',assignment_id,'submissionId',s.id,'version',s.current_version);
exception when unique_violation then raise exception 'submission was already claimed';
end $$;

create or replace function public.transition_submission(p_actor uuid,p_submission uuid,p_expected_version integer,p_expected_row_version integer,p_next text,p_reason text,p_action_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions; roles_now text[]; permitted boolean:=false; pub_id uuid; snapshot jsonb; checksum text; previous_state text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  roles_now:=active_roles(p_actor); select * into s from submissions where id=p_submission for update; previous_state:=s.state;
  if s.id is null then raise exception 'submission not found'; end if;
  if s.current_version<>p_expected_version or s.row_version<>p_expected_row_version then raise exception 'stale submission version'; end if;
  if exists(select 1 from audit_events where action_id=p_action_id) then return jsonb_build_object('submissionId',s.id,'version',s.current_version,'state',s.state,'rowVersion',s.row_version); end if;
  if (s.state='submitted' and p_next in ('changes_requested','language_approved','rejected')) then
    permitted := 'moderator'=any(roles_now) and exists(select 1 from moderation_assignments where submission_id=s.id and moderator_id=p_actor and state='active') and exists(select 1 from moderator_language_assignments where moderator_id=p_actor and language_code=s.target_language and suspended_at is null and (expires_at is null or expires_at>now()));
  elsif s.state='submitted' and p_next='withdrawn' then permitted:=s.creator_id=p_actor;
  elsif s.state='language_approved' and p_next in ('approved','changes_requested','rejected') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='approved' and p_next in ('published','changes_requested') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='published' and p_next='archived' then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  else raise exception 'invalid submission transition'; end if;
  if not permitted then raise exception 'permission denied'; end if;
  if p_next in ('changes_requested','rejected','archived') and nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  if p_next='published' then
    select canonical_json,content_hash into snapshot,checksum from submission_versions where submission_id=s.id and version=s.current_version;
    insert into published_lessons(stable_lesson_id,submission_id,published_version,title,description,target_language,base_language,level,tags,sentence_count,contributor_id,schema_version,lesson_version,checksum)
    values('lesson-'||s.id,s.id,s.current_version,snapshot->>'title',snapshot->>'description',s.target_language,s.base_language,snapshot->>'level',array(select jsonb_array_elements_text(snapshot->'tags')),jsonb_array_length(snapshot->'sentences'),s.creator_id,(snapshot->>'schemaVersion')::integer,s.current_version::text,checksum)
    on conflict(submission_id) do update set published_version=excluded.published_version,title=excluded.title,description=excluded.description,level=excluded.level,tags=excluded.tags,sentence_count=excluded.sentence_count,schema_version=excluded.schema_version,lesson_version=excluded.lesson_version,checksum=excluded.checksum,updated_at=now(),archived_at=null returning id into pub_id;
  elsif p_next='archived' then update published_lessons set archived_at=now(),updated_at=now() where submission_id=s.id;
  end if;
  update submissions set state=p_next,row_version=row_version+1,updated_at=now() where id=s.id returning * into s;
  if p_next='changes_requested' then
    update contributor_drafts set state='changes_requested',revision=revision+1,updated_at=now() where id=s.source_draft_id;
    delete from sentence_review_progress where draft_id=s.source_draft_id;
  elsif p_next='withdrawn' then
    update contributor_drafts set state='withdrawn',updated_at=now() where id=s.source_draft_id;
  end if;
  if p_next in ('changes_requested','language_approved','rejected') then update moderation_assignments set state='completed',released_at=now() where submission_id=s.id and state='active'; end if;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,previous_state,next_state,reason,submission_version,action_id) values(p_actor,roles_now,'submission_transition','submission',s.id::text,previous_state,p_next,p_reason,s.current_version,p_action_id);
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(s.creator_id,p_next,replace(initcap(p_next),'_',' '),s.title||' is now '||replace(p_next,'_',' ')||'.','/contribute.html?submission='||s.id,s.id::text);
  return jsonb_build_object('submissionId',s.id,'version',s.current_version,'state',s.state,'rowVersion',s.row_version,'publishedLessonId',pub_id);
end $$;

create or replace function public.set_administrator(p_actor uuid,p_target uuid,p_enabled boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role_id smallint; target_profile profiles;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if not has_role(p_actor,'super_admin') then raise exception 'super administrator role required'; end if;
  if p_actor=p_target then raise exception 'self role changes are forbidden'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  select * into target_profile from profiles where id=p_target and active and verified_at is not null for update;
  if target_profile.id is null then raise exception 'verified active user required'; end if;
  select id into v_role_id from roles where name='admin';
  if p_enabled then
    insert into user_roles(user_id,role_id,granted_by) values(p_target,v_role_id,p_actor)
    on conflict(user_id,role_id) do update set suspended_at=null,expires_at=null,version=user_roles.version+1;
  else
    update user_roles set suspended_at=now(),version=version+1 where user_id=p_target and role_id=v_role_id;
  end if;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason) values(p_actor,p_target,case when p_enabled then 'admin_granted' else 'admin_removed' end,'admin',p_reason);
  return jsonb_build_object('userId',p_target,'enabled',p_enabled);
end $$;

create or replace function public.set_moderator(p_actor uuid,p_target uuid,p_languages text[],p_enabled boolean,p_reason text,p_expected_version integer default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare target_profile profiles; moderator_role smallint; language text; current_version integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if not (has_role(p_actor,'admin') or has_role(p_actor,'super_admin')) then raise exception 'admin role required'; end if;
  if p_actor=p_target then raise exception 'self role changes are forbidden'; end if;
  select * into target_profile from profiles where id=p_target and active and verified_at is not null for update;
  if target_profile.id is null then raise exception 'verified active user required'; end if;
  select id into moderator_role from roles where name='moderator';
  select version into current_version from user_roles where user_id=p_target and role_id=moderator_role for update;
  if p_expected_version > 0 and coalesce(current_version,0) <> p_expected_version then raise exception 'stale role version'; end if;
  if p_enabled then
    insert into user_roles(user_id,role_id,granted_by) values(p_target,moderator_role,p_actor) on conflict(user_id,role_id) do update set suspended_at=null,expires_at=null,version=user_roles.version+1;
    foreach language in array p_languages loop
      if not exists(select 1 from supported_languages where code=language and active) then raise exception 'unsupported language'; end if;
      insert into moderator_language_assignments(moderator_id,language_code,assigned_by) values(p_target,language,p_actor) on conflict(moderator_id,language_code) do update set suspended_at=null,expires_at=null,version=moderator_language_assignments.version+1;
    end loop;
  else
    update user_roles set suspended_at=now(),version=version+1 where user_id=p_target and role_id=moderator_role;
    update moderator_language_assignments set suspended_at=now(),version=version+1 where moderator_id=p_target and suspended_at is null;
    update moderation_assignments set state='released',released_at=now() where moderator_id=p_target and state='active';
  end if;
  insert into permission_events(actor_id,target_user_id,action,role_name,reason) values(p_actor,p_target,case when p_enabled then 'moderator_granted' else 'moderator_removed' end,'moderator',p_reason);
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(p_target,case when p_enabled then 'moderator_role_granted' else 'moderator_role_removed' end,case when p_enabled then 'Moderator access granted' else 'Moderator access removed' end,case when p_enabled then 'You can now review assigned Fydor languages.' else 'Your Fydor moderator access has been removed.' end,'/moderate.html','moderator-role');
  return jsonb_build_object('userId',p_target,'enabled',p_enabled,'languages',p_languages);
end $$;

alter table public.profiles enable row level security;
alter table public.contributor_drafts enable row level security;
alter table public.sentence_review_progress enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_versions enable row level security;
alter table public.reviewer_feedback enable row level security;
alter table public.notifications enable row level security;
alter table public.published_lessons enable row level security;

create policy profiles_self on public.profiles for select using (id=auth.uid());
create policy drafts_owner on public.contributor_drafts for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy sentence_review_owner on public.sentence_review_progress for all using (exists(select 1 from contributor_drafts d where d.id=sentence_review_progress.draft_id and d.owner_id=auth.uid())) with check (exists(select 1 from contributor_drafts d where d.id=sentence_review_progress.draft_id and d.owner_id=auth.uid()));
create policy submissions_creator_read on public.submissions for select using (creator_id=auth.uid());
create policy submission_versions_creator_read on public.submission_versions for select using (exists(select 1 from submissions s where s.id=submission_id and s.creator_id=auth.uid()));
create policy feedback_creator_read on public.reviewer_feedback for select using (exists(select 1 from submissions s where s.id=submission_id and s.creator_id=auth.uid()));
create policy notifications_self on public.notifications for select using (user_id=auth.uid());
create policy published_public_read on public.published_lessons for select using (archived_at is null);

revoke execute on function public.ensure_profile(uuid,text,timestamptz) from public, anon, authenticated;
revoke execute on function public.enable_contributor(uuid) from public, anon, authenticated;
revoke execute on function public.submit_draft(uuid,uuid,integer,boolean,text) from public, anon, authenticated;
revoke execute on function public.claim_submission(uuid,uuid,integer) from public, anon, authenticated;
revoke execute on function public.transition_submission(uuid,uuid,integer,integer,text,text,text) from public, anon, authenticated;
revoke execute on function public.set_moderator(uuid,uuid,text[],boolean,text,integer) from public, anon, authenticated;
revoke execute on function public.set_administrator(uuid,uuid,boolean,text) from public, anon, authenticated;
revoke execute on function public.bootstrap_super_admin(text) from public, anon, authenticated;
revoke execute on function public.super_admin_status(text) from public, anon, authenticated;
revoke execute on function public.revoke_super_admin(text,text) from public, anon, authenticated;
grant execute on function public.ensure_profile(uuid,text,timestamptz) to service_role;
grant execute on function public.enable_contributor(uuid) to service_role;
grant execute on function public.submit_draft(uuid,uuid,integer,boolean,text) to service_role;
grant execute on function public.claim_submission(uuid,uuid,integer) to service_role;
grant execute on function public.transition_submission(uuid,uuid,integer,integer,text,text,text) to service_role;
grant execute on function public.set_moderator(uuid,uuid,text[],boolean,text,integer) to service_role;
grant execute on function public.set_administrator(uuid,uuid,boolean,text) to service_role;
grant execute on function public.bootstrap_super_admin(text) to service_role;
grant execute on function public.super_admin_status(text) to service_role;
grant execute on function public.revoke_super_admin(text,text) to service_role;
