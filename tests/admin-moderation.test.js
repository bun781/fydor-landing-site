"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const migration = readFileSync(join(__dirname, "..", "migrations", "007_complete_admin_moderation.sql"), "utf8");
const adminApi = readFileSync(join(__dirname, "..", "legacy-api", "admin.js"), "utf8");
const moderationApi = readFileSync(join(__dirname, "..", "legacy-api", "moderation.js"), "utf8");
const contributorApi = readFileSync(join(__dirname, "..", "legacy-api", "contributor.js"), "utf8");

test("bootstraps the protected initial administrator when the verified account appears", () => {
  assert.match(migration, /minhnhannguyen28@gmail\.com/);
  assert.match(migration, /sync_auth_user_profile[\s\S]*new\.email_confirmed_at is not null[\s\S]*super_admin/i);
  assert.match(migration, /protected_administrators[\s\S]*user_id uuid primary key/i);
  assert.match(functionBlock("bootstrap_super_admin"), /bootstrap email is not authorized/);
  assert.match(functionBlock("bootstrap_super_admin"), /service role required/);
});

test("prevents self escalation, protected-admin demotion, and final-admin removal", () => {
  assert.match(functionBlock("set_administrator"), /super administrator role required/);
  assert.match(functionBlock("set_administrator"), /p_actor=p_target/);
  assert.match(functionBlock("set_administrator"), /protected initial administrator cannot be demoted/);
  assert.match(functionBlock("set_administrator"), /cannot remove the last active administrator/);
  assert.match(functionBlock("revoke_super_admin"), /protected initial administrator requires break-glass database recovery/);
  assert.match(functionBlock("revoke_super_admin"), /cannot remove the last active administrator/);
});

test("role and publishing access mutations are server-authorized and audited", () => {
  for (const name of ["set_contributor", "set_publishing_suspension"]) {
    assert.match(functionBlock(name), /service role required/);
    assert.match(functionBlock(name), /has_role\(p_actor,'admin'\).*has_role\(p_actor,'super_admin'\)/s);
    assert.match(functionBlock(name), /permission_events/);
  }
  assert.match(adminApi, /requireRole\(actor, \["admin", "super_admin"\]\)/);
  assert.match(adminApi, /body\.action === "set_contributor"/);
  assert.match(adminApi, /body\.action === "suspend_publishing"/);
  assert.match(functionBlock("enforce_publishing_access"), /publishing access is suspended/);
});

test("moderation transitions preserve revision identity, feedback, publication, and audit", () => {
  const block = functionBlock("transition_submission");
  assert.match(block, /current_version<>p_expected_version.*row_version<>p_expected_row_version/s);
  assert.match(block, /immutable submission version not found/);
  assert.match(block, /next_state in \('changes_requested','rejected'\)[\s\S]*reviewer_feedback/s);
  assert.match(block, /previous_state='published'.*next_state in \('approved','archived'\)/s);
  assert.match(block, /p_next='restore'/);
  assert.match(block, /audit_events/);
  assert.match(block, /submission_version/);
  assert.match(migration, /audit_events_immutable before update or delete/);
});

test("flags have typed targets and internal feedback is hidden from contributors", () => {
  assert.match(migration, /target_type in \('pack','metadata','lesson','sentence','annotation'\)/);
  assert.match(migration, /visibility in \('contributor','internal'\)/);
  assert.match(moderationApi, /target_type: targetType/);
  assert.match(contributorApi, /visibility=eq\.contributor/);
});

test("admin pages and API expose the complete protected moderation surface", () => {
  const layout = readFileSync(join(__dirname, "..", "app", "admin", "layout.tsx"), "utf8");
  const workspace = readFileSync(join(__dirname, "..", "components", "admin-submission-review.tsx"), "utf8");
  assert.match(layout, /await requireAdmin\(\)/);
  for (const action of ["Approve", "Request changes", "Reject", "Publish", "Unpublish", "Archive", "Restore"]) assert.match(workspace, new RegExp(action));
  assert.match(moderationApi, /requireRole\(actor, \["moderator", "admin", "super_admin"\]\)/);
  assert.match(moderationApi, /validation_warnings/);
  assert.match(moderationApi, /moderation_history_count/);
});

function functionBlock(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\b([\\s\\S]*?)end \\$\\$;`, "i"));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}
