"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = (...parts) => readFileSync(join(root, ...parts), "utf8");
const api = source("legacy-api", "contributor.js");
const migration = source("migrations", "008_revision_aware_sentence_review.sql");

test("draft mutations are scoped to the authenticated owner", () => {
  for (const action of ["save_draft", "duplicate_draft", "delete_draft", "review_sentence"]) assert.match(api, new RegExp(`action === \\"${action}\\"`));
  assert.match(api, /owner_id=eq\.\$\{actor\.id\}/);
  assert.match(api, /source_draft_id=eq\.\$\{id\}&creator_id=eq\.\$\{actor\.id\}/);
});

test("database submission eligibility uses current-revision approvals", () => {
  assert.match(migration, /status='approved'/);
  assert.match(migration, /draft_revision=d\.revision/);
  assert.match(migration, /every current sentence revision must be approved/);
  assert.match(migration, /insert into submission_versions/);
});

test("contributor UI exposes creation, editing, review, preview, and status screens", () => {
  const workspace = source("components", "contribute-workspace.tsx");
  for (const component of ["ContributorDashboard", "PackEditor", "SentenceReview", "PackPreview", "SubmissionStatus"]) assert.match(workspace, new RegExp(component));
  const review = source("components", "contributor", "sentence-review.tsx");
  for (const action of ["Approve", "Needs changes", "Edit sentence", "Skip temporarily", "Return to unresolved"]) assert.match(review, new RegExp(action));
});
