"use strict";

const { assertServerConfig } = require("./config");
const { httpError } = require("./http");

async function db(path, options = {}) {
  const config = assertServerConfig();
  const url = `${config.supabase}/rest/v1/${path}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...serviceAuthHeaders(config.supabaseSecretKey),
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const message = String(data?.message || data?.hint || `Database request failed (${response.status}).`).replace(/service[_ -]?role|jwt|token|key/gi, "credential");
    const duplicate = /^duplicate_pack\s*:/i.test(message);
    const status = duplicate || response.status === 409 ? 409 : response.status === 404 ? 404 : 400;
    throw httpError(status, duplicate ? "duplicate_pack" : response.status === 409 ? "conflict" : "database_rejected", duplicate ? message.replace(/^duplicate_pack\s*:\s*/i, "") : message);
  }
  return data;
}

function serviceAuthHeaders(key) {
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

function rpc(name, body, options) {
  return db(`rpc/${encodeURIComponent(name)}`, { method: "POST", body, ...options });
}

module.exports = { db, rpc };
