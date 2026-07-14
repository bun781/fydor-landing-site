"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAndValidatePack, slugifyPackTitle } = require("../lib/pack-schema");
const { storageObjectUrl, storagePublicUrl } = require("../lib/storage");

const samplePack = {
  type: "fydor_pack",
  schemaVersion: 1,
  id: "starter-pack",
  title: "Starter Pack",
  version: "1.0.0",
  language: "ko",
  baseLanguage: "en",
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  lessons: [{
    language: "ko",
    baseLanguage: "en",
    title: "Greetings",
    sentences: [{
      text: "annyeonghaseyo",
      translation: "Hello",
      words: [{ surface: "annyeonghaseyo", meaning: "hello" }]
    }]
  }]
};

test("validates and canonicalizes Fydor packs before upload", () => {
  const result = parseAndValidatePack(JSON.stringify(samplePack));
  assert.equal(result.pack.title, "Starter Pack");
  assert.equal(result.pack.lessons.length, 1);
  assert.equal(result.sentenceCount, 1);
  assert.match(result.checksum, /^[0-9a-f]{64}$/);
});

test("rejects malformed or unsafe packs", () => {
  assert.throws(() => parseAndValidatePack("{}"), /Pack type/);
  assert.throws(
    () => parseAndValidatePack('{"type":"fydor_pack","type":"fydor_pack"}'),
    /Duplicate JSON key: type/
  );
  assert.throws(
    () => parseAndValidatePack(JSON.stringify(samplePack).replace('"sentences"', '"__proto__":{"admin":true},"sentences"')),
    /Dangerous JSON key: __proto__/
  );
  assert.throws(
    () => parseAndValidatePack(JSON.stringify({ ...samplePack, lessons: [{ ...samplePack.lessons[0], title: "<script>x</script>" }] })),
    /unsafe HTML/
  );
});

test("builds Supabase storage object and public URLs for nested paths", () => {
  assert.equal(slugifyPackTitle("Starter Pack!"), "starter-pack");
  assert.equal(
    storageObjectUrl("https://project.supabase.co", "packs", "ko/en/starter-pack.fydorpack"),
    "https://project.supabase.co/storage/v1/object/packs/ko/en/starter-pack.fydorpack"
  );
  assert.equal(
    storagePublicUrl("https://project.supabase.co", "packs", "ko/en/starter pack.fydorpack"),
    "https://project.supabase.co/storage/v1/object/public/packs/ko/en/starter%20pack.fydorpack"
  );
});
