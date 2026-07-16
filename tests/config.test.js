"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertServerConfig, configuredWebOrigin, normalizeWebOrigin, providerUrl, webUrl } = require("../lib/config");

test("normalizes safe production and preview origins", () => {
  assert.equal(normalizeWebOrigin("https://fydor.example///"), "https://fydor.example");
  assert.equal(normalizeWebOrigin("https://preview-123.vercel.app/"), "https://preview-123.vercel.app");
});

test("rejects unsafe website origins and paths", () => {
  for (const origin of ["javascript:alert(1)", "http://example.com", "https://user:pass@example.com", "https://example.com?a=1", "https://example.com/path", "//example.com"]) {
    assert.throws(() => normalizeWebOrigin(origin));
  }
  assert.throws(() => webUrl("https://evil.test", { FYDOR_WEB_ORIGIN: "https://fydor.example" }));
});

test("chatbot destinations are centrally allowlisted", () => {
  assert.equal(providerUrl("chatgpt"), "https://chatgpt.com/");
  assert.equal(providerUrl("claude"), "https://claude.ai/");
  assert.throws(() => providerUrl("https://evil.test"));
});

test("accepts both current and legacy Supabase key names", () => {
  const current = assertServerConfig({
    FYDOR_WEB_ORIGIN: "https://fydor.example",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local",
    SUPABASE_SECRET_KEY: "sb_secret_local"
  });
  assert.equal(current.supabasePublishableKey, "sb_publishable_local");
  assert.equal(current.supabaseSecretKey, "sb_secret_local");

  const legacy = assertServerConfig({
    FYDOR_WEB_ORIGIN: "https://fydor.example",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "anon_local",
    SUPABASE_SERVICE_ROLE_KEY: "service_local"
  });
  assert.equal(legacy.supabasePublishableKey, "anon_local");
  assert.equal(legacy.supabaseSecretKey, "service_local");
});

test("accepts the Next.js public Supabase and site variables for compatibility handlers", () => {
  const result = assertServerConfig({
    NEXT_PUBLIC_SITE_URL: "https://fydor.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_local"
  });

  assert.equal(result.origin, "https://fydor.example");
  assert.equal(result.supabase, "https://project.supabase.co");
  assert.equal(result.supabasePublishableKey, "sb_publishable_local");
  assert.equal(result.supabaseSecretKey, "sb_secret_local");
});

test("production auth defaults to the canonical website origin", () => {
  assert.equal(configuredWebOrigin({ VERCEL_ENV: "production" }), "https://fydor.vercel.app");
});
