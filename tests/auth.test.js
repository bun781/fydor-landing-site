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

test("Next.js auth pages use the canonical Supabase browser client", () => {
  const form = readFileSync(join(__dirname, "..", "app", "(auth)", "AuthForm.tsx"), "utf8");
  const client = readFileSync(join(__dirname, "..", "lib", "supabase", "browser.ts"), "utf8");
  assert.match(form, /createClient/);
  assert.match(form, /Account services are unavailable/);
  assert.match(form, /finally/);
  assert.match(client, /createBrowserClient/);
  assert.doesNotMatch(form, /\/api\/auth/);
});

test("administration is a server-gated App Router page", () => {
  const admin = readFileSync(join(__dirname, "..", "app", "admin", "page.tsx"), "utf8");
  assert.match(admin, /await requireAdmin\(\)/);
  assert.match(admin, /AdminWorkspace/);
});

test("legacy compatibility handlers delegate token verification to Supabase Auth", () => {
  const auth = readFileSync(join(__dirname, "..", "lib", "auth.js"), "utf8");
  assert.match(auth, /auth\/v1\/user/);
  assert.doesNotMatch(auth, /jwtVerify|createRemoteJWKSet|decodeProtectedHeader/);
});
