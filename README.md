# Fydor Website

Standalone static website for introducing Fydor and linking Windows/macOS downloads.

## Local Preview

Open `index.html` directly in a browser, or run a simple static server:

```sh
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Download Links

The current buttons point to placeholder files:

- `downloads/fydor-windows.exe`
- `downloads/fydor-mac.dmg`

Replace those paths with real release URLs when installers are available.

## Global Download Counter

The live download count is served by `api/download-count.js` and stored in
Supabase through the server-only credential. Apply migration
`004_native_rate_limits.sql` before deploying it.

## Contributor pipeline

The contributor, moderation, administration, and public-library implementation is documented in `docs/contributor-pipeline.md`. The two-method pack contribution workflow, canonical hash rules, duplicate behavior, and migration steps are in `docs/contribution-pack-workflow.md`. Apply migrations `001_contributor_pipeline.sql` through `004_native_rate_limits.sql` before enabling those routes.

Drizzle ORM configuration lives in `drizzle.config.ts` and
`drizzle/schema.ts` for migration tooling. `GET /api/library` reads published
`.fydorpack` files directly from the Supabase Storage `packs` bucket; it does
not require `DATABASE_URL`. Rate limits and the download counter use Supabase,
so no additional data-service account is required.

## Pack Publishing

Pack publication is now only performed after authenticated contribution and
moderation. The legacy `POST /api/packs` route returns a migration response and
does not bypass review. Set:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PACK_BUCKET` (defaults to `packs`)

Environment-specific administrator-bootstrap instructions belong in the ignored `ADMIN_BOOTSTRAP.local.md` file.
