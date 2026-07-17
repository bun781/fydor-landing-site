"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const migration = readFileSync(join(__dirname, "..", "migrations", "001_contributor_pipeline.sql"), "utf8");
const packMigration = readFileSync(join(__dirname, "..", "migrations", "003_pack_contribution_workflow.sql"), "utf8");

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

test("pack contributions have one globally unique active hash registry and publication hash", () => {
  assert.match(packMigration, /create table if not exists public\.contribution_content_hashes[\s\S]*content_hash text primary key/i);
  assert.match(packMigration, /published_lessons_content_hash_unique[\s\S]*where content_hash is not null/i);
  assert.match(packMigration, /duplicate_pack/);
  assert.match(packMigration, /sync_contribution_hash_state/);
});

test("legacy archive remains available while permanent deletion is server-side, authorized, and storage-first", () => {
  const admin = readFileSync(join(__dirname, "..", "legacy-api", "admin.js"), "utf8");
  assert.match(admin, /body\.action === "delete_pack"/);
  assert.match(admin, /p_next: "archived"/);
  assert.match(admin, /body\.action === "hard_delete_pack"/);
  assert.match(admin, /await deletePackObject\(path\)/);
  assert.match(admin, /rpc\("hard_delete_submission"/);
  assert.match(admin, /actionIdValue/);
});

test("permanent deletion is an admin-only, idempotent transactional database operation", () => {
  const hardDelete = readFileSync(join(__dirname, "..", "migrations", "011_permanent_pack_deletion.sql"), "utf8");
  assert.match(hardDelete, /not public\.is_service_role\(\)/);
  assert.match(hardDelete, /'admin'=any\(roles_now\).*'super_admin'=any\(roles_now\)/s);
  assert.match(hardDelete, /audit_events where action_id=p_action_id/);
  for (const table of ["published_lessons", "reviewer_feedback", "moderation_assignments", "contribution_content_hashes", "submission_versions", "submissions"]) {
    assert.match(hardDelete, new RegExp(`delete from ${table}`, "i"));
  }
  assert.match(hardDelete, /submission_permanently_deleted/);
  assert.match(hardDelete, /revoke execute on function public\.hard_delete_submission/);
});

function functionBlock(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\b([\\s\\S]*?)end \\$\\$;`, "i"));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}
