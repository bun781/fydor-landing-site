"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

test("every retained legacy API handler is exposed through the App Router bridge", () => {
  const handlers = readFileSync(join(__dirname, "..", "app", "api", "[endpoint]", "route.ts"), "utf8");
  const legacyHandlers = readdirSync(join(__dirname, "..", "legacy-api"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => file.slice(0, -3));

  for (const endpoint of legacyHandlers) {
    assert.match(handlers, new RegExp(`(?:${endpoint}|"${endpoint}"):\\s*require\\(`));
  }
});
