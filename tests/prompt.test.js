"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLessonPrompt, PROMPT_TEMPLATE_VERSION } = require("../lib/prompt-template");

test("combines the versioned Fydor template with user requirements", () => {
  const result=buildLessonPrompt({targetLanguage:"vi",baseLanguage:"en",topic:"coffee",ideas:"ordering politely",sentenceCount:8,schemaVersion:1});
  assert.equal(result.templateVersion,PROMPT_TEMPLATE_VERSION);assert.match(result.prompt,/topic: coffee/);assert.match(result.prompt,/ideas: ordering politely/);assert.match(result.prompt,/Generate 8 sentences/);assert.match(result.prompt,/Return exactly one strict JSON object/);
  assert.match(result.prompt,/not a bare lesson and not an array/);assert.match(result.prompt,/writing a pack by hand or importing an existing \.fydorpack/);
});

test("redacts key-like secrets from copied prompts", () => {
  const result=buildLessonPrompt({ideas:"api_key=supersecretvalue and sk-abcdefghijklmnop"});
  assert.doesNotMatch(result.prompt,/supersecretvalue|sk-abcdefghijklmnop/);assert.match(result.prompt,/\[redacted\]/);
});
