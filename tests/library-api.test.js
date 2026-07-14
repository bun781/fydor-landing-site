"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createLibraryHandler, packId } = require("../api/library");
const { rateLimit } = require("../lib/rate-limit");
const { safeServerError } = require("../lib/http");

function request(query = {}) {
  return { method: "GET", query, headers: {}, socket: { remoteAddress: "127.0.0.1" } };
}

function response() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    end() { return this; }
  };
}

function logger() { return { error() {} }; }

test("GET /api/library succeeds for pageSize=50 from the packs bucket", async () => {
  const handler = createLibraryHandler({
    listPackObjects: async () => [packObject()], readPackObject: async () => JSON.stringify(publishedPack()),
    rateLimit: async () => {}, logger: logger()
  });
  const result = response();
  await handler(request({ pageSize: "50" }), result);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.pageSize, 50);
  assert.equal(result.body.packs[0].title, "Greetings");
});

test("missing Storage configuration returns a safe, named configuration error", async () => {
  const handler = createLibraryHandler({
    listPackObjects: async () => { throw safeServerError(500, "configuration_error", "SUPABASE_URL is required."); },
    readPackObject: async () => "",
    rateLimit: async () => {}, logger: logger()
  });
  const result = response();
  await handler(request(), result);
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body.error, { code: "configuration_error", message: "SUPABASE_URL is required." });
});

test("an unavailable optional rate limiter does not disable public reads", async () => {
  await rateLimit("public:test", 1, 60, {
    required: false,
    env: { VERCEL_ENV: "production" },
    fetch: async () => { throw new Error("should not be called without Redis configuration"); }
  });
  const handler = createLibraryHandler({
    listPackObjects: async () => [], readPackObject: async () => "",
    rateLimit: (...args) => rateLimit(...args, { required: false, env: { VERCEL_ENV: "production" } }),
    logger: logger()
  });
  const result = response();
  await handler(request(), result);
  assert.equal(result.statusCode, 200);
});

test("invalid and oversized pageSize values return 400", async () => {
  const handler = createLibraryHandler({ listPackObjects: async () => [], readPackObject: async () => "", rateLimit: async () => {}, logger: logger() });
  for (const pageSize of ["zero", "0", "101"]) {
    const result = response();
    await handler(request({ pageSize }), result);
    assert.equal(result.statusCode, 400, pageSize);
    assert.equal(result.body.error.code, "invalid_query");
  }
});

test("Storage failures are not mislabeled as rate-limit failures", async () => {
  const handler = createLibraryHandler({
    listPackObjects: async () => { throw safeServerError(503, "storage_unavailable", "The public pack library is temporarily unavailable."); },
    readPackObject: async () => "",
    rateLimit: async () => {}, logger: logger()
  });
  const result = response();
  await handler(request(), result);
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.error.code, "storage_unavailable");
});

test("downloads the selected pack directly from Storage", async () => {
  const pack = publishedPack();
  const handler = createLibraryHandler({ listPackObjects: async () => [], readPackObject: async () => JSON.stringify(pack), rateLimit: async () => {}, logger: logger() });
  const result = response();
  await handler(request({ id: packId(packObject().path), download: "1" }), result);
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).title, pack.title);
  assert.match(result.headers["Content-Disposition"], /\.fydorpack/);
});

test("the public library is separate from the contributor workspace", () => {
  const exchange = readFileSync(join(__dirname, "..", "contribute.html"), "utf8");
  const legacy = readFileSync(join(__dirname, "..", "library.html"), "utf8");
  const redirects = readFileSync(join(__dirname, "..", "vercel.json"), "utf8");
  const section = readFileSync(join(__dirname, "..", "library-section.js"), "utf8");
  assert.doesNotMatch(exchange, /data-public-library/);
  assert.doesNotMatch(exchange, /id="library"/);
  assert.doesNotMatch(exchange, /data-admin|data-moderation/);
  assert.match(legacy, /data-public-library/);
  assert.doesNotMatch(redirects, /contribute\.html#library/);
  assert.match(section, /Download verified Fydor pack/);
});

function packObject() {
  return { path: "ko/en/starter-pack/1.0.0/starter-pack.fydorpack", createdAt: "2026-07-10T00:00:00.000Z" };
}

function publishedPack() {
  return {
    type: "fydor_pack", schemaVersion: 1, id: "starter-pack", title: "Greetings", description: "A simple lesson.", version: "1.0.0",
    language: "ko", baseLanguage: "en", level: "beginner", tags: ["greetings"], license: "CC BY 4.0",
    createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z",
    lessons: [{ language: "ko", baseLanguage: "en", title: "Greetings", sentences: [{ text: "annyeonghaseyo", translation: "Hello" }] }]
  };
}
