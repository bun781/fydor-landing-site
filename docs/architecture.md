# Website architecture

Fydor Website is a Vercel-hosted Next.js App Router application. Supabase Auth
is the only identity provider and Supabase Postgres is the authorization source
of truth. No browser metadata, local storage value, email allow-list, or route
name grants access.

## Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/`, `/about` | public | Marketing pages |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | public | Canonical Supabase Auth flows |
| `/auth/callback` | public callback | Exchanges Supabase PKCE code; `next` is normalized to an internal path |
| `/library`, `/contribute`, `/moderate` | authenticated workspace compatibility routes | Existing Exchange UI |
| `/admin` | administrator | Server-side `requireAdmin` gate |
| `/api/library`, `/api/download-count` | public HTTP endpoints | Public library and counter |
| `/api/contributor`, `/api/moderation` | authenticated | Contributor and moderation actions |
| `/api/admin` | admin or super-admin | Privileged operations |

All user-facing pages are App Router routes. Static assets in `public/` are
limited to downloads and images.

## Auth and authorization

`lib/supabase/browser.ts` creates the browser client with only the publishable
key. `lib/supabase/server.ts` creates a request-scoped SSR client. `proxy.ts`
refreshes session cookies; it does not decide administrator access.

`requireAdmin()` verifies the Supabase user then resolves active roles from the
controlled `user_roles` and `roles` tables using server-only code. Every admin
route handler must call it (or an equally narrow server-only authorization
helper) itself. The service-role key is server-only and must never use a
`NEXT_PUBLIC_` name.

Migration `005_rls_hardening.sql` enables RLS and removes anonymous and
authenticated Data API grants from every website table. The current product is
server-mediated; do not add permissive RLS policies merely to make a client
query work.

## Operations

Set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only
`SUPABASE_SERVICE_ROLE_KEY` in Vercel. Configure Supabase Auth Site URL to the
production site and allow `https://<production-domain>/auth/callback` plus
intentional preview callback URLs. Apply migrations in order, including 005.

Bootstrap the first super-admin only with `npm run admin:bootstrap` from a
trusted operator environment; never add a browser endpoint for it.
