"use strict";

const { configuredWebOrigin } = require("./config");

const DANGEROUS_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 50_000;

function setCors(request, response, options = {}) {
  const configured = configuredWebOrigin();
  const origin = request.headers.origin;
  const preview = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (options.public) response.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && (origin === configured || origin === preview || isTrustedDesktopOrigin(origin))) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  response.setHeader("Access-Control-Allow-Methods", options.methods || "GET, POST, OPTIONS");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
}

function isTrustedDesktopOrigin(origin) {
  try {
    const url = new URL(origin);
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
    if ((url.protocol === "http:" || url.protocol === "https:") && (localHosts.has(url.hostname) || url.hostname === "tauri.localhost")) return true;
    return (url.protocol === "tauri:" || url.protocol === "asset:") && (url.hostname === "localhost" || url.hostname === "tauri.localhost");
  } catch {
    return false;
  }
}

function handleOptions(request, response, options) {
  setCors(request, response, options);
  if (request.method !== "OPTIONS") return false;
  response.status(204).end();
  return true;
}

async function readJsonBody(request, maxBytes = 1_100_000) {
  const length = Number(request.headers["content-length"] || 0);
  if (length > maxBytes) throw httpError(413, "payload_too_large", "Request payload is too large.");
  if (request.body && typeof request.body === "object") return sanitizeJsonValue(request.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw httpError(413, "payload_too_large", "Request payload is too large.");
    chunks.push(chunk);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "invalid_json", "Request body must be valid JSON.");
  }
  return sanitizeJsonValue(parsed);
}

function sanitizeJsonValue(value, path = "$", depth = 0, state = { nodes: 0 }) {
  if (depth > MAX_JSON_DEPTH) throw httpError(400, "invalid_json", `Request JSON nesting exceeds ${MAX_JSON_DEPTH} levels.`);
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES) throw httpError(400, "invalid_json", "Request JSON contains too many values.");
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item, index) => sanitizeJsonValue(item, `${path}[${index}]`, depth + 1, state));
  if (!isPlainJsonRecord(value)) throw httpError(400, "invalid_json", "Request body must contain JSON values only.");

  const output = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (DANGEROUS_JSON_KEYS.has(key)) throw httpError(400, "invalid_json", `Dangerous JSON key: ${key}.`);
    output[key] = sanitizeJsonValue(item, `${path}.${key}`, depth + 1, state);
  }
  return output;
}

function send(response, status, data) {
  response.status(status).json(data);
}

function sendError(response, error) {
  const status = Number(error?.status) || 500;
  const safe = status < 500 || error?.safe === true;
  response.status(status).json({
    error: {
      code: safe ? (error.code || "request_failed") : "internal_error",
      message: safe ? error.message : "The request could not be completed.",
      ...(safe && Array.isArray(error.issues) ? { issues: error.issues } : {})
    }
  });
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function safeServerError(status, code, message) {
  const error = httpError(status, code, message);
  error.safe = true;
  return error;
}

function requireMethod(request, allowed) {
  if (!allowed.includes(request.method)) throw httpError(405, "method_not_allowed", "Method not allowed.");
}

function isPlainJsonRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = { handleOptions, httpError, isTrustedDesktopOrigin, readJsonBody, requireMethod, safeServerError, sanitizeJsonValue, send, sendError, setCors };
