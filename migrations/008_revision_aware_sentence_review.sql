-- Contributor sentence approvals belong to one exact editable draft revision.
-- This prevents an approval from surviving an edited or reordered sentence.

alter table public.sentence_review_progress
  add column if not exists draft_revision integer;

update public.sentence_review_progress progress
set draft_revision = drafts.revision
from public.contributor_drafts drafts
where drafts.id = progress.draft_id
  and progress.draft_revision is null;

alter table public.sentence_review_progress
  alter column draft_revision set not null;

alter table public.sentence_review_progress
  drop constraint if exists sentence_review_status_check;

update public.sentence_review_progress
set status = case status
  when 'reviewed' then 'approved'
  when 'needs_work' then 'needs_changes'
  else status
end;

alter table public.sentence_review_progress
  add constraint sentence_review_status_check
  check (status in ('unreviewed','approved','needs_changes'));

create index if not exists sentence_review_revision_idx
  on public.sentence_review_progress(draft_id, draft_revision, status);

create or replace function public.submit_draft(p_actor uuid,p_draft uuid,p_expected_revision integer,p_confirmed boolean,p_idempotency text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d contributor_drafts; s submissions; v integer; sentence_total integer; approved_total integer; existing jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  if not has_role(p_actor,'contributor') then raise exception 'contributor role required'; end if;
  select response_json into existing from idempotency_records where actor_id=p_actor and operation='submit' and key=p_idempotency;
  if existing is not null then return existing; end if;
  select * into d from contributor_drafts where id=p_draft for update;
  if d.id is null or d.owner_id<>p_actor then raise exception 'draft not found'; end if;
  if d.revision<>p_expected_revision then raise exception 'stale draft revision'; end if;
  if d.state not in ('reviewing','changes_requested','withdrawn') then raise exception 'draft is not ready'; end if;
  if not p_confirmed then raise exception 'creator confirmation required'; end if;
  select coalesce(sum(jsonb_array_length(lesson->'sentences')),0) into sentence_total from jsonb_array_elements(d.canonical_json->'lessons') lesson;
  select count(*) into approved_total from sentence_review_progress where draft_id=d.id and draft_revision=d.revision and status='approved';
  if approved_total<>sentence_total then raise exception 'every current sentence revision must be approved'; end if;
  if exists(select 1 from contribution_content_hashes where content_hash=d.content_hash and state in ('pending','approved','published')) then
    raise exception using message = 'duplicate_pack: This pack is already in the contribution pipeline.', errcode = 'unique_violation';
  end if;
  select * into s from submissions where source_draft_id=d.id order by created_at desc limit 1 for update;
  if s.id is null then
    insert into submissions(creator_id,source_draft_id,target_language,base_language,title,state,current_version)
    values(p_actor,d.id,d.target_language,d.base_language,d.title,'submitted',1) returning * into s; v:=1;
  else
    if s.state not in ('changes_requested','withdrawn') then raise exception 'submission already open'; end if;
    v:=s.current_version+1;
    update submissions set state='submitted',current_version=v,row_version=row_version+1,updated_at=now() where id=s.id returning * into s;
  end if;
  insert into submission_versions(submission_id,version,source_draft_revision,canonical_json,content_hash,schema_version,generation_source,creation_method,possible_duplicate,duplicate_match_submission_id,duplicate_similarity,duplicate_reasons,prompt_template_version,creator_confirmed)
  values(s.id,v,d.revision,d.canonical_json,d.content_hash,d.schema_version,d.generation_source,d.creation_method,d.possible_duplicate,d.duplicate_match_submission_id,d.duplicate_similarity,d.duplicate_reasons,d.prompt_template_version,true);
  insert into contribution_content_hashes(content_hash,submission_id,submission_version,state) values(d.content_hash,s.id,v,'pending');
  update contributor_drafts set state='reviewing',updated_at=now() where id=d.id;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,previous_state,next_state,submission_version,action_id,metadata)
  values(p_actor,active_roles(p_actor),'submission_created','submission',s.id::text,d.state,'submitted',v,p_idempotency,jsonb_build_object('creationMethod',d.creation_method,'possibleDuplicate',d.possible_duplicate));
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(p_actor,'submission_received','Submission received',d.title||' was submitted for language review.','/contribute?submission='||s.id,s.id::text);
  existing:=jsonb_build_object('submissionId',s.id,'version',v,'state','submitted','contentHash',d.content_hash,'possibleDuplicate',d.possible_duplicate);
  insert into idempotency_records(actor_id,operation,key,request_hash,response_json) values(p_actor,'submit',p_idempotency,d.content_hash,existing);
  return existing;
exception when unique_violation then
  raise exception using message = 'duplicate_pack: This pack is already in the contribution pipeline.', errcode = 'unique_violation';
end $$;

grant execute on function public.submit_draft(uuid,uuid,integer,boolean,text) to service_role;
