"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = (...parts) => readFileSync(join(root, ...parts), "utf8");

test("compatibility workspaces share the SSR browser session and CSP permits their module", () => {
  const client = source("public", "app-client.js");
  const vercel = source("vercel.json");

  assert.match(client, /@supabase\/ssr@0\.8\.0/);
  assert.match(client, /createBrowserClient/);
  assert.match(client, /emailRedirectTo: `\$\{location\.origin\}\/auth\/callback\?next=\/contribute`/);
  assert.match(vercel, /https:\/\/esm\.sh/);
});

test("legacy redirects do not override the public library and admin route keeps a server gate", () => {
  const config = source("next.config.ts");
  const library = source("app", "(public)", "library", "page.tsx");
  const admin = source("app", "admin", "page.tsx");

  assert.doesNotMatch(config, /library\.html/);
  assert.match(library, /redirect\("\/library\.html"\)/);
  assert.match(admin, /await requireAdmin\(\)/);
  assert.match(admin, /redirect\("\/admin\.html"\)/);
});
