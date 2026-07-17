"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("contributor applications are reviewed before access and probation is database enforced", () => {
  const migration = read("migrations", "011_contributor_applications.sql");
  assert.match(migration, /create table if not exists public\.contributor_applications/i);
  assert.match(migration, /review_contributor_application/i);
  assert.match(migration, /contributor_probation_until=now\(\)\+interval '30 days'/i);
  assert.match(migration, /probation pack size limit is 1 MB/i);
  assert.match(migration, /probation submission limit reached/i);
  assert.match(migration, /contributor_submission_days/i);
});

test("the contributor and admin workspaces guide each side through applications", () => {
  const contributor = read("components", "contribute-workspace.tsx");
  const application = read("components", "contributor", "contributor-application.tsx");
  const admin = read("components", "admin-workspace.tsx");
  assert.match(contributor, /apply_for_contributor/);
  assert.match(application, /Step 1 of 3/);
  assert.match(application, /New contributor guide/);
  assert.match(admin, /Approve with probation/);
});
