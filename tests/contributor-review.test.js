"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { partitionReviewIndexes, submissionEligibility } = require("../lib/contributor-review");

function pack(sentences = [{ text: "안녕", translation: "Hello" }, { text: "감사합니다", translation: "Thank you" }]) {
  return { language: "ko", baseLanguage: "en", lessons: [{ title: "Basics", level: "A1", sentences }] };
}

test("editing an approved sentence resets only its review", () => {
  const next = pack([{ text: "안녕하세요", translation: "Hello" }, { text: "감사합니다", translation: "Thank you" }]);
  assert.deepEqual(partitionReviewIndexes(pack(), next, [{ sentence_index: 0 }, { sentence_index: 1 }]), { preserved: [1], reset: [0] });
});

test("reordering sentences resets review at changed positions", () => {
  const source = pack();
  const next = pack([...source.lessons[0].sentences].reverse());
  assert.deepEqual(partitionReviewIndexes(source, next, [{ sentence_index: 0 }, { sentence_index: 1 }]), { preserved: [], reset: [0, 1] });
});

test("submission requires approved rows for the latest revision and no validation errors", () => {
  const rows = [{ sentence_index: 0, status: "approved", draft_revision: 4 }, { sentence_index: 1, status: "approved", draft_revision: 3 }];
  assert.deepEqual(submissionEligibility(pack(), rows, 4), { total: 2, approved: 1, unresolved: 1, validationErrors: 0, ready: false });
  rows[1].draft_revision = 4;
  assert.equal(submissionEligibility(pack(), rows, 4).ready, true);
  assert.equal(submissionEligibility(pack(), rows, 4, [{ path: "title" }]).ready, false);
});
