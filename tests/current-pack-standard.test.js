"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { parseAndValidatePack } = require("../lib/pack-schema");

const files = [
  "german-beginner-v1.fydorpack",
  "korean-beginner-v1.fydorpack",
  "spanish-beginner-v1.fydorpack",
  "humongous-mandarin-v1.fydorpack",
  "humongous-vietnamese-v1.fydorpack"
];

test("all bundled packs satisfy the public publishing schema", () => {
  for (const file of files) {
    const result = parseAndValidatePack(readFileSync(join(__dirname, "..", "..", "packs", file), "utf8"));
    assert.equal(result.pack.version, "2.0.0", file);
    assert.equal(result.pack.unitManifest.units.length, result.pack.lessons.length, file);
    assert.ok(result.pack.grammarGuide.rules.length, file);
  }
});
