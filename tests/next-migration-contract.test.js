"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = (...parts) => readFileSync(join(root, ...parts), "utf8");

test("website workspaces are Next.js components rather than static HTML", () => {
  const files = ["contribute", "library", "moderate"];
  for (const route of files) assert.match(source("app", "(public)", route, "page.tsx"), /SiteNav/);
  assert.doesNotMatch(source("vercel.json"), /https:\/\/esm\.sh/);
});

test("legacy redirects do not override App Router workspaces and admin route keeps a server gate", () => {
  const config = source("next.config.ts");
  const library = source("app", "(public)", "library", "page.tsx");
  const admin = source("app", "admin", "page.tsx");

  assert.doesNotMatch(config, /\.html/);
  assert.match(library, /LibraryBrowser/);
  assert.match(admin, /await requireAdmin\(\)/);
  assert.match(admin, /AdminWorkspace/);
});
