"use strict";

const { authenticate, requireRole } = require("../lib/auth");
const { db, rpc } = require("../lib/db");
const { handleOptions, httpError, readJsonBody, requireMethod, requireSameOrigin, send, sendError, setCors } = require("../lib/http");
const { detectNearDuplicates, findExactDuplicate, parseAndValidateDraftPack, parseAndValidatePack } = require("../lib/pack-schema");
const { buildLessonPrompt } = require("../lib/prompt-template");
const { rateLimit } = require("../lib/rate-limit");
const { partitionReviewIndexes } = require("../lib/contributor-review");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response, { methods: "GET, POST, OPTIONS" })) return;
  setCors(request, response);
  response.setHeader("Cache-Control", "no-store");
  try {
    requireMethod(request, ["GET", "POST"]);
    if (request.method === "POST") requireSameOrigin(request);
    const actor = await authenticate(request, response);
    if (request.method === "GET") {
      await rateLimit(`${actor.id}:contributor`, 90, 60, { required: false });
      return await handleGet(request, response, actor);
    }
    const body = await readJsonBody(request, 5_200_000);
    if (body.action !== "validate" && body.action !== "validate_pack") {
      await rateLimit(`${actor.id}:contributor`, 90);
    }
    return await handlePost(request, response, actor, body);
  } catch (error) {
    console.error("contributor request failed", { code: error?.code, status: error?.status });
    sendError(response, error);
  }
};

async function handleGet(request, response, actor) {
  const action = String(request.query?.action || "drafts");
  if (["drafts", "draft", "preflight"].includes(action)) throw httpError(410, "local_drafts", "Contributor drafts are stored in this browser.");
  if (action === "me") return send(response, 200, { actor: { id: actor.id, roles: actor.roles } });
  if (action === "application") {
    const applications = await db(`contributor_applications?select=id,target_languages,experience,sample_plan,state,reviewer_note,submitted_at,reviewed_at,profiles!contributor_applications_applicant_id_fkey(contributor_probation_until)&applicant_id=eq.${actor.id}&limit=1`);
    const application = applications[0] || null;
    return send(response, 200, { application: application && { ...application, probation_until: application.profiles?.contributor_probation_until || null } });
  }
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
    const feedback = await db(`reviewer_feedback?select=id,submission_version,lesson_index,sentence_index,target_type,target_path,category,body,resolution_state,created_at&submission_id=eq.${id}&visibility=eq.contributor&order=created_at.asc`);
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
    const reviews = await db(`sentence_review_progress?select=sentence_index,status,draft_revision&draft_id=eq.${id}`);
    const total = packSentences(draft.canonical_json).length;
    const reviewed = reviews.filter((row) => row.status === "approved" && row.draft_revision === draft.revision).length;
    const validation = validateContributionPack(draft.canonical_json);
    const lessonTotals = (draft.canonical_json.lessons || []).map((lesson) => lesson.sentences?.length || 0);
    let sentenceOffset = 0;
    const lessonsReviewed = lessonTotals.filter((count) => {
      const complete = count > 0 && Array.from({ length: count }, (_, index) => reviews.some((row) => row.sentence_index === sentenceOffset + index && row.status === "approved" && row.draft_revision === draft.revision)).every(Boolean);
      sentenceOffset += count; return complete;
    }).length;
    return send(response, 200, { preflight: {
      title: draft.title, targetLanguage: draft.target_language, baseLanguage: draft.base_language,
      level: draft.level, sentenceCount: total, schemaVersion: draft.schema_version,
      promptTemplateVersion: draft.prompt_template_version, generationSource: draft.generation_source,
      reviewed, total, reviewComplete: reviewed === total, validationErrors: validation.ok ? [] : validation.issues, warnings: [], lessonsReviewed,
      revision: draft.revision, contentHash: draft.content_hash, ready: validation.ok && reviewed === total && ["reviewing", "changes_requested", "withdrawn"].includes(draft.state)
    }});
  }
  throw httpError(400, "invalid_action", "Unsupported contributor query.");
}

async function handlePost(request, response, actor, body) {
  const action = String(body.action || "");
  if (["save_draft", "convert_personal", "duplicate_draft", "delete_draft", "review_sentence"].includes(action)) throw httpError(410, "local_drafts", "Contributor drafts and reviews are stored in this browser.");
  if (action === "prompt") {
    requireRole(actor, ["user", "contributor", "admin", "super_admin"]);
    return send(response, 200, buildLessonPrompt(body.input || {}));
  }
  if (action === "apply_for_contributor") {
    const languages = Array.isArray(body.targetLanguages) ? [...new Set(body.targetLanguages.map((value) => String(value).trim().toLowerCase()).filter((value) => /^[a-z]{2,3}$/.test(value)))].slice(0, 12) : [];
    const application = await rpc("apply_for_contributor", {
      p_actor: actor.id, p_target_languages: languages,
      p_experience: requiredText(body.experience, 3000), p_sample_plan: requiredText(body.samplePlan, 3000)
    });
    return send(response, 201, { application });
  }
  if (action === "validate" || action === "validate_pack") {
    const result = validateContributionPack(body.pack ?? body.lesson ?? body);
    if (!result.ok) return send(response, 422, { error: { code: "invalid_pack", message: "The uploaded pack is not valid.", issues: result.issues } });
    return send(response, 200, result);
  }
  if (action === "save_draft" || action === "convert_personal") {
    await rpc("enable_contributor", { p_user: actor.id });
    const result = validateContributionDraftPack(body.pack ?? body.lesson ?? body);
    if (!result.ok) return send(response, 422, { error: { code: "invalid_pack", message: "The pack is not valid.", issues: result.issues } });
    const existingId = body.draftId ? uuid(body.draftId) : null;
    const existingRows = existingId ? await db(`contributor_drafts?select=id,owner_id,revision,canonical_json,state&id=eq.${existingId}&owner_id=eq.${actor.id}&limit=1`) : [];
    const existing = existingRows[0];
    if (existingId && !existing) throw httpError(404, "not_found", "Contributor draft not found.");
    const record = {
      owner_id: actor.id,
      state: ["reviewing", "changes_requested", "withdrawn"].includes(body.state) ? body.state : "draft",
      title: result.pack.title || "Untitled pack",
      target_language: result.pack.language,
      base_language: result.pack.baseLanguage,
      level: result.pack.level || "",
      canonical_json: result.pack,
      content_hash: result.contentHash,
      schema_version: result.pack.schemaVersion,
      generation_source: generationSource(body.generationSource),
      creation_method: body.creationMethod === "upload" ? "upload" : "ai",
      possible_duplicate: false,
      duplicate_match_submission_id: null,
      duplicate_similarity: null,
      duplicate_reasons: [],
      prompt_template_version: optionalText(body.promptTemplateVersion, 120),
      contributor_note: optionalText(body.contributorNote, 8000),
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
      await preserveCurrentReviews(existingId, existing.canonical_json, result.pack, revision + 1);
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
    const saved = await db(`contributor_drafts?select=*,sentence_review_progress(*)&id=eq.${draft.id}&owner_id=eq.${actor.id}&limit=1`);
    return send(response, existingId ? 200 : 201, { draft: saved[0] });
  }
  if (action === "duplicate_draft") {
    await rpc("enable_contributor", { p_user: actor.id });
    const id = uuid(body.draftId);
    const rows = await db(`contributor_drafts?select=*&id=eq.${id}&owner_id=eq.${actor.id}&limit=1`);
    if (!rows[0]) throw httpError(404, "not_found", "Contributor draft not found.");
    const source = rows[0];
    const copy = structuredClone(source.canonical_json);
    copy.id = `${String(copy.id || "community-pack").slice(0, 130)}-copy-${Date.now()}`;
    copy.title = `${copy.title || "Untitled pack"} (copy)`;
    copy.updatedAt = new Date().toISOString();
    const result = validateContributionDraftPack(copy);
    const inserted = await db("contributor_drafts", { method: "POST", body: {
      owner_id: actor.id, state: "draft", title: copy.title, target_language: copy.language, base_language: copy.baseLanguage,
      level: copy.level || "", canonical_json: result.pack, content_hash: result.contentHash, schema_version: copy.schemaVersion,
      generation_source: source.generation_source, creation_method: source.creation_method,
      possible_duplicate: false, duplicate_match_submission_id: null, duplicate_similarity: null, duplicate_reasons: [],
      prompt_template_version: source.prompt_template_version, conversion_source_lesson_id: null
    }});
    await db("audit_events", { method: "POST", body: { actor_id: actor.id, actor_roles: actor.roles, event_type: "duplicate_draft", entity_type: "contributor_draft", entity_id: inserted[0].id, metadata: { sourceDraftId: id } } });
    return send(response, 201, { draft: inserted[0] });
  }
  if (action === "delete_draft") {
    const id = uuid(body.draftId);
    const rows = await db(`contributor_drafts?select=id&owner_id=eq.${actor.id}&id=eq.${id}&limit=1`);
    if (!rows[0]) throw httpError(404, "not_found", "Contributor draft not found.");
    const submissions = await db(`submissions?select=id&source_draft_id=eq.${id}&creator_id=eq.${actor.id}&limit=1`);
    if (submissions[0]) throw httpError(409, "draft_has_history", "A draft with submission history cannot be deleted. Archive its submission instead.");
    await db(`contributor_drafts?id=eq.${id}&owner_id=eq.${actor.id}`, { method: "DELETE", prefer: "return=minimal" });
    return send(response, 200, { deleted: true });
  }
  if (action === "review_sentence") {
    requireRole(actor, ["contributor"]);
    const draftId = uuid(body.draftId);
    const drafts = await db(`contributor_drafts?select=id,owner_id,revision,canonical_json,state&id=eq.${draftId}&owner_id=eq.${actor.id}&limit=1`);
    const draft = drafts[0];
    if (!draft) throw httpError(404, "not_found", "Contributor draft not found.");
    if (!["draft", "reviewing", "changes_requested", "withdrawn"].includes(draft.state)) throw httpError(409, "immutable", "Submitted versions cannot be edited.");
    const index = nonNegativeInt(body.sentenceIndex, "sentenceIndex");
    if (index >= packSentences(draft.canonical_json).length) throw httpError(400, "invalid_index", "Sentence index is outside the pack.");
    const status = body.status === "reviewed" ? "approved" : body.status === "needs_work" ? "needs_changes" : ["unreviewed", "approved", "needs_changes"].includes(body.status) ? body.status : null;
    if (!status) throw httpError(400, "invalid_status", "Invalid sentence review status.");
    const rows = await db("sentence_review_progress?on_conflict=draft_id,sentence_index", {
      method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: {
        draft_id: draftId, sentence_index: index, status,
        reviewer_note: optionalText(body.note, 4000), reviewed_at: status === "approved" ? new Date().toISOString() : null,
        draft_revision: draft.revision,
        updated_at: new Date().toISOString()
      }
    });
    if (draft.state === "draft") await db(`contributor_drafts?id=eq.${draftId}&owner_id=eq.${actor.id}`, { method: "PATCH", body: { state: "reviewing", updated_at: new Date().toISOString() } });
    return send(response, 200, { review: rows[0] });
  }
  if (action === "submit_pack") {
    requireRole(actor, ["contributor"]);
    const key = String(request.headers["idempotency-key"] || body.idempotencyKey || "").trim();
    if (!/^[A-Za-z0-9._:-]{16,160}$/.test(key)) throw httpError(400, "idempotency_required", "A valid idempotency key is required.");
    const validation = validateContributionPack(body.pack);
    if (!validation.ok) throw Object.assign(httpError(422, "invalid_pack", "Resolve all blocking pack validation errors before submission."), { issues: validation.issues });
    const pack = validation.pack;
    const submission = { content_hash: validation.contentHash, title: pack.title, target_language: pack.language, base_language: pack.baseLanguage };
    const duplicate = await findSubmissionDuplicate(submission);
    if (duplicate) throw httpError(409, duplicate.code, duplicate.message);
    const nearDuplicate = await findPackNearDuplicate({ ...submission, canonical_json: pack });
    const result = await rpc("submit_pack", {
      p_actor: actor.id, p_pack: pack, p_content_hash: validation.contentHash,
      p_generation_source: generationSource(body.generationSource), p_creation_method: body.creationMethod === "upload" ? "upload" : "ai",
      p_confirmed: body.confirmed === true, p_idempotency: key,
      p_possible_duplicate: nearDuplicate.possibleDuplicate, p_duplicate_match_submission_id: nearDuplicate.matchingPackId,
      p_duplicate_similarity: nearDuplicate.possibleDuplicate ? nearDuplicate.highestOverlap : null, p_duplicate_reasons: nearDuplicate.reasons
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

async function preserveCurrentReviews(draftId, previousPack, nextPack, nextRevision) {
  const rows = await db(`sentence_review_progress?select=sentence_index&draft_id=eq.${draftId}`);
  if (!rows.length) return;
  const { preserved, reset } = partitionReviewIndexes(previousPack, nextPack, rows);
  if (reset.length) await db(`sentence_review_progress?draft_id=eq.${draftId}&sentence_index=in.(${reset.join(",")})`, { method: "DELETE", prefer: "return=minimal" });
  if (preserved.length) await db(`sentence_review_progress?draft_id=eq.${draftId}&sentence_index=in.(${preserved.join(",")})`, { method: "PATCH", body: { draft_revision: nextRevision, updated_at: new Date().toISOString() } });
}

function validateContributionPack(value) {
  let input = value;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { return { ok: false, errors: ["Malformed JSON."], issues: [{ path: "$", message: "Malformed JSON." }] }; }
  }
  if (input && input.type !== "fydor_pack" && Array.isArray(input.sentences)) input = wrapLegacyLesson(input);
  try {
    const result = parseAndValidatePack(input);
    return { ok: true, errors: [], warnings: [], pack: result.pack, lesson: result.pack.lessons[0], contentHash: result.contentHash, sentenceCount: result.sentenceCount, byteLength: result.byteLength };
  } catch (error) {
    return { ok: false, errors: [error.message], issues: error.issues || [{ path: "$", message: error.message }] };
  }
}

function validateContributionDraftPack(value) {
  let input = value;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { return { ok: false, errors: ["Malformed JSON."], issues: [{ path: "$", message: "Malformed JSON." }] }; }
  }
  if (input && input.type !== "fydor_pack" && Array.isArray(input.sentences)) input = wrapLegacyLesson(input);
  try {
    const result = parseAndValidateDraftPack(input);
    return { ok: true, errors: [], warnings: [], pack: result.pack, contentHash: result.contentHash, sentenceCount: result.sentenceCount, byteLength: result.byteLength };
  } catch (error) {
    return { ok: false, errors: [error.message], issues: error.issues || [{ path: "$", message: error.message }] };
  }
}

function wrapLegacyLesson(lesson) {
  const now = new Date().toISOString();
  return {
    type: "fydor_pack", schemaVersion: 1,
    id: `contributor-${String(lesson.title || "pack").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "pack"}`,
    title: lesson.title, description: lesson.description, version: "1.0.0",
    language: lesson.language, baseLanguage: lesson.baseLanguage, level: lesson.level, tags: lesson.tags,
    createdAt: now, updatedAt: now,
    lessons: [{ language: lesson.language, baseLanguage: lesson.baseLanguage, title: lesson.title, description: lesson.description, level: lesson.level, tags: lesson.tags, sentences: lesson.sentences }]
  };
}

function packSentences(pack) {
  if (Array.isArray(pack?.lessons)) return pack.lessons.flatMap((lesson) => lesson.sentences || []);
  return Array.isArray(pack?.sentences) ? pack.sentences : [];
}

function requiredText(value, max) {
  const text = String(value || "").normalize("NFC").trim();
  if (text.length < 40 || text.length > max) throw httpError(400, "invalid_application", `Please provide between 40 and ${max} characters.`);
  return text;
}

async function findSubmissionDuplicate(draft) {
  const published = await db(`published_lessons?select=id,content_hash&content_hash=eq.${draft.content_hash}&archived_at=is.null&limit=1`);
  if (published[0]) return { code: "duplicate_pack", message: "This pack already exists in the public library." };
  const versions = await db(`submission_versions?select=submission_id,content_hash,submissions!inner(state,creator_id)&content_hash=eq.${draft.content_hash}&submissions.state=in.(submitted,language_approved,approved,published)&limit=10`);
  if (versions[0]) {
    const own = versions.some((version) => version.submissions?.creator_id === draft.owner_id);
    return { code: "duplicate_pack", message: own ? "An identical pack is already awaiting review." : "An identical pack is already in the moderation pipeline." };
  }
  return null;
}

async function findPackNearDuplicate(draft) {
  const candidates = await db(`submission_versions?select=submission_id,canonical_json,submissions!inner(id,state,target_language,base_language)&submissions.state=in.(submitted,language_approved,approved,published)&submissions.target_language=eq.${encodeURIComponent(draft.target_language)}&submissions.base_language=eq.${encodeURIComponent(draft.base_language)}&limit=200`);
  return detectNearDuplicates(draft.canonical_json, candidates.map((row) => ({ id: row.submission_id, pack: row.canonical_json })));
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
