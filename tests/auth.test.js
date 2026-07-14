"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { accessToken } = require("../lib/auth");

test("protected APIs only accept a Supabase bearer token", () => {
  assert.equal(accessToken({ headers: { authorization: "Bearer access.token" } }), "access.token");
  assert.equal(accessToken({ headers: { authorization: "bearer  access.token " } }), "access.token");
  assert.equal(accessToken({ headers: { authorization: "Basic credentials" } }), null);
  assert.equal(accessToken({ headers: {} }), null);
});

test("contributor auth has no credential-bearing GET fallback or cookie proxy", () => {
  const form = readFileSync(join(__dirname, "..", "contribute.html"), "utf8");
  const client = readFileSync(join(__dirname, "..", "app-client.js"), "utf8");
  const build = readFileSync(join(__dirname, "..", "scripts", "build-static.js"), "utf8");
  assert.match(form, /<form class="entry-auth-form" data-auth-form method="post">/);
  assert.match(client, /createClient\(/);
  assert.doesNotMatch(client, /\/api\/auth/);
  assert.match(build, /"pack-preview\.js"/);
});
