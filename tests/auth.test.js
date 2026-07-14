"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
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
