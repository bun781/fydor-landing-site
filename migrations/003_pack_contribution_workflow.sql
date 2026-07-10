-- Pack-shaped contribution workflow. This migration extends the existing
-- contributor/moderation tables; it does not create a second publication path.

alter table public.contributor_drafts add column if not exists creation_method text not null default 'ai';
alter table public.contributor_drafts add column if not exists possible_duplicate boolean not null default false;
alter table public.contributor_drafts add column if not exists duplicate_match_submission_id uuid;
alter table public.contributor_drafts add column if not exists duplicate_similarity numeric(6,5);
alter table public.contributor_drafts add column if not exists duplicate_reasons jsonb not null default '[]'::jsonb;
alter table public.contributor_drafts drop constraint if exists contributor_drafts_creation_method_check;
alter table public.contributor_drafts add constraint contributor_drafts_creation_method_check check (creation_method in ('ai','upload'));

alter table public.submission_versions add column if not exists creation_method text not null default 'ai';
alter table public.submission_versions add column if not exists possible_duplicate boolean not null default false;
alter table public.submission_versions add column if not exists duplicate_match_submission_id uuid;
alter table public.submission_versions add column if not exists duplicate_similarity numeric(6,5);
alter table public.submission_versions add column if not exists duplicate_reasons jsonb not null default '[]'::jsonb;
alter table public.submission_versions drop constraint if exists submission_versions_creation_method_check;
alter table public.submission_versions add constraint submission_versions_creation_method_check check (creation_method in ('ai','upload'));

-- Historical published rows predate pack hashes. The backfill below uses the
-- immutable submission hash when available. Rows that cannot be backfilled are
-- left nullable and are reported by the migration verification query in the
-- contributor documentation rather than silently assigned a wrong hash.
alter table public.published_lessons add column if not exists content_hash text;
update public.published_lessons p
set content_hash = v.content_hash
from public.submission_versions v
where v.submission_id = p.submission_id
  and v.version = p.published_version
  and p.content_hash is null;
create unique index if not exists published_lessons_content_hash_unique
  on public.published_lessons(content_hash) where content_hash is not null;

create table if not exists public.contribution_content_hashes (
  content_hash text primary key check (content_hash ~ '^[a-f0-9]{64}$'),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  submission_version integer not null,
  state text not null check (state in ('pending','approved','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (submission_id, submission_version) references public.submission_versions(submission_id, version) on delete cascade
);
create index if not exists contribution_hash_submission_idx on public.contribution_content_hashes(submission_id);

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
  select coalesce(sum(jsonb_array_length(lesson->'sentences')),0) into sentence_total from jsonb_array_elements(d.canonical_json->'lessons') lesson;
  select count(*) into reviewed_total from sentence_review_progress where draft_id=d.id and status='reviewed';
  if reviewed_total<>sentence_total then raise exception 'every sentence must be reviewed'; end if;
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
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(p_actor,'submission_received','Submission received',d.title||' was submitted for language review.','/contribute.html?submission='||s.id,s.id::text);
  existing:=jsonb_build_object('submissionId',s.id,'version',v,'state','submitted','contentHash',d.content_hash,'possibleDuplicate',d.possible_duplicate);
  insert into idempotency_records(actor_id,operation,key,request_hash,response_json) values(p_actor,'submit',p_idempotency,d.content_hash,existing);
  return existing;
exception when unique_violation then
  raise exception using message = 'duplicate_pack: This pack is already in the contribution pipeline.', errcode = 'unique_violation';
end $$;

create or replace function public.sync_contribution_hash_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.state in ('rejected','withdrawn','changes_requested','archived') then
    delete from contribution_content_hashes where submission_id = new.id;
  elsif new.state in ('submitted','language_approved') then
    update contribution_content_hashes set state='pending',updated_at=now() where submission_id=new.id and submission_version=new.current_version;
  elsif new.state='approved' then
    update contribution_content_hashes set state='approved',updated_at=now() where submission_id=new.id and submission_version=new.current_version;
  elsif new.state='published' then
    update contribution_content_hashes set state='published',updated_at=now() where submission_id=new.id and submission_version=new.current_version;
  end if;
  return new;
end $$;
drop trigger if exists contribution_hash_state_trigger on public.submissions;
create trigger contribution_hash_state_trigger after update of state,current_version on public.submissions
for each row execute function public.sync_contribution_hash_state();

create or replace function public.transition_submission(p_actor uuid,p_submission uuid,p_expected_version integer,p_expected_row_version integer,p_next text,p_reason text,p_action_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions; roles_now text[]; permitted boolean:=false; pub_id uuid; snapshot jsonb; checksum text; previous_state text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'service role required'; end if;
  roles_now:=active_roles(p_actor); select * into s from submissions where id=p_submission for update; previous_state:=s.state;
  if exists(select 1 from audit_events where action_id=p_action_id) then return jsonb_build_object('submissionId',s.id,'version',s.current_version,'state',s.state,'rowVersion',s.row_version); end if;
  if s.id is null then raise exception 'submission not found'; end if;
  if s.current_version<>p_expected_version or s.row_version<>p_expected_row_version then raise exception 'stale submission version'; end if;
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
    insert into published_lessons(stable_lesson_id,submission_id,published_version,title,description,target_language,base_language,level,tags,sentence_count,contributor_id,schema_version,lesson_version,checksum,content_hash)
    values(coalesce(snapshot->>'id','lesson-'||s.id),s.id,s.current_version,snapshot->>'title',coalesce(snapshot->>'description',''),snapshot->>'language',snapshot->>'baseLanguage',coalesce(snapshot->>'level',''),coalesce(array(select jsonb_array_elements_text(snapshot->'tags')),'{}'),(select coalesce(sum(jsonb_array_length(lesson->'sentences')),0) from jsonb_array_elements(snapshot->'lessons') lesson),s.creator_id,(snapshot->>'schemaVersion')::integer,coalesce(snapshot->>'version',s.current_version::text),checksum,checksum)
    on conflict(submission_id) do update set published_version=excluded.published_version,title=excluded.title,description=excluded.description,target_language=excluded.target_language,base_language=excluded.base_language,level=excluded.level,tags=excluded.tags,sentence_count=excluded.sentence_count,schema_version=excluded.schema_version,lesson_version=excluded.lesson_version,checksum=excluded.checksum,content_hash=excluded.content_hash,updated_at=now(),archived_at=null returning id into pub_id;
  elsif p_next='archived' then update published_lessons set archived_at=now(),updated_at=now() where submission_id=s.id;
  end if;
  update submissions set state=p_next,row_version=row_version+1,updated_at=now() where id=s.id returning * into s;
  if p_next='changes_requested' then update contributor_drafts set state='changes_requested',revision=revision+1,updated_at=now() where id=s.source_draft_id; delete from sentence_review_progress where draft_id=s.source_draft_id;
  elsif p_next='withdrawn' then update contributor_drafts set state='withdrawn',updated_at=now() where id=s.source_draft_id; end if;
  if p_next in ('changes_requested','language_approved','rejected') then update moderation_assignments set state='completed',released_at=now() where submission_id=s.id and state='active'; end if;
  insert into audit_events(actor_id,actor_roles,event_type,entity_type,entity_id,previous_state,next_state,reason,submission_version,action_id) values(p_actor,roles_now,'submission_transition','submission',s.id::text,previous_state,p_next,p_reason,s.current_version,p_action_id);
  insert into notifications(user_id,kind,title,body,link_path,group_key) values(s.creator_id,p_next,replace(initcap(p_next),'_',' '),s.title||' is now '||replace(p_next,'_',' ')||'.','/contribute.html?submission='||s.id,s.id::text);
  return jsonb_build_object('submissionId',s.id,'version',s.current_version,'state',s.state,'rowVersion',s.row_version,'publishedLessonId',pub_id);
end $$;

grant execute on function public.sync_contribution_hash_state() to service_role;
