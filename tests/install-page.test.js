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

test("website serves installers directly from local public assets", () => {
  const config = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8"));
  assert.equal(config.redirects, undefined);
  assert.match(readFileSync(join(__dirname, "..", "components", "download-link.tsx"), "utf8"), /\/install\?platform=/);
});
