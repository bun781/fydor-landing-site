"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const migration = readFileSync(join(__dirname, "..", "migrations", "001_contributor_pipeline.sql"), "utf8");

test("privileged mutation functions require the service role and database roles", () => {
  for (const fn of ["submit_draft", "claim_submission", "transition_submission", "set_moderator", "set_administrator"]) {
    const block = functionBlock(fn);
    assert.match(block, /service role required/);
  }
  assert.match(functionBlock("set_moderator"), /has_role\(p_actor,'admin'\).*has_role\(p_actor,'super_admin'\)/s);
  assert.match(functionBlock("set_administrator"), /has_role\(p_actor,'super_admin'\)/);
  assert.match(functionBlock("set_moderator"), /p_actor=p_target/);
});

test("moderator language, stale version, claim concurrency, and immutable publication are database enforced", () => {
  assert.match(functionBlock("claim_submission"), /moderator_language_assignments/);
  assert.match(functionBlock("transition_submission"), /current_version<>p_expected_version.*row_version<>p_expected_row_version/s);
  assert.match(migration, /create unique index[^;]+moderation_one_active_idx[^;]+where state = 'active'/i);
  assert.match(migration, /foreign key \(submission_id, published_version\) references public\.submission_versions/);
});

test("moderator removal preserves history while releasing access", () => {
  const block = functionBlock("set_moderator");
  assert.match(block, /suspended_at=now\(\)/);
  assert.match(block, /moderation_assignments set state='released'/);
  assert.doesNotMatch(block, /delete from reviewer_feedback/);
});

function functionBlock(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\b([\\s\\S]*?)end \\$\\$;`, "i"));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}
