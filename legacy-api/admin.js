"use strict";

const { authenticate, requireRole } = require("../lib/auth");
const { db, rpc } = require("../lib/db");
const { handleOptions, httpError, readJsonBody, requireMethod, requireSameOrigin, send, sendError, setCors } = require("../lib/http");
const { rateLimit } = require("../lib/rate-limit");
const { parseAndValidatePack, slugifyPackTitle } = require("../lib/pack-schema");
const { deletePackObject } = require("../lib/storage");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response, { methods: "GET, POST, OPTIONS" })) return;
  setCors(request, response); response.setHeader("Cache-Control", "no-store");
  try {
    requireMethod(request, ["GET", "POST"]);
    if (request.method === "POST") requireSameOrigin(request);
    const actor = await authenticate(request, response); requireRole(actor, ["admin", "super_admin"]);
    await rateLimit(`${actor.id}:admin`, 60);
    if (request.method === "GET") {
      const action = String(request.query?.action || "moderators");
      if (action === "me") return send(response, 200, { roles: actor.roles });
      if (action === "users") {
        const query = String(request.query?.q || "").normalize("NFC").trim().slice(0, 120).replace(/[,*()]/g, "");
        const filter = query ? `&or=(email.ilike.*${encodeURIComponent(query)}*,display_name.ilike.*${encodeURIComponent(query)}*)` : "";
        const rows = await db(`profiles?select=id,email,display_name,active,verified_at,created_at,user_roles(version,suspended_at,expires_at,roles(name))${filter}&order=created_at.desc&limit=100`);
        return send(response, 200, { users: rows });
      }
      if (action === "moderators") {
        const rows = await db("moderator_language_assignments?select=*,profiles!moderator_language_assignments_moderator_id_fkey(email,display_name),moderation_assignments(id,state)&order=assigned_at.desc");
        return send(response, 200, { moderators: rows });
      }
      if (action === "packs") {
        const rows = await db("published_lessons?select=id,submission_id,published_version,title,target_language,base_language,level,published_at,updated_at,archived_at,submissions(state,current_version,row_version)&order=published_at.desc&limit=200");
        return send(response, 200, { packs: rows });
      }
      if (action === "permissions") {
        requireRole(actor, ["super_admin"]);
        const rows = await db("permission_events?select=*&order=created_at.desc&limit=200");
        return send(response, 200, { events: rows });
      }
      throw httpError(400, "invalid_action", "Unsupported administration query.");
    }
    const body = await readJsonBody(request, 100_000);
    if (body.action === "set_moderator") {
      const result = await rpc("set_moderator", {
        p_actor: actor.id, p_target: uuid(body.userId),
        p_languages: Array.isArray(body.languages) ? body.languages.map(String).slice(0, 50) : [],
        p_enabled: body.enabled === true, p_reason: requiredReason(body.reason),
        p_expected_version: Number.isInteger(body.expectedVersion) ? body.expectedVersion : 0
      });
      return send(response, 200, { moderator: result });
    }
    if (body.action === "set_administrator") {
      requireRole(actor, ["super_admin"]);
      const result = await rpc("set_administrator", {
        p_actor: actor.id, p_target: uuid(body.userId), p_enabled: body.enabled === true,
        p_reason: requiredReason(body.reason)
      });
      return send(response, 200, { administrator: result });
    }
    if (body.action === "delete_pack") {
      const pack = await archiveAndDeletePack(actor, body);
      return send(response, 200, { pack });
    }
    throw httpError(400, "invalid_action", "Unsupported administration action.");
  } catch (error) {
    console.error("admin request failed", { code: error?.code, status: error?.status }); sendError(response, error);
  }
};

async function archiveAndDeletePack(actor, body) {
  const submissionId = uuid(body.submissionId);
  const reason = requiredReason(body.reason);
  const published = await db(`published_lessons?select=submission_id,published_version,submissions(state,current_version,row_version)&submission_id=eq.${submissionId}&limit=1`);
  const record = published[0];
  const submission = record?.submissions;
  if (!record || !submission || submission.state !== "published") throw httpError(409, "not_published", "This pack is not currently published.");
  const version = await db(`submission_versions?select=canonical_json&submission_id=eq.${submissionId}&version=eq.${record.published_version}&limit=1`);
  if (!version[0]) throw httpError(404, "not_found", "The published pack version was not found.");
  const validated = parseAndValidatePack(version[0].canonical_json);
  const pack = validated.pack;
  const result = await rpc("transition_submission", {
    p_actor: actor.id, p_submission: submissionId, p_expected_version: submission.current_version,
    p_expected_row_version: submission.row_version, p_next: "archived", p_reason: reason,
    p_action_id: `admin-delete:${crypto.randomUUID()}`
  });
  const path = `${segment(pack.language)}/${segment(pack.baseLanguage)}/${segment(pack.id)}/${segment(pack.version)}/${slugifyPackTitle(pack.title)}.fydorpack`;
  await deletePackObject(path);
  return { submissionId, state: result.state, objectDeleted: true };
}

function uuid(value){const text=String(value||"");if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text))throw httpError(400,"invalid_id","Invalid identifier.");return text;}
function requiredReason(value){const text=String(value||"").normalize("NFC").trim();if(!text)throw httpError(400,"reason_required","A reason is required.");return text.slice(0,4000);}
function segment(value) { return String(value || "").toLowerCase().trim().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown"; }
