# AGENTS.md - Fydor Website

## Scope

This folder is a standalone static marketing/download website for Fydor.

Do not inspect or modify the parent Habitz/Fydor app unless the user explicitly asks for app changes. The website should remain self-contained so future coding agents can work here without loading the full product repository.

## Project Map

```
fydor-website/
├── index.html        Static website entry point
├── styles.css        All visual styling
├── script.js         Small progressive-enhancement behavior
├── assets/           Website-owned assets
└── README.md         Local usage notes
```

## Design Notes

- Keep the website visually aligned with the Fydor app: warm off-white background, white surfaces, stone ink, fine borders, serif headings, restrained accent color, small border radii.
- Keep it practical and download-focused. Avoid turning it into a generic SaaS landing page.
- Do not add a framework unless explicitly requested.
- Do not add build tooling unless explicitly requested.

## Validation

Open `index.html` directly in a browser. If a local server is needed, use:

```sh
python3 -m http.server 8080
```

