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

The live download count is served by `api/download-count.js` and needs a Redis-compatible Vercel KV or Upstash REST database. Set these environment variables in Vercel:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

The API also accepts Upstash's native `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` names.

## Contributor pipeline

The contributor, moderation, administration, and public-library implementation is documented in `docs/contributor-pipeline.md`. The two-method pack contribution workflow, canonical hash rules, duplicate behavior, and migration steps are in `docs/contribution-pack-workflow.md`. Apply migrations `001_contributor_pipeline.sql`, `002_usernames.sql`, and `003_pack_contribution_workflow.sql` before enabling those routes.

Drizzle ORM configuration lives in `drizzle.config.ts` and
`drizzle/schema.ts` for migration tooling. `GET /api/library` reads published
`.fydorpack` files directly from the Supabase Storage `packs` bucket; it does
not require `DATABASE_URL`. The public-library read path treats Redis/KV rate
limiting as optional, so a Redis outage cannot make published lessons
unavailable. Redis remains required in production for rate-limited writes and
privileged workspace actions.

## Pack Publishing

Pack publication is now only performed after authenticated contribution and
moderation. The legacy `POST /api/packs` route returns a migration response and
does not bypass review. Set:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PACK_BUCKET` (defaults to `packs`)

Environment-specific administrator-bootstrap instructions belong in the ignored `ADMIN_BOOTSTRAP.local.md` file.
