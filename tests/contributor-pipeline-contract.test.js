"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = (...parts) => readFileSync(join(root, ...parts), "utf8");
const api = source("legacy-api", "contributor.js");
const migration = source("migrations", "010_local_contributor_drafts.sql");

test("working drafts are local and only final packs are submitted", () => {
  assert.match(api, /action === "submit_pack"/);
  assert.match(api, /Contributor drafts and reviews are stored in this browser/);
  assert.match(migration, /drop table if exists public\.sentence_review_progress/);
  assert.match(migration, /drop table if exists public\.contributor_drafts/);
  const workspace = source("components", "contribute-workspace.tsx");
  assert.match(workspace, /parsePackClient\(text\)/);
  assert.doesNotMatch(workspace, /action: "validate_pack"/);
});

test("database persists an immutable final pack for moderation", () => {
  assert.match(migration, /create or replace function public\.submit_pack/);
  assert.match(migration, /insert into submission_versions/);
});

test("contributor UI exposes creation, editing, review, preview, and status screens", () => {
  const workspace = source("components", "contribute-workspace.tsx");
  for (const component of ["ContributorDashboard", "PackEditor", "SentenceReview", "PackPreview", "SubmissionStatus"]) assert.match(workspace, new RegExp(component));
  const review = source("components", "contributor", "sentence-review.tsx");
  for (const action of ["Approve", "Needs changes", "Mark all as reviewed", "Edit sentence", "Skip temporarily", "Return to unresolved"]) assert.match(review, new RegExp(action));
});
