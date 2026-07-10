"use strict";

const { sql } = require("drizzle-orm");
const { getDatabase } = require("../lib/database");
const { handleOptions, httpError, requireMethod, send, sendError, setCors } = require("../lib/http");
const { rateLimit } = require("../lib/rate-limit");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response, { public: true, methods: "GET, OPTIONS" })) return;
  setCors(request, response, { public: true });
  try {
    requireMethod(request, ["GET"]);
    await rateLimit(`public:${clientKey(request)}`, 120);
    const database = getDatabase();
    const id = request.query?.id ? stableId(request.query.id) : null;
    if (id) return await getLesson(database, request, response, id);
    return await listLessons(database, request, response);
  } catch (error) {
    console.error("library request failed", { code: error?.code, status: error?.status });
    sendError(response, error);
  }
};

async function getLesson(database, request, response, id) {
  const rows = await database.execute(sql`
    select * from published_lessons
    where stable_lesson_id = ${id} and archived_at is null
    limit 1
  `);
  const lesson = rows[0];
  if (!lesson) throw httpError(404, "not_found", "Published lesson not found.");

  if (String(request.query?.download || "") === "1") {
    const versions = await database.execute(sql`
      select canonical_json, content_hash, version
      from submission_versions
      where submission_id = ${lesson.submission_id} and version = ${lesson.published_version}
      limit 1
    `);
    if (!versions[0]) throw httpError(404, "not_found", "Published lesson version not found.");
    response.setHeader("Content-Disposition", `attachment; filename="${id}-v${lesson.lesson_version}.json"`);
    response.setHeader("Cache-Control", "public, max-age=300, immutable");
    return send(response, 200, {
      manifest: publicMetadata(lesson),
      lesson: versions[0].canonical_json,
      checksum: versions[0].content_hash
    });
  }

  response.setHeader("Cache-Control", "public, max-age=60");
  return send(response, 200, { lesson: publicMetadata(lesson) });
}

async function listLessons(database, request, response) {
  const page = clampInt(request.query?.page, 1, 10000, 1);
  const pageSize = clampInt(request.query?.pageSize, 1, 100, 24);
  const conditions = [sql`archived_at is null`];
  if (request.query?.language) conditions.push(sql`target_language = ${safeFilter(request.query.language)}`);
  if (request.query?.baseLanguage) conditions.push(sql`base_language = ${safeFilter(request.query.baseLanguage)}`);
  if (request.query?.level) conditions.push(sql`level = ${safeFilter(request.query.level)}`);
  if (request.query?.tag) conditions.push(sql`tags @> array[${safeFilter(request.query.tag)}]::text[]`);

  const query = String(request.query?.q || "").normalize("NFC").trim().slice(0, 100);
  if (query) {
    const pattern = `%${query}%`;
    conditions.push(sql`(title ilike ${pattern} or description ilike ${pattern})`);
  }
  const order = request.query?.sort === "title"
    ? sql`title asc`
    : request.query?.sort === "oldest"
      ? sql`published_at asc`
      : sql`published_at desc`;
  const offset = (page - 1) * pageSize;
  const rows = await database.execute(sql`
    select * from published_lessons
    where ${sql.join(conditions, sql` and `)}
    order by ${order}
    offset ${offset}
    limit ${pageSize}
  `);
  response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return send(response, 200, {
    lessons: rows.map(publicMetadata),
    page,
    pageSize,
    hasMore: rows.length === pageSize
  });
}

function publicMetadata(row) {
  return {
    id: row.stable_lesson_id,
    title: row.title,
    description: row.description,
    targetLanguage: row.target_language,
    baseLanguage: row.base_language,
    level: row.level,
    tags: row.tags,
    sentenceCount: row.sentence_count,
    schemaVersion: row.schema_version,
    lessonVersion: row.lesson_version,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    checksum: row.checksum,
    license: row.license,
    compatibility: row.compatibility
  };
}

function stableId(value) {
  const text = String(value || "");
  if (!/^lesson-[0-9a-f-]{36}$/i.test(text)) throw httpError(400, "invalid_id", "Invalid lesson identifier.");
  return text;
}

function safeFilter(value) {
  const text = String(value || "").normalize("NFC").trim();
  if (!/^[\p{L}\p{N} ._-]{1,80}$/u.test(text)) throw httpError(400, "invalid_filter", "Invalid filter value.");
  return text;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function clientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim()
    .replace(/[^a-fA-F0-9:.]/g, "")
    .slice(0, 80);
}
