"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJsonBody, sanitizeJsonValue, setCors } = require("../lib/http");

function request(origin) {
  return { headers: { origin } };
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; }
  };
}

test("authenticated API CORS only allows the website origin", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://fydor.vercel.app";

  try {
    const result = response();
    setCors(request("https://fydor.vercel.app"), result);
    assert.equal(result.headers["Access-Control-Allow-Origin"], "https://fydor.vercel.app");
    assert.equal(result.headers["Access-Control-Allow-Headers"], "Authorization, Content-Type, Idempotency-Key");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test("same-origin checks reject cross-site mutations", () => {
  const { requireSameOrigin } = require("../lib/http");
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://fydor.vercel.app";
  try {
    assert.throws(() => requireSameOrigin({ headers: { origin: "https://evil.example" } }), /Cross-origin/);
    assert.throws(() => requireSameOrigin({ headers: {} }), /Cross-origin/);
    assert.doesNotThrow(() => requireSameOrigin({ headers: { origin: "https://fydor.vercel.app" } }));
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
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
