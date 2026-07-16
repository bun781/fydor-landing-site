"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("the production CSP nonces Next.js hydration scripts", () => {
  const proxy = readFileSync(join(__dirname, "..", "proxy.ts"), "utf8");
  const layout = readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8");
  const vercel = readFileSync(join(__dirname, "..", "vercel.json"), "utf8");
  assert.match(proxy, /crypto\.randomUUID\(\)/);
  assert.match(proxy, /'nonce-\$\{nonce\}'/);
  assert.match(proxy, /'strict-dynamic'/);
  assert.match(proxy, /requestHeaders\.set\("Content-Security-Policy"/);
  assert.match(proxy, /response\.headers\.set\("Content-Security-Policy"/);
  assert.match(layout, /await connection\(\)/);
  assert.doesNotMatch(vercel, /Content-Security-Policy/);
  assert.doesNotMatch(proxy, /script-src[^;]*'unsafe-inline'/);
});
