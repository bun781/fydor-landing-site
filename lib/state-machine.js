"use strict";

const TRANSITIONS = Object.freeze({
  draft: ["reviewing"],
  reviewing: ["submitted"],
  submitted: ["changes_requested", "language_approved", "approved", "rejected", "withdrawn", "archived"],
  changes_requested: ["reviewing", "withdrawn"],
  language_approved: ["approved", "changes_requested", "rejected"],
  approved: ["published", "changes_requested", "archived"],
  published: ["approved", "archived"],
  rejected: ["archived"],
  withdrawn: ["reviewing"],
  archived: ["restore"]
});

const ROLE_ACTIONS = Object.freeze({
  start_review: ["contributor", "admin", "super_admin"],
  submit: ["contributor"],
  withdraw: ["contributor"],
  request_changes: ["moderator", "admin", "super_admin"],
  language_approve: ["moderator"],
  reject: ["moderator", "admin", "super_admin"],
  approve: ["admin", "super_admin"],
  publish: ["admin", "super_admin"],
  unpublish: ["admin", "super_admin"],
  archive: ["admin", "super_admin"],
  restore: ["admin", "super_admin"]
});

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) throw new Error(`Invalid submission transition: ${from} -> ${to}.`);
}

function assertRoleForAction(roles, action) {
  const allowed = ROLE_ACTIONS[action];
  if (!allowed || !roles.some((role) => allowed.includes(role))) throw new Error("You do not have permission for this action.");
}

module.exports = { ROLE_ACTIONS, TRANSITIONS, assertRoleForAction, assertTransition, canTransition };
