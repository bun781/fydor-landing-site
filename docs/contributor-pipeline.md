# Fydor contributor, moderation, and publication pipeline

## Boundary and deployment

`fydor-website` is a standalone static Vercel site with Node serverless functions under `api/`. Supabase provides verified user identity and PostgreSQL persistence. The desktop application remains local-first and never receives the Supabase service-role credential.

Required server environment variables:

- `FYDOR_WEB_ORIGIN` (or `NEXT_PUBLIC_FYDOR_WEB_ORIGIN` / `VITE_FYDOR_WEB_ORIGIN`): canonical website origin. HTTPS is mandatory except on localhost. Vercel preview deployments fall back to their trusted `VERCEL_URL`.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (intentionally delivered to the sign-in client)
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `DATABASE_URL`: required only for Drizzle migration tooling; it is not used by
  `GET /api/library`. The public library reads validated `.fydorpack` files
  directly from the public `packs` Storage bucket using the server-only
  Supabase credential.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: required in
  production for rate-limited writes and privileged workspace actions. Public
  library reads fail open if this optional protection is unavailable, with a
  structured server warning so Redis configuration can still be repaired.

The Vercel functions are Node.js functions (not Edge functions). This is
required by the `postgres` database driver used by the library endpoint.

Origin parsing, URL construction, preview-origin handling, and chatbot destinations are centralized in `lib/config.js`. API CORS accepts the configured origin and the exact current Vercel preview origin; the read-only public library permits all origins so the Tauri app can browse it. No client-provided callback URL is accepted.

## Lesson-purpose model

- A personal lesson is local SQLite study content. Save/update/delete actions remain local and never submit it.
- A contributor draft is an authenticated website record with `purpose = contributor` and its own revision/review lifecycle.
- **Convert to contributor draft** copies canonical JSON to the clipboard and opens the contributor workspace with the source local lesson ID. Saving there creates a separate website draft, resets contributor review, records the conversion source, and creates an audit event. The personal lesson is untouched.
- Submission snapshots and published versions are immutable and never used as mutable editor records.

## Manual chatbot workflow

The generation workspace combines `fydor-pack-v1.0.0` with topic, ideas, levels, goals, constraints, cultural context, sentence count, annotation preferences, and schema version. The only generation integration is manual:

1. Generate the prompt.
2. Copy it, optionally opening the allowlisted `https://chatgpt.com/` or `https://claude.ai/` destination.
3. Paste the returned JSON into Fydor.
4. Validate independently.

Fydor does not call provider APIs, store provider keys, scrape chat sites, access browser sessions, or imply that a consumer subscription includes API use. Prompt inputs redact common secret-key shapes.

## Authoritative validation and sanitization

`lib/pack-schema.js` is authoritative for contributor and published pack content. It enforces a 5 MB limit, 24-level depth limit, strict JSON, dangerous-key rejection, strict desktop pack schemas, supported languages, string/array/sentence limits, required translations, duplicate detection, annotation surface membership, control/bidirectional character rejection, and script-like HTML rejection. All UI rendering uses `textContent`. `lib/lesson-schema.js` remains available for legacy lesson tooling, but it is not the contribution submission validator.

The desktop Rust importer independently enforces compatible limits and rules because it is a separate runtime and must remain secure when importing local JSON. Published downloads are checksum-verified over stable canonical JSON before conversion to the existing local lesson shape and authoritative Rust validation.

Lesson JSON never causes URL fetching or code execution. Raw HTML, Markdown execution, shell execution, arbitrary callbacks, and arbitrary filesystem writes are not supported.

## Roles and authorization

Database roles are `user`, `contributor`, `moderator`, `admin`, and `super_admin`; users may hold multiple roles. Signup creates only an ordinary user. Contributor is a safe self-opt-in performed by the authenticated server endpoint. Moderator/admin/super-admin changes use protected database functions and audit events.

Every protected request validates the current Supabase access token, refreshes the profile, and resolves current database roles. Mutating database functions are executable only by the server `service_role` and repeat role, assignment, language, state, and stale-version checks inside the transaction. Moderator removal suspends the role and language assignments and releases active assignments without deleting attribution or feedback.

Environment-specific administrator-bootstrap instructions belong in the ignored `ADMIN_BOOTSTRAP.local.md` file.

## State and immutable versions

The workflow uses:

`draft → reviewing → submitted → changes_requested | language_approved | rejected | withdrawn → approved → published → archived`

The SQL transition function is the enforcement point. It locks the submission, checks `current_version` plus `row_version`, checks current roles/assignments, enforces required reasons, uses unique action identifiers, records an audit event, and emits a grouped notification. Changes requested preserve the old snapshot/feedback, increment the editable draft revision, and reset creator sentence review.

Submission uses a transaction and idempotency key. It rechecks draft ownership, revision, contributor role, creator confirmation, and complete canonical sentence-review rows before creating a new immutable `submission_versions` row.

## Database model and migration

`migrations/001_contributor_pipeline.sql` creates the base contributor and
moderation model. `migrations/002_usernames.sql` adds username support and
`migrations/003_pack_contribution_workflow.sql` adds the shared pack hash,
creation-method, duplicate-warning, and publication-hash extensions. Apply all
three through the normal Supabase migration runner in a test project first.

The base migration creates:

- profiles, roles, user roles, supported languages, moderator-language assignments
- contributor drafts and sentence-review progress
- submissions and immutable submission versions
- moderation assignments and reviewer feedback
- audit and permission events
- published lessons with an exact approved-version foreign key
- notifications and idempotency records

It includes foreign keys, checks, uniqueness constraints, partial claim/publication indexes, query indexes, row-level security, and transactional security-definer functions.

`drizzle/schema.ts` is the typed ORM mirror used for schema review and future
Drizzle migrations. `drizzle.config.ts` writes generated migrations under
`migrations/drizzle/`. The hand-authored `001_contributor_pipeline.sql` remains
the baseline because it contains Supabase RLS policies and PL/pgSQL transition
functions that should not be replaced by an automatically generated table diff.

Rollback is deliberately data-preserving: disable the new routes, archive publications, revoke function execution, and take a database backup before dropping objects. Do not drop submission/version/audit tables in a production rollback.

## API surface

- `GET/POST /api/contributor`: prompt, validate, save/load/resume draft, convert personal copy, sentence review, preflight, submit/resubmit, withdraw, history, feedback view, notifications
- `GET/POST /api/moderation`: queue, workspace/revision comparison data, claim, feedback, resolution, state transitions, audit
- `GET/POST /api/admin`: verified-user search, moderator/language management, administrator management
- `GET /api/library`: paginated public pack search/detail and direct `.fydorpack` download from Storage
- `GET /api/client-config`: non-secret browser configuration and chatbot allowlist

Requests have payload limits, structured errors, bearer authentication, server authorization, fixed-window production rate limits, optimistic concurrency, and idempotency on submission/transitions. Bearer APIs do not use ambient cookies, so CSRF tokens are not applicable.

## User interfaces

- `/contribute.html` (Fydor Exchange): public published-lesson search/filter/download at the top, followed by prompt generation, chatbot launch, safe JSON import, draft resume, sentence review, preflight, immutable submission, and withdrawal/history
- `/moderate.html`: queue/claim, immutable sentence inspection, version feedback, request changes, language approval/rejection, admin approval/publication/archive
- `/admin.html`: verified-user search and moderator/language changes
- `/library.html`: permanent redirect to the Exchange public-library section

## Desktop import flow

The desktop Exchange page calls only the configured `/api/library`. It downloads the validated `.fydorpack` into memory, verifies its SHA-256 checksum, rejects hostile JSON, validates schema compatibility, and passes it to the existing local pack importer. Updates preserve review state for unchanged sentences and warn if reviewed sentences disappear.

The SQLite migration 6 adds only purpose and published-provenance columns to `lessons`; all existing rows become private personal lessons.

## Known deployment limitations

- The SQL migration and end-to-end authenticated workflow require a configured Supabase test/production project; repository tests cannot create that external environment.
- Email delivery and Supabase redirect allowlists must be configured in the deployment console.
- Public lesson attribution is stored internally by contributor ID; the current public response omits contributor identity until an explicit attribution preference is added.
- There is intentionally no model-provider API or BYOK mode.
