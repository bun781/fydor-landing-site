"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isTrustedDesktopOrigin, readJsonBody, sanitizeJsonValue, setCors } = require("../lib/http");

function request(origin) {
  return { headers: { origin } };
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; }
  };
}

test("trusted desktop origins remain recognized for non-cookie integrations", () => {
  assert.equal(isTrustedDesktopOrigin("http://127.0.0.1:3001"), true);
  assert.equal(isTrustedDesktopOrigin("http://localhost:5173"), true);
  assert.equal(isTrustedDesktopOrigin("http://tauri.localhost"), true);
  assert.equal(isTrustedDesktopOrigin("tauri://localhost"), true);
  assert.equal(isTrustedDesktopOrigin("https://example.com"), false);
});

test("authenticated API CORS only allows the website origin", () => {
  const previous = process.env.FYDOR_WEB_ORIGIN;
  process.env.FYDOR_WEB_ORIGIN = "https://fydor.vercel.app";

  try {
    const result = response();
    setCors(request("https://fydor.vercel.app"), result);
    assert.equal(result.headers["Access-Control-Allow-Origin"], "https://fydor.vercel.app");
    assert.equal(result.headers["Access-Control-Allow-Credentials"], "true");
    assert.equal(result.headers["Access-Control-Allow-Headers"], "Content-Type, Idempotency-Key");
  } finally {
    if (previous === undefined) delete process.env.FYDOR_WEB_ORIGIN;
    else process.env.FYDOR_WEB_ORIGIN = previous;
  }
});

test("same-origin checks reject cross-site mutations", () => {
  const { requireSameOrigin } = require("../lib/http");
  const previous = process.env.FYDOR_WEB_ORIGIN;
  process.env.FYDOR_WEB_ORIGIN = "https://fydor.vercel.app";
  try {
    assert.throws(() => requireSameOrigin({ headers: { origin: "https://evil.example" } }), /Cross-origin/);
    assert.doesNotThrow(() => requireSameOrigin({ headers: { origin: "https://fydor.vercel.app" } }));
  } finally {
    if (previous === undefined) delete process.env.FYDOR_WEB_ORIGIN;
    else process.env.FYDOR_WEB_ORIGIN = previous;
  }
});

test("JSON request bodies are quarantined before route handlers see them", async () => {
  const requestBody = JSON.parse('{"action":"save_draft","pack":{"title":"Safe"},"__proto__":{"polluted":true}}');
  await assert.rejects(
    () => readJsonBody({ headers: {}, body: requestBody }),
    /Dangerous JSON key: __proto__/
  );
  assert.equal({}.polluted, undefined);

  const clean = await readJsonBody({ headers: {}, body: { action: "save_draft", pack: { title: "Safe" } } });
  assert.equal(Object.getPrototypeOf(clean), null);
  assert.equal(Object.getPrototypeOf(clean.pack), null);
  assert.equal(clean.action, "save_draft");
});

test("JSON sanitizer rejects non-JSON values and nested backdoor keys", () => {
  assert.throws(() => sanitizeJsonValue({ pack: { constructor: { prototype: { admin: true } } } }), /Dangerous JSON key: constructor/);
  assert.throws(() => sanitizeJsonValue({ now: new Date() }), /JSON values only/);
});
