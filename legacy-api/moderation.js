"use strict";

const { authenticate, requireRole } = require("../lib/auth");
const { db, rpc } = require("../lib/db");
const { handleOptions, httpError, readJsonBody, requireMethod, requireSameOrigin, send, sendError, setCors } = require("../lib/http");
const { parseAndValidatePack, slugifyPackTitle } = require("../lib/pack-schema");
const { rateLimit } = require("../lib/rate-limit");
const { deletePackObject, uploadPackObject } = require("../lib/storage");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response, { methods: "GET, POST, OPTIONS" })) return;
  setCors(request, response);
  response.setHeader("Cache-Control", "no-store");
  try {
    requireMethod(request, ["GET", "POST"]);
    if (request.method === "POST") requireSameOrigin(request);
    const actor = await authenticate(request, response);
    requireRole(actor, ["moderator", "admin", "super_admin"]);
    await rateLimit(`${actor.id}:moderation`, 120);
    if (request.method === "GET") return await handleGet(request, response, actor);
    return await handlePost(request, response, actor, await readJsonBody(request, 200_000));
  } catch (error) {
    console.error("moderation request failed", { code: error?.code, status: error?.status });
    sendError(response, error);
  }
};

async function handleGet(request, response, actor) {
  const action = String(request.query?.action || "queue");
  if (action === "queue") {
    const page = clampInt(request.query?.page, 1, 10000, 1);
    const pageSize = clampInt(request.query?.pageSize, 1, 100, 25);
    const states = allowedStates(String(request.query?.status || "submitted,language_approved,approved"));
    let languages = [];
    if (actor.roles.includes("moderator") && !actor.roles.some((r) => ["admin", "super_admin"].includes(r))) {
      const assigned = await db(`moderator_language_assignments?select=language_code&moderator_id=eq.${actor.id}&suspended_at=is.null`);
      languages = assigned.map((row) => row.language_code);
      if (!languages.length) return send(response, 200, { submissions: [], page, pageSize });
    }
    const languageFilter = languages.length ? `&target_language=in.(${languages.join(",")})` : request.query?.language ? `&target_language=eq.${safeCode(request.query.language)}` : "";
    const baseFilter = request.query?.baseLanguage ? `&base_language=eq.${safeCode(request.query.baseLanguage)}` : "";
    const contributorFilter = request.query?.contributor ? `&creator_id=eq.${uuid(request.query.contributor)}` : "";
    const afterFilter = request.query?.submittedAfter ? `&created_at=gte.${safeDate(request.query.submittedAfter)}` : "";
    const beforeFilter = request.query?.submittedBefore ? `&created_at=lte.${safeDate(request.query.submittedBefore)}` : "";
    const sort = queueSort(request.query?.sort, request.query?.direction);
    const rows = await db(`submissions?select=id,creator_id,title,target_language,base_language,state,current_version,row_version,created_at,updated_at,moderation_assignments(id,moderator_id,state,assigned_at)&state=in.(${states.join(",")})${languageFilter}${baseFilter}${contributorFilter}${afterFilter}${beforeFilter}&order=${sort}&limit=500`);
    const profiles = await profilesById(rows.map((row) => row.creator_id));
    const enriched = await mapWithConcurrency(rows, 8, async (row) => {
      const versions = await db(`submission_versions?select=version,source_draft_revision,canonical_json,content_hash,creation_method,possible_duplicate,duplicate_match_submission_id,duplicate_similarity,duplicate_reasons,submitted_at&submission_id=eq.${row.id}&version=eq.${row.current_version}&limit=1`);
      const current = versions[0] || {};
      const validation = validateSnapshot(current.canonical_json);
      const history = await db(`audit_events?select=id&entity_type=eq.submission&entity_id=eq.${row.id}&limit=200`);
      return { ...row, ...withoutCanonical(current), contributor: profiles.get(row.creator_id) || null, lesson_count: validation.lessonCount, sentence_count: validation.sentenceCount, level: validation.level, validation_warnings: validation.warnings, moderation_history_count: history.length };
    });
    const level = String(request.query?.level || "").normalize("NFC").trim().toLocaleLowerCase();
    const problemsOnly = String(request.query?.hasProblems || "") === "true";
    const filtered = enriched.filter((row) => (!level || String(row.level).toLocaleLowerCase() === level) && (!problemsOnly || row.validation_warnings.length > 0 || row.possible_duplicate));
    const from = (page - 1) * pageSize;
    return send(response, 200, { submissions: filtered.slice(from, from + pageSize), page, pageSize, total: filtered.length, hasMore: from + pageSize < filtered.length });
  }
  if (action === "workspace") {
    const id = uuid(request.query?.id);
    await assertMayInspect(actor, id);
    const submissions = await db(`submissions?select=*&id=eq.${id}&limit=1`);
    if (!submissions[0]) throw httpError(404, "not_found", "Submission not found.");
    const versions = await db(`submission_versions?select=*&submission_id=eq.${id}&order=version.desc`);
    const feedback = await db(`reviewer_feedback?select=*&submission_id=eq.${id}&order=created_at.asc`);
    const assignments = await db(`moderation_assignments?select=*&submission_id=eq.${id}&order=assigned_at.desc`);
    const contributors = await profilesById([submissions[0].creator_id]);
    const events = await db(`audit_events?select=*&entity_type=eq.submission&entity_id=eq.${id}&order=created_at.asc`);
    const actorProfiles = await profilesById(events.map((event) => event.actor_id));
    return send(response, 200, { submission: { ...submissions[0], contributor: contributors.get(submissions[0].creator_id) || null }, versions: versions.map((version) => ({ ...version, validation: validateSnapshot(version.canonical_json) })), feedback, assignments, events: events.map((event) => ({ ...event, actor: actorProfiles.get(event.actor_id) || null })) });
  }
  if (action === "audit") {
    requireRole(actor, ["admin", "super_admin"]);
    const id = uuid(request.query?.id);
    const events = await db(`audit_events?select=*&entity_type=eq.submission&entity_id=eq.${id}&order=created_at.asc`);
    return send(response, 200, { events });
  }
  if (action === "history") {
    requireRole(actor, ["admin", "super_admin"]);
    const events = await db("audit_events?select=*&entity_type=eq.submission&order=created_at.desc&limit=500");
    const profiles = await profilesById(events.map((event) => event.actor_id));
    const submissionIds = [...new Set(events.map((event) => event.entity_id).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
    const submissions = submissionIds.length ? await db(`submissions?select=id,title&id=in.(${submissionIds.join(",")})`) : [];
    const titles = new Map(submissions.map((submission) => [submission.id, submission.title]));
    return send(response, 200, { events: events.map((event) => ({ ...event, actor: profiles.get(event.actor_id) || null, target_title: titles.get(event.entity_id) || null })) });
  }
  throw httpError(400, "invalid_action", "Unsupported moderation query.");
}

async function handlePost(request, response, actor, body) {
  const action = String(body.action || "");
  if (action === "claim") {
    requireRole(actor, ["moderator"]);
    const result = await rpc("claim_submission", { p_actor: actor.id, p_submission: uuid(body.submissionId), p_expected_version: positiveInt(body.version) });
    return send(response, 201, { assignment: result });
  }
  if (action === "feedback") {
    requireRole(actor, ["moderator", "admin", "super_admin"]);
    const submissionId = uuid(body.submissionId);
    const version = positiveInt(body.version);
    await assertActiveReviewer(actor, submissionId, version);
    const category = ["translation","grammar","vocabulary","annotation","formatting","factual_accuracy","naturalness","level_appropriateness","duplicate_content","policy_or_safety","other"].includes(body.category) ? body.category : null;
    const text = String(body.body || "").normalize("NFC").trim();
    if (!category || !text || text.length > 8000) throw httpError(400, "invalid_feedback", "Feedback category and text are required.");
    const targetType = ["pack","metadata","lesson","sentence","annotation"].includes(body.targetType) ? body.targetType : "sentence";
    const lessonIndex = body.lessonIndex === null || body.lessonIndex === undefined ? null : nonNegativeInt(body.lessonIndex);
    const sentenceIndex = body.sentenceIndex === null || body.sentenceIndex === undefined ? null : nonNegativeInt(body.sentenceIndex);
    const targetPath = String(body.targetPath || "").normalize("NFC").trim().slice(0, 500) || null;
    const rows = await db("reviewer_feedback", { method: "POST", body: {
      submission_id: submissionId, submission_version: version, author_id: actor.id,
      lesson_index: lessonIndex, sentence_index: sentenceIndex, target_type: targetType, target_path: targetPath,
      visibility: body.internal === true ? "internal" : "contributor", category, body: text, suggested_patch: safePatch(body.suggestedPatch)
    }});
    await db("audit_events", { method: "POST", body: { actor_id: actor.id, actor_roles: actor.roles, event_type: "moderation_flag_created", entity_type: "submission", entity_id: submissionId, submission_version: version, note: text, metadata: { targetType, targetPath, lessonIndex, sentenceIndex, visibility: body.internal === true ? "internal" : "contributor" } } });
    return send(response, 201, { feedback: rows[0] });
  }
  if (action === "resolve_feedback") {
    const id = uuid(body.feedbackId);
    const rows = await db(`reviewer_feedback?select=*&id=eq.${id}&limit=1`);
    const feedback = rows[0];
    if (!feedback) throw httpError(404, "not_found", "Feedback not found.");
    await assertMayInspect(actor, feedback.submission_id);
    const state = body.resolved === false ? "reopened" : "resolved";
    const updated = await db(`reviewer_feedback?id=eq.${id}`, { method: "PATCH", body: {
      resolution_state: state, resolved_by: state === "resolved" ? actor.id : null,
      resolved_at: state === "resolved" ? new Date().toISOString() : null, updated_at: new Date().toISOString()
    }});
    return send(response, 200, { feedback: updated[0] });
  }
  if (action === "transition") {
    const next = String(body.nextState || "");
    const actionId = String(request.headers["idempotency-key"] || body.actionId || "").trim();
    if (!/^[A-Za-z0-9._:-]{16,160}$/.test(actionId)) throw httpError(400, "idempotency_required", "A valid action identifier is required.");
    let publication;
    if (next === "restore") requireRole(actor, ["admin", "super_admin"]);
    if (next === "published" || (next === "restore" && await restoresPublication(uuid(body.submissionId)))) {
      requireRole(actor, ["admin", "super_admin"]);
      publication = await publishVersion(uuid(body.submissionId), positiveInt(body.version));
    } else if (next === "approved" || next === "archived") {
      requireRole(actor, ["admin", "super_admin"]);
      publication = await removePublishedVersion(uuid(body.submissionId));
    }
    let result;
    try {
      result = await rpc("transition_submission", {
        p_actor: actor.id, p_submission: uuid(body.submissionId),
        p_expected_version: positiveInt(body.version), p_expected_row_version: positiveInt(body.rowVersion),
        p_next: next, p_reason: String(body.reason || "").normalize("NFC").trim().slice(0, 8000) || null,
        p_action_id: actionId
      });
    } catch (error) {
      if (publication?.removed) await uploadPackObject(publication.path, publication.source, { contentType: "application/vnd.fydor-pack+json" }).catch(() => {});
      if (publication?.uploaded) await deletePackObject(publication.path).catch(() => {});
      throw error;
    }
    return send(response, 200, { submission: result });
  }
  throw httpError(400, "invalid_action", "Unsupported moderation action.");
}

async function publishVersion(submissionId, version) {
  const rows = await db(`submission_versions?select=canonical_json,content_hash&submission_id=eq.${submissionId}&version=eq.${version}&limit=1`);
  if (!rows[0]) throw httpError(404, "not_found", "The reviewed pack version was not found.");
  const result = parseAndValidatePack(rows[0].canonical_json);
  if (result.contentHash !== rows[0].content_hash) throw httpError(409, "stale_pack", "The reviewed pack changed and must be reviewed again.");
  const pack = result.pack;
  const path = `${segment(pack.language)}/${segment(pack.baseLanguage)}/${segment(pack.id)}/${segment(pack.version)}/${slugifyPackTitle(pack.title)}.fydorpack`;
  const source = JSON.stringify(pack, null, 2);
  await uploadPackObject(path, source, { contentType: "application/vnd.fydor-pack+json" });
  return { uploaded: true, path, source };
}

async function removePublishedVersion(submissionId) {
  const rows = await db(`published_lessons?select=published_version,archived_at&submission_id=eq.${submissionId}&archived_at=is.null&limit=1`);
  if (!rows[0]) return null;
  const publication = await loadVersionForStorage(submissionId, rows[0].published_version);
  await deletePackObject(publication.path);
  return { ...publication, removed: true };
}

async function restoresPublication(submissionId) {
  const rows = await db(`submissions?select=archived_from_state&id=eq.${submissionId}&state=eq.archived&limit=1`);
  return rows[0]?.archived_from_state === "published";
}

async function loadVersionForStorage(submissionId, version) {
  const rows = await db(`submission_versions?select=canonical_json&submission_id=eq.${submissionId}&version=eq.${version}&limit=1`);
  if (!rows[0]) throw httpError(404, "not_found", "The published pack version was not found.");
  const result = parseAndValidatePack(rows[0].canonical_json); const pack=result.pack;
  return { path: `${segment(pack.language)}/${segment(pack.baseLanguage)}/${segment(pack.id)}/${segment(pack.version)}/${slugifyPackTitle(pack.title)}.fydorpack`, source: JSON.stringify(pack, null, 2) };
}

function segment(value) {
  return String(value || "").toLowerCase().trim().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";
}

async function assertMayInspect(actor, submissionId) {
  if (actor.roles.some((r) => ["admin", "super_admin"].includes(r))) return;
  const rows = await db(`submissions?select=target_language&id=eq.${submissionId}&limit=1`);
  if (!rows[0]) throw httpError(404, "not_found", "Submission not found.");
  const assignments = await db(`moderator_language_assignments?select=language_code&moderator_id=eq.${actor.id}&language_code=eq.${rows[0].target_language}&suspended_at=is.null&limit=1`);
  if (!assignments[0]) throw httpError(403, "forbidden", "This language is not assigned to you.");
}
async function assertActiveReviewer(actor, submissionId, version) {
  if (actor.roles.some((r) => ["admin", "super_admin"].includes(r))) return;
  const rows = await db(`moderation_assignments?select=id&submission_id=eq.${submissionId}&submission_version=eq.${version}&moderator_id=eq.${actor.id}&state=eq.active&limit=1`);
  if (!rows[0]) throw httpError(403, "forbidden", "An active assignment is required.");
}
function allowedStates(value) { const allowed=["submitted","changes_requested","language_approved","approved","published","rejected","withdrawn","archived"]; const values=value.split(",").filter((v)=>allowed.includes(v)); return values.length?values:["submitted"]; }
function uuid(value) { const text=String(value||""); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw httpError(400,"invalid_id","Invalid identifier."); return text; }
function positiveInt(value) { const n=Number(value); if(!Number.isInteger(n)||n<1) throw httpError(400,"invalid_version","A positive version is required."); return n; }
function nonNegativeInt(value) { const n=Number(value); if(!Number.isInteger(n)||n<0) throw httpError(400,"invalid_index","Invalid sentence index."); return n; }
function clampInt(value,min,max,fallback){const n=Number(value);return Number.isInteger(n)?Math.min(max,Math.max(min,n)):fallback;}
function safePatch(value){if(value===undefined||value===null)return null;const text=JSON.stringify(value);if(text.length>20_000)throw httpError(400,"invalid_patch","Suggested patch is too large.");return JSON.parse(text);}
function safeCode(value){const text=String(value||"").toLowerCase();if(!/^[a-z]{2,8}$/.test(text))throw httpError(400,"invalid_query","Invalid language code.");return text;}
function safeDate(value){const text=String(value||"");if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)||Number.isNaN(Date.parse(text)))throw httpError(400,"invalid_query","Invalid submission date.");return encodeURIComponent(text);}
function queueSort(value,direction){const columns={submitted:"created_at",updated:"updated_at",title:"title",status:"state"};const column=columns[String(value||"submitted")]||"created_at";return `${column}.${String(direction)==="asc"?"asc":"desc"}`;}
function validateSnapshot(snapshot){try{const result=parseAndValidatePack(snapshot);return{lessonCount:result.pack.lessons.length,sentenceCount:result.sentenceCount,level:result.pack.level||"",warnings:[]};}catch(error){return{lessonCount:Array.isArray(snapshot?.lessons)?snapshot.lessons.length:0,sentenceCount:Array.isArray(snapshot?.lessons)?snapshot.lessons.reduce((n,l)=>n+(Array.isArray(l?.sentences)?l.sentences.length:0),0):0,level:String(snapshot?.level||""),warnings:(error.issues||[{path:"$",message:error.message}]).slice(0,20)};}}
function withoutCanonical(version){const {canonical_json,...rest}=version;return rest;}
async function profilesById(ids){const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return new Map();const rows=await db(`profiles?select=id,email,display_name&id=in.(${unique.join(",")})`);return new Map(rows.map((row)=>[row.id,row]));}
async function mapWithConcurrency(items,concurrency,mapper){const output=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length){const index=next++;output[index]=await mapper(items[index]);}}));return output;}
