"use strict";

const { handleOptions, readJsonBody, requireMethod, send, sendError, setCors } = require("../lib/http");
const { parseAndValidatePack, slugifyPackTitle } = require("../lib/pack-schema");
const { rateLimit } = require("../lib/rate-limit");
const { uploadPackObject } = require("../lib/storage");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response, { public: true, methods: "POST, OPTIONS" })) return;
  setCors(request, response, { public: true, methods: "POST, OPTIONS" });
  response.setHeader("Cache-Control", "no-store");
  try {
    requireMethod(request, ["POST"]);
    await rateLimit(`packs:${clientKey(request)}`, 12, 60);
    const body = await readJsonBody(request, 5_200_000);
    const result = parseAndValidatePack(body.pack ?? body);
    const objectPath = packObjectPath(result.pack);
    const upload = await uploadPackObject(objectPath, JSON.stringify(result.pack, null, 2), {
      contentType: "application/vnd.fydor-pack+json"
    });
    return send(response, 201, {
      pack: {
        id: result.pack.id,
        title: result.pack.title,
        version: result.pack.version,
        language: result.pack.language,
        baseLanguage: result.pack.baseLanguage,
        lessonCount: result.pack.lessons.length,
        sentenceCount: result.sentenceCount
      },
      bucket: upload.bucket,
      path: upload.path,
      publicUrl: upload.publicUrl,
      checksum: result.checksum,
      byteLength: result.byteLength
    });
  } catch (error) {
    console.error("pack publish failed", { code: error?.code, status: error?.status });
    sendError(response, error);
  }
};

function packObjectPath(pack) {
  const language = segment(pack.language);
  const baseLanguage = segment(pack.baseLanguage);
  const id = segment(pack.id);
  const version = segment(pack.version);
  return `${language}/${baseLanguage}/${id}/${version}/${slugifyPackTitle(pack.title)}.fydorpack`;
}

function segment(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function clientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim()
    .replace(/[^a-fA-F0-9:.]/g, "")
    .slice(0, 80);
}
