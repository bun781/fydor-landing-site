"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { clearSessionCookies, parseCookies, setSessionCookies } = require("../lib/auth");

function response() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
}

test("session cookies are HttpOnly, strict, and secure outside localhost", () => {
  const result = response();
  setSessionCookies(result, { access_token: "access.token", refresh_token: "refresh/token" }, { headers: { host: "fydor.vercel.app" } });
  assert.equal(result.headers["Set-Cookie"].length, 2);
  for (const cookie of result.headers["Set-Cookie"]) {
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Secure/);
  }
  assert.equal(parseCookies("fydor_session=access.token; fydor_refresh=refresh%2Ftoken").fydor_refresh, "refresh/token");
});

test("signing out expires both session cookies", () => {
  const result = response();
  clearSessionCookies(result, { headers: { host: "fydor.vercel.app" } });
  assert.equal(result.headers["Set-Cookie"].length, 2);
  assert.ok(result.headers["Set-Cookie"].every((cookie) => cookie.includes("Max-Age=0")));
});

test("contributor auth cannot fall back to a credential-bearing GET", () => {
  const form = readFileSync(join(__dirname, "..", "contribute.html"), "utf8");
  const build = readFileSync(join(__dirname, "..", "scripts", "build-static.js"), "utf8");
  assert.match(form, /<form class="entry-auth-form" data-auth-form method="post">/);
  assert.match(build, /"pack-preview\.js"/);
});
