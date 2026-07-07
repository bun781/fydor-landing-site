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
