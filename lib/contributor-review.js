"use strict";

function reviewKeys(pack) {
  return (pack?.lessons || []).flatMap((lesson) => (lesson.sentences || []).map((sentence) => JSON.stringify({
    language: pack.language,
    baseLanguage: pack.baseLanguage,
    lesson: { title: lesson.title, description: lesson.description, source: lesson.source, level: lesson.level, tags: lesson.tags },
    sentence
  })));
}

function partitionReviewIndexes(previousPack, nextPack, rows) {
  const before = reviewKeys(previousPack);
  const after = reviewKeys(nextPack);
  const preserved = [];
  const reset = [];
  for (const row of rows) (before[row.sentence_index] === after[row.sentence_index] ? preserved : reset).push(row.sentence_index);
  return { preserved, reset };
}

function submissionEligibility(pack, rows, draftRevision, validationErrors = []) {
  const total = reviewKeys(pack).length;
  const approved = rows.filter((row) => row.status === "approved" && row.draft_revision === draftRevision).length;
  return { total, approved, unresolved: total - approved, validationErrors: validationErrors.length, ready: total > 0 && approved === total && validationErrors.length === 0 };
}

module.exports = { partitionReviewIndexes, reviewKeys, submissionEligibility };
