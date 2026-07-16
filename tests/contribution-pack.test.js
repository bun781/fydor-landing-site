"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { computePackContentHash, detectNearDuplicates, parseAndValidateDraftPack, parseAndValidatePack } = require("../lib/pack-schema");

function pack(overrides = {}) {
  return {
    type: "fydor_pack", schemaVersion: 1, id: "first-id", title: "First title", version: "1.0.0",
    language: "ko", baseLanguage: "en", description: "Description", tags: ["daily"],
    createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z",
    lessons: [{ language: "ko", baseLanguage: "en", title: "Lesson", sentences: [
      { text: "안녕하세요.", translation: "Hello.", words: [{ surface: "안녕하세요", meaning: "hello" }] },
      { text: "감사합니다.", translation: "Thank you.", grammar: [{ pattern: "합니다", surface: "합니다", meaning: "formal" }] }
    ] }], ...overrides
  };
}

test("validates pack errors with paths and rejects oversized content", () => {
  assert.throws(() => parseAndValidatePack(JSON.stringify({ ...pack(), lessons: [] })), /lessons/);
  assert.throws(() => parseAndValidatePack(JSON.stringify({ ...pack(), lessons: [{ ...pack().lessons[0], sentences: [{ text: "Hello" }] }] })), /translation/);
  assert.throws(() => parseAndValidatePack(JSON.stringify({ ...pack(), description: "x".repeat(5_000_001) })), /5 MB|too large/);
});

test("accepts legacy packs with repeated annotation surfaces", () => {
  const source = pack({ lessons: [{ language: "ko", baseLanguage: "en", title: "Lesson", sentences: [
    { text: "저는 학생입니다.", translation: "I am a student.", grammar: [
      { pattern: "은/는", surface: "는", meaning: "topic marker" },
      { pattern: "N입니다", surface: "학생입니다", meaning: "formal copula" },
      { pattern: "입니다", surface: "학생입니다", meaning: "polite statement ending" }
    ] }
  ] }] });

  const result = parseAndValidatePack(JSON.stringify(source));

  assert.equal(result.pack.lessons[0].sentences[0].grammar.length, 3);
});

test("flags exact duplicate annotations before submission", () => {
  const source = pack({ lessons: [{ language: "ko", baseLanguage: "en", title: "Lesson", sentences: [
    { text: "안녕하세요.", translation: "Hello.", words: [
      { surface: "안녕하세요", meaning: "hello" },
      { surface: "안녕하세요", meaning: "hello" }
    ] }
  ] }] });

  assert.throws(() => parseAndValidatePack(JSON.stringify(source)), /duplicates another annotation/);
});

test("allows incomplete but structurally safe contributor drafts", () => {
  const source = pack({ title: "", lessons: [{ language: "ko", baseLanguage: "en", title: "", sentences: [{ text: "", translation: "", words: [{ surface: "", meaning: "" }] }] }] });
  const result = parseAndValidateDraftPack(source);
  assert.equal(result.pack.title, "");
  assert.throws(() => parseAndValidatePack(source), /cannot be empty|is required/);
});

test("canonical content hash ignores metadata and object key order but preserves sentence order and text", () => {
  const original = pack();
  const reordered = JSON.parse(JSON.stringify(original, (key, value) => key === "lessons" ? value : value));
  reordered.lessons[0].sentences[0] = { translation: "Hello.", words: [{ meaning: "hello", surface: "안녕하세요" }], text: "안녕하세요." };
  reordered.id = "other-id"; reordered.title = "A different title"; reordered.description = "Other description"; reordered.updatedAt = "2027-01-01T00:00:00.000Z";
  assert.equal(computePackContentHash(original), computePackContentHash(reordered));
  const reversed = pack({ lessons: [{ ...original.lessons[0], sentences: [...original.lessons[0].sentences].reverse() }] });
  assert.notEqual(computePackContentHash(original), computePackContentHash(reversed));
  const changed = pack({ lessons: [{ ...original.lessons[0], sentences: [{ ...original.lessons[0].sentences[0], text: "안녕히 가세요." }] }] });
  assert.notEqual(computePackContentHash(original), computePackContentHash(changed));
});

test("flags small-pack near duplicates only for matching languages", () => {
  const source = pack({ title: "Greetings" });
  const same = detectNearDuplicates(source, [{ id: "existing", pack: pack({ title: "Greeting basics" }) }]);
  assert.equal(same.possibleDuplicate, true);
  assert.equal(same.highestOverlap, 1);
  const differentLanguage = detectNearDuplicates(source, [{ id: "different", pack: pack({ language: "vi" }) }]);
  assert.equal(differentLanguage.possibleDuplicate, false);
});
