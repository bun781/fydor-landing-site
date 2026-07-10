"use strict";

const { authenticate, requireRole } = require("../lib/auth");
const { db, rpc } = require("../lib/db");
const { handleOptions, httpError, readJsonBody, requireMethod, send, sendError, setCors } = require("../lib/http");
const { parseAndValidateLesson } = require("../lib/lesson-schema");
const { buildLessonPrompt } = require("../lib/prompt-template");
const { rateLimit } = require("../lib/rate-limit");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response, { methods: "GET, POST, OPTIONS" })) return;
  setCors(request, response);
  response.setHeader("Cache-Control", "no-store");
  try {
    requireMethod(request, ["GET", "POST"]);
    const actor = await authenticate(request);
    await rateLimit(`${actor.id}:contributor`, 90);
    if (request.method === "GET") return await handleGet(request, response, actor);
    const body = await readJsonBody(request);
    return await handlePost(request, response, actor, body);
  } catch (error) {
    console.error("contributor request failed", { code: error?.code, status: error?.status });
    sendError(response, error);
  }
};

async function handleGet(request, response, actor) {
  const action = String(request.query?.action || "drafts");
  if (action === "drafts") {
    const rows = await db(`contributor_drafts?select=id,state,title,target_language,base_language,level,content_hash,schema_version,generation_source,prompt_template_version,revision,created_at,updated_at&owner_id=eq.${actor.id}&order=updated_at.desc&limit=100`);
    return send(response, 200, { drafts: rows });
  }
  if (action === "draft") {
    const id = uuid(request.query?.id);
    const rows = await db(`contributor_drafts?select=*,sentence_review_progress(*)&id=eq.${id}&owner_id=eq.${actor.id}&limit=1`);
    if (!rows[0]) throw httpError(404, "not_found", "Contributor draft not found.");
    return send(response, 200, { draft: rows[0] });
  }
  if (action === "submissions") {
    const rows = await db(`submissions?select=id,title,target_language,base_language,state,current_version,row_version,created_at,updated_at&creator_id=eq.${actor.id}&order=created_at.desc&limit=100`);
    return send(response, 200, { submissions: rows });
  }
  if (action === "submission") {
    const id = uuid(request.query?.id);
    const rows = await db(`submissions?select=*&id=eq.${id}&creator_id=eq.${actor.id}&limit=1`);
    if (!rows[0]) throw httpError(404, "not_found", "Submission not found.");
    const versions = await db(`submission_versions?select=version,content_hash,submitted_at,prompt_template_version,generation_source&submission_id=eq.${id}&order=version.desc`);
    const feedback = await db(`reviewer_feedback?select=id,submission_version,sentence_index,category,body,resolution_state,created_at&submission_id=eq.${id}&order=created_at.asc`);
    return send(response, 200, { submission: rows[0], versions, feedback });
  }
  if (action === "notifications") {
    const rows = await db(`notifications?select=id,kind,title,body,link_path,read_at,created_at&user_id=eq.${actor.id}&order=created_at.desc&limit=100`);
    return send(response, 200, { notifications: rows });
  }
  if (action === "preflight") {
    const id = uuid(request.query?.id);
    const drafts = await db(`contributor_drafts?select=*&id=eq.${id}&owner_id=eq.${actor.id}&limit=1`);
    const draft = drafts[0];
    if (!draft) throw httpError(404, "not_found", "Contributor draft not found.");
    const reviews = await db(`sentence_review_progress?select=status&draft_id=eq.${id}`);
    const total = draft.canonical_json.sentences.length;
    const reviewed = reviews.filter((row) => row.status === "reviewed").length;
    return send(response, 200, { preflight: {
      title: draft.title, targetLanguage: draft.target_language, baseLanguage: draft.base_language,
      level: draft.level, sentenceCount: total, schemaVersion: draft.schema_version,
      promptTemplateVersion: draft.prompt_template_version, generationSource: draft.generation_source,
      reviewed, total, reviewComplete: reviewed === total, validationErrors: [], warnings: [],
      revision: draft.revision, contentHash: draft.content_hash, ready: reviewed === total && draft.state === "reviewing"
    }});
  }
  throw httpError(400, "invalid_action", "Unsupported contributor query.");
}

async function handlePost(request, response, actor, body) {
  const action = String(body.action || "");
  if (action === "prompt") {
    requireRole(actor, ["user", "contributor", "admin", "super_admin"]);
    return send(response, 200, buildLessonPrompt(body.input || {}));
  }
  if (action === "validate") {
    const result = validate(body.lesson);
    return send(response, result.ok ? 200 : 422, result);
  }
  if (action === "save_draft" || action === "convert_personal") {
    await rpc("enable_contributor", { p_user: actor.id });
    const result = validate(body.lesson);
    if (!result.ok) return send(response, 422, result);
    const existingId = body.draftId ? uuid(body.draftId) : null;
    const record = {
      owner_id: actor.id,
      state: body.state === "reviewing" ? "reviewing" : "draft",
      title: result.lesson.title,
      target_language: result.lesson.language,
      base_language: result.lesson.baseLanguage,
      level: result.lesson.level,
      canonical_json: result.lesson,
      content_hash: result.contentHash,
      schema_version: result.lesson.schemaVersion,
      generation_source: generationSource(body.generationSource),
      prompt_template_version: optionalText(body.promptTemplateVersion, 120),
      conversion_source_lesson_id: action === "convert_personal" ? requiredText(body.personalLessonId, 200) : null
    };
    let draft;
    if (existingId) {
      const revision = positiveInt(body.expectedRevision, "expectedRevision");
      const rows = await db(`contributor_drafts?id=eq.${existingId}&owner_id=eq.${actor.id}&revision=eq.${revision}`, {
        method: "PATCH", body: { ...record, revision: revision + 1, updated_at: new Date().toISOString() }
      });
      if (!rows[0]) throw httpError(409, "stale_draft", "The contributor draft changed in another session.");
      draft = rows[0];
      if (body.resetReview !== false) await db(`sentence_review_progress?draft_id=eq.${existingId}`, { method: "DELETE", prefer: "return=minimal" });
    } else {
      const rows = await db("contributor_drafts", { method: "POST", body: record });
      draft = rows[0];
    }
    await db("audit_events", { method: "POST", body: {
      actor_id: actor.id, actor_roles: actor.roles, event_type: action,
      entity_type: "contributor_draft", entity_id: draft.id,
      previous_state: existingId ? "editable" : null, next_state: draft.state,
      metadata: action === "convert_personal" ? { sourcePersonalLessonId: record.conversion_source_lesson_id } : {}
    }});
    return send(response, existingId ? 200 : 201, { draft });
  }
  if (action === "review_sentence") {
    requireRole(actor, ["contributor"]);
    const draftId = uuid(body.draftId);
    const drafts = await db(`contributor_drafts?select=id,owner_id,revision,canonical_json,state&id=eq.${draftId}&owner_id=eq.${actor.id}&limit=1`);
    const draft = drafts[0];
    if (!draft) throw httpError(404, "not_found", "Contributor draft not found.");
    if (!["draft", "reviewing", "changes_requested", "withdrawn"].includes(draft.state)) throw httpError(409, "immutable", "Submitted versions cannot be edited.");
    const index = nonNegativeInt(body.sentenceIndex, "sentenceIndex");
    if (index >= draft.canonical_json.sentences.length) throw httpError(400, "invalid_index", "Sentence index is outside the lesson.");
    const status = ["unreviewed", "reviewed", "needs_work"].includes(body.status) ? body.status : null;
    if (!status) throw httpError(400, "invalid_status", "Invalid sentence review status.");
    const rows = await db("sentence_review_progress?on_conflict=draft_id,sentence_index", {
      method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: {
        draft_id: draftId, sentence_index: index, status,
        reviewer_note: optionalText(body.note, 4000), reviewed_at: status === "reviewed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      }
    });
    if (draft.state === "draft") await db(`contributor_drafts?id=eq.${draftId}&owner_id=eq.${actor.id}`, { method: "PATCH", body: { state: "reviewing", updated_at: new Date().toISOString() } });
    return send(response, 200, { review: rows[0] });
  }
  if (action === "submit") {
    requireRole(actor, ["contributor"]);
    const key = String(request.headers["idempotency-key"] || body.idempotencyKey || "").trim();
    if (!/^[A-Za-z0-9._:-]{16,160}$/.test(key)) throw httpError(400, "idempotency_required", "A valid idempotency key is required.");
    const result = await rpc("submit_draft", {
      p_actor: actor.id, p_draft: uuid(body.draftId),
      p_expected_revision: positiveInt(body.expectedRevision, "expectedRevision"),
      p_confirmed: body.confirmed === true, p_idempotency: key
    });
    return send(response, 201, { submission: result });
  }
  if (action === "withdraw") {
    requireRole(actor, ["contributor"]);
    const id = uuid(body.submissionId);
    const rows = await db(`submissions?select=id,current_version,row_version&creator_id=eq.${actor.id}&id=eq.${id}&limit=1`);
    if (!rows[0]) throw httpError(404, "not_found", "Submission not found.");
    const key = String(request.headers["idempotency-key"] || body.actionId || "").trim();
    if (!/^[A-Za-z0-9._:-]{16,160}$/.test(key)) throw httpError(400, "idempotency_required", "A valid action identifier is required.");
    const result = await rpc("transition_submission", {
      p_actor: actor.id, p_submission: id, p_expected_version: rows[0].current_version,
      p_expected_row_version: rows[0].row_version, p_next: "withdrawn", p_reason: null, p_action_id: key
    });
    return send(response, 200, { submission: result });
  }
  throw httpError(400, "invalid_action", "Unsupported contributor action.");
}

function validate(lesson) {
  return parseAndValidateLesson(typeof lesson === "string" ? lesson : JSON.stringify(lesson));
}
function uuid(value) {
  const text = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw httpError(400, "invalid_id", "Invalid identifier.");
  return text;
}
function positiveInt(value, field) { const n = Number(value); if (!Number.isInteger(n) || n < 1) throw httpError(400, "invalid_field", `${field} must be a positive integer.`); return n; }
function nonNegativeInt(value, field) { const n = Number(value); if (!Number.isInteger(n) || n < 0) throw httpError(400, "invalid_field", `${field} must be a non-negative integer.`); return n; }
function optionalText(value, max) { const text = String(value || "").normalize("NFC").trim(); return text ? text.slice(0, max) : null; }
function requiredText(value, max) { const text = optionalText(value, max); if (!text) throw httpError(400, "invalid_field", "A required value is missing."); return text; }
function generationSource(value) { return ["manual", "chatgpt", "claude", "external"].includes(value) ? value : "manual"; }
