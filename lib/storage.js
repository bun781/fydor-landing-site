"use strict";

const { assertServerConfig } = require("./config");
const { httpError, safeServerError } = require("./http");

const DEFAULT_PACK_BUCKET = "packs";

async function uploadPackObject(path, body, options = {}) {
  const config = storageConfig(options.env);
  const bucket = normalizeBucket(options.bucket || process.env.SUPABASE_PACK_BUCKET || DEFAULT_PACK_BUCKET);
  const objectUrl = storageObjectUrl(config.supabase, bucket, path);
  const response = await fetch(objectUrl, {
    method: "POST",
    headers: {
      apikey: config.supabaseSecretKey,
      Authorization: `Bearer ${config.supabaseSecretKey}`,
      "Content-Type": options.contentType || "application/json",
      "Cache-Control": "3600",
      "x-upsert": options.upsert === false ? "false" : "true"
    },
    body
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const message = String(data?.message || data?.error || `Storage request failed (${response.status}).`)
      .replace(/service[_ -]?role|jwt|token|key|bearer/gi, "credential");
    throw httpError(response.status === 404 ? 404 : 400, "storage_rejected", message);
  }
  return {
    bucket,
    path,
    publicUrl: storagePublicUrl(config.supabase, bucket, path),
    storageResponse: data
  };
}

async function listPackObjects(options = {}) {
  const config = storageConfig(options.env);
  const bucket = normalizeBucket(options.bucket || process.env.SUPABASE_PACK_BUCKET || DEFAULT_PACK_BUCKET);
  const request = options.fetch || fetch;
  const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 1000);
  const objects = [];
  const pending = [""];

  while (pending.length && objects.length < limit) {
    const prefix = pending.shift();
    const rows = await listStorageFolder(config, bucket, prefix, limit - objects.length, request);
    for (const row of rows) {
      const name = String(row?.name || "");
      if (!name) continue;
      const path = `${prefix}${name}`;
      if (row?.id) {
        if (path.endsWith(".fydorpack")) objects.push({ path, createdAt: row.created_at, updatedAt: row.updated_at, size: row.metadata?.size });
      } else if (pending.length + objects.length < limit) {
        pending.push(`${path}/`);
      }
    }
  }
  return objects;
}

async function readPackObject(path, options = {}) {
  const config = storageConfig(options.env);
  const bucket = normalizeBucket(options.bucket || process.env.SUPABASE_PACK_BUCKET || DEFAULT_PACK_BUCKET);
  const response = await (options.fetch || fetch)(storageObjectUrl(config.supabase, bucket, path), {
    headers: { apikey: config.supabaseSecretKey, Authorization: `Bearer ${config.supabaseSecretKey}` }
  });
  if (response.status === 404) throw httpError(404, "not_found", "Published pack not found.");
  if (!response.ok) throw safeServerError(503, "storage_unavailable", "The public pack library is temporarily unavailable. Please try again shortly.");
  return response.text();
}

async function listStorageFolder(config, bucket, prefix, limit, request) {
  let response;
  try {
    response = await request(`${config.supabase}/storage/v1/object/list/${encodePath(bucket)}`, {
      method: "POST",
      headers: {
        apikey: config.supabaseSecretKey,
        Authorization: `Bearer ${config.supabaseSecretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prefix, limit, offset: 0, sortBy: { column: "created_at", order: "desc" } })
    });
  } catch {
    throw safeServerError(503, "storage_unavailable", "The public pack library is temporarily unavailable. Please try again shortly.");
  }
  if (!response.ok) throw safeServerError(503, "storage_unavailable", "The public pack library is temporarily unavailable. Please try again shortly.");
  const rows = await response.json().catch(() => null);
  if (!Array.isArray(rows)) throw safeServerError(503, "storage_unavailable", "The public pack library is temporarily unavailable. Please try again shortly.");
  return rows;
}

function storageConfig(env) {
  try {
    return assertServerConfig(env);
  } catch (error) {
    throw safeServerError(500, "configuration_error", error?.message || "Supabase Storage is not configured.");
  }
}

function storageObjectUrl(supabaseUrl, bucket, path) {
  return `${supabaseUrl}/storage/v1/object/${encodePath(bucket)}/${encodeObjectPath(path)}`;
}

function storagePublicUrl(supabaseUrl, bucket, path) {
  return `${supabaseUrl}/storage/v1/object/public/${encodePath(bucket)}/${encodeObjectPath(path)}`;
}

function encodePath(value) {
  return encodeURIComponent(String(value));
}

function encodeObjectPath(value) {
  const path = String(value || "").replace(/^\/+/, "");
  if (!path || path.includes("..") || /[\\\u0000-\u001F\u007F]/u.test(path)) {
    throw httpError(400, "invalid_storage_path", "Storage path is invalid.");
  }
  return path.split("/").map(encodePath).join("/");
}

function normalizeBucket(value) {
  const bucket = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(bucket)) throw httpError(500, "invalid_storage_bucket", "Storage bucket is invalid.");
  return bucket;
}

module.exports = { DEFAULT_PACK_BUCKET, listPackObjects, readPackObject, storageObjectUrl, storagePublicUrl, uploadPackObject };
