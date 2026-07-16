"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("install help offers both unsigned-platform flows", () => {
  const page = readFileSync(join(__dirname, "..", "app", "(public)", "install", "page.tsx"), "utf8");
  const guide = readFileSync(join(__dirname, "..", "components", "install-guide.tsx"), "utf8");
  assert.match(page, /InstallGuide/);
  assert.match(guide, /xattr -cr \/Applications\/Fydor\.app/);
  assert.match(guide, /More info/);
  assert.match(guide, /Run anyway/);
  assert.match(guide, /requestedPlatform\(\).*detectedPlatform/s);
});

test("website downloads redirect to the canonical GitHub Release assets", () => {
  const config = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8"));
  const destinations = config.redirects.map((redirect) => redirect.destination);
  assert.ok(destinations.includes("https://github.com/bun781/Triolinga/releases/latest/download/fydor-mac.dmg"));
  assert.ok(destinations.includes("https://github.com/bun781/Triolinga/releases/latest/download/fydor-windows.exe"));
});
