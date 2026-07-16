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
  assert.match(form, /data\.session/);
  assert.match(form, /setMessage\(error\.message\)/);
  assert.match(form, /finally/);
  assert.match(form, /noValidate/);
  assert.match(form, /onSubmit=\{handleSubmit\}/);
  assert.match(form, /type="submit"/);
  assert.match(form, /mode === "login" \? undefined : 8/);
  assert.match(form, /Use at least 8 characters for your new password/);
  assert.match(form, /auth\.signInWithPassword/);
  assert.match(form, /auth\.signUp/);
  assert.match(form, /auth\.getSession/);
  assert.match(form, /\[AUTH-UI\] submit clicked/);
  assert.match(form, /\[AUTH-SUPABASE\] call starting/);
  assert.match(form, /\[AUTH-SESSION\] session established/);
  assert.match(form, /window\.location\.assign\("\/contribute"\)/);
  assert.doesNotMatch(form, /router\.refresh/);
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

test("Auth users are mirrored into public profiles without credential data", () => {
  const migration = readFileSync(join(__dirname, "..", "migrations", "006_auth_profile_sync.sql"), "utf8");
  assert.match(migration, /after insert or update[\s\S]+on auth\.users/i);
  assert.match(migration, /insert into public\.profiles/i);
  assert.match(migration, /from auth\.users as users/i);
  assert.match(migration, /insert into public\.user_roles/i);
  assert.doesNotMatch(migration, /encrypted_password|confirmation_token|recovery_token/i);
});
