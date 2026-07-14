"use strict";

const { rpc: defaultRpc } = require("./db");
const { httpError } = require("./http");

async function rateLimit(key, limit = 60, windowSeconds = 60, options = {}) {
  const rpc = options.rpc || defaultRpc;
  const required = options.required !== false;
  try {
    const result = await rpc("enforce_rate_limit", {
      p_key: String(key || ""), p_limit: positiveInteger(limit, "limit"), p_window_seconds: positiveInteger(windowSeconds, "windowSeconds")
    });
    if (!result?.allowed) throw httpError(429, "rate_limited", "Too many requests. Try again shortly.");
  } catch (error) {
    if (error?.status === 429) throw error;
    if (required) throw httpError(503, "rate_limit_unavailable", "Request protection is temporarily unavailable.");
    console.warn("native rate limiter bypassed for optional public read", {
      event: "rate_limit_optional_bypass",
      reason: error?.status ? "database_rejected" : "request_failed"
    });
  }
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${name} must be a positive integer.`);
  return number;
}

module.exports = { rateLimit };
