-- The website is server-mediated. Browser clients use only Supabase Auth;
-- they have no direct table grants. Service-role calls remain limited to the
-- reviewed server modules and the SECURITY DEFINER functions in prior migrations.

alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.supported_languages enable row level security;
alter table public.moderator_language_assignments enable row level security;
alter table public.moderation_assignments enable row level security;
alter table public.audit_events enable row level security;
alter table public.permission_events enable row level security;
alter table public.idempotency_records enable row level security;
alter table public.contribution_content_hashes enable row level security;
alter table public.rate_limit_windows enable row level security;
alter table public.website_metrics enable row level security;

revoke all on table public.profiles, public.roles, public.user_roles,
  public.supported_languages, public.moderator_language_assignments,
  public.contributor_drafts, public.sentence_review_progress, public.submissions,
  public.submission_versions, public.moderation_assignments, public.reviewer_feedback,
  public.audit_events, public.permission_events, public.published_lessons,
  public.notifications, public.idempotency_records, public.contribution_content_hashes,
  public.rate_limit_windows, public.website_metrics from anon, authenticated;

-- Deliberately no permissive policies: Data API callers cannot read or mutate
-- application tables. Add a narrowly scoped RLS policy only with a matching
-- authenticated-user test; never grant role-management access to users.
