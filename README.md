# Fydor Website

Vercel-hosted Next.js App Router website for Fydor, including the public
Exchange and contributor workflow.

## Download Links

The current buttons point to placeholder files:

- `public/downloads/fydor-windows.exe`
- `public/downloads/fydor-mac.dmg`

These files are served directly at `/downloads/fydor-windows.exe` and
`/downloads/fydor-mac.dmg`.

## Global Download Counter

The live download count is served by `/api/download-count` and stored in
Supabase through the server-only credential. Apply migration
`004_native_rate_limits.sql` before deploying it.

## Contributor pipeline

The contributor, moderation, administration, and public-library implementation is documented in `docs/contributor-pipeline.md`. The current route, Supabase SSR, RLS, and Vercel design is in `docs/architecture.md`. Apply migrations `001_contributor_pipeline.sql` through `006_auth_profile_sync.sql` before enabling protected routes.

Drizzle ORM configuration lives in `drizzle.config.ts` and
`drizzle/schema.ts` for migration tooling. `GET /api/library` reads published
`.fydorpack` files directly from the Supabase Storage `packs` bucket; it does
not require `DATABASE_URL`. Rate limits and the download counter use Supabase,
so no additional data-service account is required.

## Pack Publishing

Pack publication is now only performed after authenticated contribution and
moderation. The legacy `POST /api/packs` route returns a migration response and
does not bypass review. Set:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PACK_BUCKET` (defaults to `packs`)

`DATABASE_URL` is required only for Drizzle commands and the controlled
administrator-bootstrap script. Compatibility handlers still accept legacy
Supabase variable names, but new deployment setup must use the names above.

Environment-specific administrator-bootstrap instructions belong in the ignored `ADMIN_BOOTSTRAP.local.md` file.
