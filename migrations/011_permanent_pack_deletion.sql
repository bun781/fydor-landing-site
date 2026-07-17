-- Permanently removes a published submission after its public Storage object
-- has been removed by the server-side admin handler. Audit events intentionally
-- remain as non-content operational records.

create or replace function public.hard_delete_submission(
  p_actor uuid,
  p_submission uuid,
  p_expected_row_version integer,
  p_reason text,
  p_action_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions; roles_now text[];
begin
  if not public.is_service_role() then raise exception 'service role required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  if nullif(trim(p_action_id),'') is null then raise exception 'action id required'; end if;
  roles_now := active_roles(p_actor);
  if not ('admin'=any(roles_now) or 'super_admin'=any(roles_now)) then raise exception 'permission denied'; end if;

  if exists(select 1 from audit_events where action_id=p_action_id) then
    return jsonb_build_object('submissionId', p_submission, 'deleted', true, 'idempotent', true);
  end if;

  select * into s from submissions where id=p_submission for update;
  if s.id is null then raise exception 'submission not found'; end if;
  if s.row_version <> p_expected_row_version then raise exception 'stale submission version'; end if;
  if s.state <> 'published' or not exists(select 1 from published_lessons where submission_id=s.id and archived_at is null) then
    raise exception 'submission is not currently published';
  end if;

  delete from published_lessons where submission_id=s.id;
  delete from reviewer_feedback where submission_id=s.id;
  delete from moderation_assignments where submission_id=s.id;
  delete from contribution_content_hashes where submission_id=s.id;
  delete from submission_versions where submission_id=s.id;
  delete from submissions where id=s.id;

  insert into audit_events(actor_id, actor_roles, event_type, entity_type, entity_id, previous_state, next_state, reason, action_id, metadata)
  values(p_actor, roles_now, 'submission_permanently_deleted', 'submission', s.id::text, 'published', 'deleted', trim(p_reason), p_action_id,
    jsonb_build_object('title', s.title, 'targetLanguage', s.target_language, 'baseLanguage', s.base_language));
  return jsonb_build_object('submissionId', s.id, 'deleted', true, 'idempotent', false);
end $$;

revoke execute on function public.hard_delete_submission(uuid,uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.hard_delete_submission(uuid,uuid,integer,text,text) to service_role;
