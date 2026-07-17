"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("the Mandarin publishing pack passes contributor review validation", async () => {
  const { parsePackClient, validatePackClient } = await import("../lib/contributor-pack.ts");
  const result = parsePackClient(readFileSync(join(__dirname, "..", "..", "packs", "humongous-mandarin-v1.fydorpack"), "utf8"));

  assert.ok("pack" in result);
  assert.deepEqual(validatePackClient(result.pack), []);
});

test("grammar annotations require a pattern but only validate surface when supplied", async () => {
  const { createBlankPack, validatePackClient } = await import("../lib/contributor-pack.ts");
  const pack = createBlankPack();
  pack.title = "Grammar validation";
  pack.lessons[0].title = "Grammar";
  pack.lessons[0].sentences[0] = {
    text: "你好。",
    translation: "Hello.",
    grammar: [{ pattern: "Greeting without a literal surface" }]
  };

  assert.deepEqual(validatePackClient(pack), []);

  pack.lessons[0].sentences[0].grammar = [{ surface: "再见" }];
  assert.deepEqual(
    validatePackClient(pack).map(({ message }) => message),
    ["Annotation text is required.", "Annotation text must occur in the sentence."]
  );
});
