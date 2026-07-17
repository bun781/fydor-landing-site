-- Contributor access is intentionally scarce: applicants are reviewed before
-- they can place work in the moderation queue. New approvals receive a short,
-- database-enforced probation period.

alter table public.profiles add column if not exists contributor_probation_until timestamptz;

create table if not exists public.contributor_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null unique references public.profiles(id) on delete cascade,
  target_languages text[] not null check (cardinality(target_languages) between 1 and 12),
  experience text not null check (char_length(experience) between 40 and 3000),
  sample_plan text not null check (char_length(sample_plan) between 40 and 3000),
  state text not null default 'pending' check (state in ('pending','approved','rejected')),
  reviewer_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists contributor_applications_queue_idx on public.contributor_applications(state, submitted_at);
alter table public.contributor_applications enable row level security;
revoke all on public.contributor_applications from public, anon, authenticated;

create table if not exists public.contributor_submission_days (
  creator_id uuid not null references public.profiles(id) on delete cascade,
  submission_day date not null,
  submission_count integer not null default 0 check (submission_count >= 0),
  primary key (creator_id, submission_day)
);
revoke all on public.contributor_submission_days from public, anon, authenticated;

create or replace function public.apply_for_contributor(
  p_actor uuid, p_target_languages text[], p_experience text, p_sample_plan text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare application contributor_applications;
begin
  if not public.is_service_role() then raise exception 'service role required'; end if;
  if not exists(select 1 from profiles where id=p_actor and active and verified_at is not null) then raise exception 'a verified active account is required'; end if;
  if exists(select 1 from profiles where id=p_actor and publishing_suspended_at is not null) then raise exception 'publishing access is suspended'; end if;
  if cardinality(p_target_languages) not between 1 and 12 then raise exception 'choose between one and twelve target languages'; end if;
  if char_length(trim(coalesce(p_experience,''))) not between 40 and 3000 then raise exception 'tell us about your language or teaching experience (40–3000 characters)'; end if;
  if char_length(trim(coalesce(p_sample_plan,''))) not between 40 and 3000 then raise exception 'describe your first pack (40–3000 characters)'; end if;
  select * into application from contributor_applications where applicant_id=p_actor for update;
  if application.id is not null and application.state='approved' then raise exception 'your contributor access is already approved'; end if;
  if application.id is not null and application.state='pending' then raise exception 'your contributor application is already being reviewed'; end if;
  insert into contributor_applications(applicant_id,target_languages,experience,sample_plan,state,reviewer_note,reviewed_by,submitted_at,reviewed_at,updated_at)
  values(p_actor,p_target_languages,trim(p_experience),trim(p_sample_plan),'pending',null,null,now(),null,now())
  on conflict(applicant_id) do update set target_languages=excluded.target_languages,experience=excluded.experience,sample_plan=excluded.sample_plan,state='pending',reviewer_note=null,reviewed_by=null,submitted_at=now(),reviewed_at=null,updated_at=now()
  returning * into application;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,next_state,metadata)
  values(p_actor,active_roles(p_actor),'contributor_application_submitted','contributor_application',application.id::text,'pending',jsonb_build_object('targetLanguages',p_target_languages));
  return jsonb_build_object('id',application.id,'state',application.state,'submittedAt',application.submitted_at);
end $$;

create or replace function public.review_contributor_application(
  p_actor uuid, p_application uuid, p_approved boolean, p_note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare application contributor_applications; target profiles; next_state text;
begin
  if not public.is_service_role() then raise exception 'service role required'; end if;
  if not (has_role(p_actor,'admin') or has_role(p_actor,'super_admin')) then raise exception 'administrator role required'; end if;
  if char_length(trim(coalesce(p_note,''))) not between 3 and 3000 then raise exception 'a reviewer note of 3–3000 characters is required'; end if;
  select * into application from contributor_applications where id=p_application for update;
  if application.id is null then raise exception 'contributor application not found'; end if;
  if application.state <> 'pending' then raise exception 'this contributor application has already been decided'; end if;
  select * into target from profiles where id=application.applicant_id for update;
  if p_approved and (not target.active or target.verified_at is null) then raise exception 'verified active user required'; end if;
  next_state:=case when p_approved then 'approved' else 'rejected' end;
  update contributor_applications set state=next_state,reviewer_note=trim(p_note),reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=application.id;
  if p_approved then
    insert into user_roles(user_id,role_id,granted_by) select application.applicant_id,id,p_actor from roles where name='contributor'
    on conflict(user_id,role_id) do update set suspended_at=null,expires_at=null,granted_by=excluded.granted_by,version=user_roles.version+1;
    update profiles set contributor_probation_until=now()+interval '30 days',updated_at=now() where id=application.applicant_id;
    insert into permission_events(actor_id,target_user_id,action,role_name,reason) values(p_actor,application.applicant_id,'contributor_application_approved','contributor',trim(p_note));
    insert into notifications(user_id,kind,title,body,link_path,group_key) values(application.applicant_id,'contributor_application_approved','Contributor access approved','You can now submit packs. For your first 30 days, submit up to two packs per day, each up to 1 MB.','/contribute','contributor-application');
  else
    insert into permission_events(actor_id,target_user_id,action,role_name,reason) values(p_actor,application.applicant_id,'contributor_application_rejected','contributor',trim(p_note));
    insert into notifications(user_id,kind,title,body,link_path,group_key) values(application.applicant_id,'contributor_application_rejected','Contributor application needs revision','Read the reviewer note, then update and resubmit your application when you are ready.','/contribute','contributor-application');
  end if;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,previous_state,next_state,reason)
  values(p_actor,active_roles(p_actor),'contributor_application_reviewed','contributor_application',application.id::text,'pending',next_state,trim(p_note));
  return jsonb_build_object('id',application.id,'state',next_state,'applicantId',application.applicant_id);
end $$;

create or replace function public.submit_pack(
  p_actor uuid, p_pack jsonb, p_content_hash text, p_generation_source text, p_creation_method text,
  p_confirmed boolean, p_idempotency text, p_possible_duplicate boolean, p_duplicate_match_submission_id uuid,
  p_duplicate_similarity numeric, p_duplicate_reasons jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions; existing jsonb; pack_title text; target text; base text; probation_until timestamptz; probation_count integer;
begin
  if not public.is_service_role() then raise exception 'service role required'; end if;
  if not has_role(p_actor,'contributor') then raise exception 'contributor role required'; end if;
  if not p_confirmed then raise exception 'creator confirmation required'; end if;
  select contributor_probation_until into probation_until from profiles where id=p_actor;
  if exists(select 1 from profiles where id=p_actor and publishing_suspended_at is not null) then raise exception 'publishing access is suspended'; end if;
  select response_json into existing from idempotency_records where actor_id=p_actor and operation='submit_pack' and key=p_idempotency;
  if existing is not null then return existing; end if;
  if probation_until is not null and probation_until > now() then
    if octet_length(p_pack::text) > 1000000 then raise exception 'probation pack size limit is 1 MB'; end if;
    insert into contributor_submission_days(creator_id,submission_day,submission_count) values(p_actor,current_date,1)
    on conflict(creator_id,submission_day) do update set submission_count=contributor_submission_days.submission_count+1
    returning submission_count into probation_count;
    if probation_count > 2 then raise exception 'probation submission limit reached: try again tomorrow'; end if;
  end if;
  if exists(select 1 from contribution_content_hashes where content_hash=p_content_hash and state in ('pending','approved','published')) then raise exception using message='duplicate_pack: This pack is already in the contribution pipeline.', errcode='unique_violation'; end if;
  pack_title:=nullif(trim(p_pack->>'title'),''); target:=nullif(trim(p_pack->>'language'),''); base:=nullif(trim(p_pack->>'baseLanguage'),'');
  if pack_title is null or target is null or base is null then raise exception 'invalid pack'; end if;
  insert into submissions(creator_id,target_language,base_language,title,state,current_version) values(p_actor,target,base,pack_title,'submitted',1) returning * into s;
  insert into submission_versions(submission_id,version,source_draft_revision,canonical_json,content_hash,schema_version,generation_source,creation_method,possible_duplicate,duplicate_match_submission_id,duplicate_similarity,duplicate_reasons,creator_confirmed)
  values(s.id,1,1,p_pack,p_content_hash,coalesce((p_pack->>'schemaVersion')::integer,1),p_generation_source,p_creation_method,coalesce(p_possible_duplicate,false),p_duplicate_match_submission_id,p_duplicate_similarity,coalesce(p_duplicate_reasons,'[]'::jsonb),true);
  insert into contribution_content_hashes(content_hash,submission_id,submission_version,state) values(p_content_hash,s.id,1,'pending');
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,next_state,submission_version,action_id,metadata) values(p_actor,active_roles(p_actor),'submission_created','submission',s.id::text,'submitted',1,p_idempotency,jsonb_build_object('creationMethod',p_creation_method,'possibleDuplicate',p_possible_duplicate));
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(p_actor,'submission_received','Submission received',s.title||' was submitted for language review.','/contribute?submission='||s.id,s.id::text);
  existing:=jsonb_build_object('submissionId',s.id,'version',1,'state','submitted','contentHash',p_content_hash,'possibleDuplicate',p_possible_duplicate);
  insert into idempotency_records(actor_id,operation,key,request_hash,response_json) values(p_actor,'submit_pack',p_idempotency,p_content_hash,existing);
  return existing;
exception when unique_violation then raise exception using message='duplicate_pack: This pack is already in the contribution pipeline.', errcode='unique_violation'; end $$;

revoke execute on function public.apply_for_contributor(uuid,text[],text,text) from public, anon, authenticated;
revoke execute on function public.review_contributor_application(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.apply_for_contributor(uuid,text[],text,text) to service_role;
grant execute on function public.review_contributor_application(uuid,uuid,boolean,text) to service_role;
