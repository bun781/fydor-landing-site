"use strict";

const { assertServerConfig } = require("./config");
const { httpError } = require("./http");

const DEFAULT_PACK_BUCKET = "packs";

async function uploadPackObject(path, body, options = {}) {
  const config = assertServerConfig(options.env);
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

module.exports = { DEFAULT_PACK_BUCKET, storageObjectUrl, storagePublicUrl, uploadPackObject };
