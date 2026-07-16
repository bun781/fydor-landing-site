"use strict";

const { parseAndValidatePack } = require("../lib/pack-schema");
const { handleOptions, httpError, requireMethod, safeServerError, send, sendError, setCors } = require("../lib/http");
const { rateLimit: defaultRateLimit } = require("../lib/rate-limit");
const { listPackObjects: defaultListPackObjects, readPackObject: defaultReadPackObject } = require("../lib/storage");

function createLibraryHandler(options = {}) {
  const listPackObjects = options.listPackObjects || defaultListPackObjects;
  const readPackObject = options.readPackObject || defaultReadPackObject;
  const rateLimit = options.rateLimit || defaultRateLimit;
  const logger = options.logger || console;

  return async function handler(request, response) {
    if (handleOptions(request, response, { public: true, methods: "GET, OPTIONS" })) return;
    setCors(request, response, { public: true });
    let stage = "request_validation";
    try {
      requireMethod(request, ["GET"]);
      stage = "rate_limit";
      await rateLimit(`public:${clientKey(request)}`, 120, 60, { required: false });
      const id = request.query?.id ? packPathFromId(request.query.id) : null;
      stage = id ? "pack_download" : "pack_listing";
      if (id) return await getPack(readPackObject, request, response, id);
      return await listPacks(listPackObjects, readPackObject, request, response, logger);
    } catch (error) {
      logger.error("library request failed", {
        event: "library_request_failed",
        stage,
        code: error?.code,
        status: error?.status
      });
      sendError(response, error);
    }
  };
}

async function getPack(readPackObject, request, response, path) {
  const source = await readPackObject(path);
  const result = parsePack(source, path);
  if (String(request.query?.download || "") === "1") {
    response.setHeader("Content-Disposition", `attachment; filename="${fileName(path)}"`);
    response.setHeader("Content-Type", "application/vnd.fydor-pack+json; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=300, immutable");
    return response.status(200).send(JSON.stringify(result.pack, null, 2));
  }
  response.setHeader("Cache-Control", "public, max-age=60");
  return send(response, 200, { pack: publicMetadata(result, path) });
}

async function listPacks(listPackObjects, readPackObject, request, response, logger) {
  const page = queryInt(request.query?.page, "page", 1, 10000, 1);
  const pageSize = queryInt(request.query?.pageSize, "pageSize", 1, 100, 24);
  const objects = await listPackObjects({ limit: 500 });
  const entries = await mapWithConcurrency(objects, 8, async (object) => {
    try {
      const result = parsePack(await readPackObject(object.path), object.path);
      return publicMetadata(result, object.path, object);
    } catch (error) {
      logger.warn("skipping invalid public pack", {
        event: "public_pack_skipped",
        code: error?.code,
        path: safePackPath(object.path)
      });
      return null;
    }
  });
  const filtered = entries.filter(Boolean).filter((pack) => matches(pack, request.query || {}));
  sortPacks(filtered, String(request.query?.sort || "newest"));
  const offset = (page - 1) * pageSize;
  const packs = filtered.slice(offset, offset + pageSize);
  response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  // lessons remains an alias for existing clients while the Exchange migrates to pack terminology.
  return send(response, 200, { packs, lessons: packs, page, pageSize, hasMore: offset + pageSize < filtered.length });
}

function parsePack(source, path) {
  try {
    return parseAndValidatePack(source);
  } catch {
    throw safeServerError(503, "storage_unavailable", `The published pack at ${safePackPath(path)} is unavailable.`);
  }
}

function publicMetadata(result, path, object = {}) {
  const pack = result.pack;
  return {
    id: packId(path),
    title: pack.title,
    description: pack.description || "Published Fydor lesson pack.",
    targetLanguage: pack.language,
    baseLanguage: pack.baseLanguage,
    level: pack.level || "all levels",
    tags: pack.tags || [],
    sentenceCount: result.sentenceCount,
    lessonCount: pack.lessons.length,
    schemaVersion: pack.schemaVersion,
    lessonVersion: pack.version,
    publishedAt: object.createdAt || pack.createdAt || null,
    updatedAt: object.updatedAt || pack.updatedAt || null,
    checksum: result.checksum,
    license: pack.license || "License not specified",
    compatibility: "fydor-pack-v1"
  };
}

function matches(pack, query) {
  const filters = [
    ["language", pack.targetLanguage], ["baseLanguage", pack.baseLanguage], ["level", pack.level]
  ];
  for (const [name, actual] of filters) {
    if (query[name] && normalizeFilter(query[name]) !== normalizeFilter(actual)) return false;
  }
  if (query.tag && !pack.tags.some((tag) => normalizeFilter(tag) === normalizeFilter(query.tag))) return false;
  if (query.q) {
    const value = String(query.q).normalize("NFC").trim().toLocaleLowerCase().slice(0, 100);
    if (value && !`${pack.title} ${pack.description} ${pack.tags.join(" ")}`.toLocaleLowerCase().includes(value)) return false;
  }
  return true;
}

function sortPacks(packs, sort) {
  if (sort === "title") packs.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "oldest") packs.sort((a, b) => dateValue(a.publishedAt) - dateValue(b.publishedAt));
  else packs.sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await mapper(items[index]);
    }
  }));
  return output;
}

function packId(path) { return Buffer.from(path, "utf8").toString("base64url"); }

function packPathFromId(value) {
  let path;
  try { path = Buffer.from(String(value || ""), "base64url").toString("utf8"); } catch { path = ""; }
  if (!/^[A-Za-z0-9._/-]{1,600}\.fydorpack$/.test(path) || path.includes("..") || path.startsWith("/")) {
    throw httpError(400, "invalid_id", "Invalid pack identifier.");
  }
  return path;
}

function safePackPath(path) { return String(path).replace(/[^A-Za-z0-9._/-]/g, "_").slice(0, 600); }
function fileName(path) { return safePackPath(path).split("/").pop() || "fydor-pack.fydorpack"; }
function dateValue(value) { const time = Date.parse(value || ""); return Number.isFinite(time) ? time : 0; }
function normalizeFilter(value) { return String(value || "").normalize("NFC").trim().toLocaleLowerCase(); }

function queryInt(value, name, min, max, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value);
  if (!/^\d+$/.test(text)) throw httpError(400, "invalid_query", `${name} must be an integer.`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw httpError(400, "invalid_query", `${name} must be between ${min} and ${max}.`);
  return number;
}

function clientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0].trim().replace(/[^a-fA-F0-9:.]/g, "").slice(0, 80);
}

module.exports = createLibraryHandler();
module.exports.createLibraryHandler = createLibraryHandler;
module.exports.packId = packId;
module.exports.packPathFromId = packPathFromId;
