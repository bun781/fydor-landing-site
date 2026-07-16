# AGENTS.md - Fydor Website

## Scope

This folder is a Vercel-hosted Next.js App Router website for Fydor.

Do not inspect or modify the parent Habitz/Fydor app unless the user explicitly asks for app changes. The website should remain self-contained so future coding agents can work here without loading the full product repository.

## Project Map

```
fydor-website/
├── app/              App Router pages and Route Handlers
├── lib/supabase/     Canonical browser, server, proxy, and admin clients
├── migrations/       Supabase schema and RLS migrations
├── public/           Static assets and temporary compatibility pages
└── README.md         Local usage notes
```

## Design Notes

- Keep the website visually aligned with the Fydor app: warm off-white background, white surfaces, stone ink, fine borders, serif headings, restrained accent color, small border radii.
- Keep it practical and download-focused. Avoid turning it into a generic SaaS landing page.
Supabase Auth is the only identity provider. Supabase roles and RLS are the
only authorization authority. Never add custom JWT parsing, local-storage auth,
hardcoded administrator emails, browser-editable roles, or a second auth system.
Service-role credentials are server-only. Every admin handler independently
verifies the Supabase user and trusted role; Proxy is never the sole gate.
New Pages Router API routes are forbidden. Keep routing in `app/`, do not
duplicate Next.js redirects in `vercel.json`, and use the factories in
`lib/supabase/` rather than creating additional clients.

## Validation

Run:

```sh
npm run typecheck && npm test && npm run build
```
