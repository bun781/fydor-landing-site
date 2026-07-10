"use strict";

const { configuredWebOrigin } = require("./config");

function setCors(request, response, options = {}) {
  const configured = configuredWebOrigin();
  const origin = request.headers.origin;
  const preview = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (options.public) response.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && (origin === configured || origin === preview)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  response.setHeader("Access-Control-Allow-Methods", options.methods || "GET, POST, OPTIONS");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
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
  if (request.body && typeof request.body === "object") return request.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw httpError(413, "payload_too_large", "Request payload is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "invalid_json", "Request body must be valid JSON.");
  }
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
      message: safe ? error.message : "The request could not be completed."
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

module.exports = { handleOptions, httpError, readJsonBody, requireMethod, safeServerError, send, sendError, setCors };
