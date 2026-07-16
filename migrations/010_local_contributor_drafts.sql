-- Contributor working copies and their per-sentence approvals are browser-only.
-- The server retains only immutable submitted pack versions and moderation records.
alter table public.submissions drop constraint if exists submissions_source_draft_id_fkey;
drop function if exists public.transition_submission(uuid,uuid,integer,integer,text,text,text);
drop function if exists public.submit_draft(uuid,uuid,integer,boolean,text);
alter table public.submissions drop column if exists source_draft_id;
drop trigger if exists copy_submission_contributor_note on public.submission_versions;
drop function if exists public.copy_submission_contributor_note();
drop table if exists public.sentence_review_progress;
drop table if exists public.contributor_drafts;

create or replace function public.submit_pack(
  p_actor uuid, p_pack jsonb, p_content_hash text, p_generation_source text, p_creation_method text,
  p_confirmed boolean, p_idempotency text, p_possible_duplicate boolean, p_duplicate_match_submission_id uuid,
  p_duplicate_similarity numeric, p_duplicate_reasons jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions; existing jsonb; pack_title text; target text; base text;
begin
  if not public.is_service_role() then raise exception 'service role required'; end if;
  if not has_role(p_actor,'contributor') then raise exception 'contributor role required'; end if;
  if not p_confirmed then raise exception 'creator confirmation required'; end if;
  if exists(select 1 from profiles where id=p_actor and publishing_suspended_at is not null) then raise exception 'publishing access is suspended'; end if;
  select response_json into existing from idempotency_records where actor_id=p_actor and operation='submit_pack' and key=p_idempotency;
  if existing is not null then return existing; end if;
  if exists(select 1 from contribution_content_hashes where content_hash=p_content_hash and state in ('pending','approved','published')) then raise exception using message='duplicate_pack: This pack is already in the contribution pipeline.', errcode='unique_violation'; end if;
  pack_title:=nullif(trim(p_pack->>'title'),''); target:=nullif(trim(p_pack->>'language'),''); base:=nullif(trim(p_pack->>'baseLanguage'),'');
  if pack_title is null or target is null or base is null then raise exception 'invalid pack'; end if;
  insert into submissions(creator_id,target_language,base_language,title,state,current_version)
  values(p_actor,target,base,pack_title,'submitted',1) returning * into s;
  insert into submission_versions(submission_id,version,source_draft_revision,canonical_json,content_hash,schema_version,generation_source,creation_method,possible_duplicate,duplicate_match_submission_id,duplicate_similarity,duplicate_reasons,creator_confirmed)
  values(s.id,1,1,p_pack,p_content_hash,coalesce((p_pack->>'schemaVersion')::integer,1),p_generation_source,p_creation_method,coalesce(p_possible_duplicate,false),p_duplicate_match_submission_id,p_duplicate_similarity,coalesce(p_duplicate_reasons,'[]'::jsonb),true);
  insert into contribution_content_hashes(content_hash,submission_id,submission_version,state) values(p_content_hash,s.id,1,'pending');
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,next_state,submission_version,action_id,metadata)
  values(p_actor,active_roles(p_actor),'submission_created','submission',s.id::text,'submitted',1,p_idempotency,jsonb_build_object('creationMethod',p_creation_method,'possibleDuplicate',p_possible_duplicate));
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(p_actor,'submission_received','Submission received',s.title||' was submitted for language review.','/contribute?submission='||s.id,s.id::text);
  existing:=jsonb_build_object('submissionId',s.id,'version',1,'state','submitted','contentHash',p_content_hash,'possibleDuplicate',p_possible_duplicate);
  insert into idempotency_records(actor_id,operation,key,request_hash,response_json) values(p_actor,'submit_pack',p_idempotency,p_content_hash,existing);
  return existing;
exception when unique_violation then raise exception using message='duplicate_pack: This pack is already in the contribution pipeline.', errcode='unique_violation'; end $$;

create or replace function public.transition_submission(p_actor uuid,p_submission uuid,p_expected_version integer,p_expected_row_version integer,p_next text,p_reason text,p_action_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions; roles_now text[]; permitted boolean:=false; pub_id uuid; snapshot jsonb; checksum text; previous_state text; next_state text:=p_next;
begin
  if not public.is_service_role() then raise exception 'service role required'; end if; roles_now:=active_roles(p_actor); select * into s from submissions where id=p_submission for update; if s.id is null then raise exception 'submission not found'; end if; previous_state:=s.state;
  if exists(select 1 from audit_events where action_id=p_action_id) then return jsonb_build_object('submissionId',s.id,'version',s.current_version,'state',s.state,'rowVersion',s.row_version); end if;
  if s.current_version<>p_expected_version or s.row_version<>p_expected_row_version then raise exception 'stale submission version'; end if;
  if p_next='restore' then if s.state<>'archived' then raise exception 'invalid submission transition'; end if; next_state:=coalesce(s.archived_from_state,'approved'); end if;
  if s.state='submitted' and next_state in ('changes_requested','language_approved','rejected') then permitted:=('admin'=any(roles_now) or 'super_admin'=any(roles_now)) or ('moderator'=any(roles_now) and exists(select 1 from moderation_assignments where submission_id=s.id and moderator_id=p_actor and state='active') and exists(select 1 from moderator_language_assignments where moderator_id=p_actor and language_code=s.target_language and suspended_at is null and (expires_at is null or expires_at>now())));
  elsif s.state='submitted' and next_state in ('approved','archived') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='submitted' and next_state='withdrawn' then permitted:=s.creator_id=p_actor;
  elsif s.state='language_approved' and next_state in ('approved','changes_requested','rejected') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='approved' and next_state in ('published','changes_requested','archived') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='published' and next_state in ('approved','archived') then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state in ('rejected','changes_requested') and next_state='archived' then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now);
  elsif s.state='archived' and p_next='restore' then permitted:='admin'=any(roles_now) or 'super_admin'=any(roles_now); else raise exception 'invalid submission transition'; end if;
  if not permitted then raise exception 'permission denied'; end if; if next_state in ('changes_requested','rejected','archived') and nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  if next_state='published' then select canonical_json,content_hash into snapshot,checksum from submission_versions where submission_id=s.id and version=s.current_version; if snapshot is null then raise exception 'immutable submission version not found'; end if; insert into published_lessons(stable_lesson_id,submission_id,published_version,title,description,target_language,base_language,level,tags,sentence_count,contributor_id,schema_version,lesson_version,checksum,content_hash) values(coalesce(snapshot->>'id','lesson-'||s.id),s.id,s.current_version,snapshot->>'title',coalesce(snapshot->>'description',''),snapshot->>'language',snapshot->>'baseLanguage',coalesce(snapshot->>'level',''),coalesce(array(select jsonb_array_elements_text(snapshot->'tags')),'{}'),(select coalesce(sum(jsonb_array_length(lesson->'sentences')),0) from jsonb_array_elements(snapshot->'lessons') lesson),s.creator_id,(snapshot->>'schemaVersion')::integer,coalesce(snapshot->>'version',s.current_version::text),checksum,checksum) on conflict(submission_id) do update set published_version=excluded.published_version,title=excluded.title,description=excluded.description,target_language=excluded.target_language,base_language=excluded.base_language,level=excluded.level,tags=excluded.tags,sentence_count=excluded.sentence_count,schema_version=excluded.schema_version,lesson_version=excluded.lesson_version,checksum=excluded.checksum,content_hash=excluded.content_hash,updated_at=now(),archived_at=null returning id into pub_id;
  elsif previous_state='published' and next_state in ('approved','archived') then update published_lessons set archived_at=now(),updated_at=now() where submission_id=s.id; end if;
  update submissions set state=next_state,row_version=row_version+1,updated_at=now(),archived_from_state=case when next_state='archived' then previous_state when previous_state='archived' then null else archived_from_state end where id=s.id returning * into s;
  if next_state in ('changes_requested','language_approved','rejected','approved') then update moderation_assignments set state='completed',released_at=now() where submission_id=s.id and state='active'; end if;
  if next_state in ('changes_requested','rejected') then insert into reviewer_feedback(submission_id,submission_version,author_id,target_type,category,body,visibility) values(s.id,s.current_version,p_actor,'pack','other',trim(p_reason),'contributor'); end if;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,previous_state,next_state,reason,submission_version,action_id,metadata) values(p_actor,roles_now,case when p_next='restore' then 'submission_restored' else 'submission_transition' end,'submission',s.id::text,previous_state,next_state,p_reason,s.current_version,p_action_id,jsonb_build_object('requestedAction',p_next));
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(s.creator_id,next_state,replace(initcap(next_state),'_',' '),s.title||' is now '||replace(next_state,'_',' ')||'.','/contribute?submission='||s.id,s.id::text); return jsonb_build_object('submissionId',s.id,'version',s.current_version,'state',s.state,'rowVersion',s.row_version,'publishedLessonId',pub_id);
end $$;
revoke execute on function public.submit_pack(uuid,jsonb,text,text,text,boolean,text,boolean,uuid,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.submit_pack(uuid,jsonb,text,text,text,boolean,text,boolean,uuid,numeric,jsonb) to service_role;
