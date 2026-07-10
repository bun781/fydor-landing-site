"use strict";

const { httpError } = require("./http");

async function rateLimit(key, limit = 60, windowSeconds = 60, options = {}) {
  const env = options.env || process.env;
  const request = options.fetch || fetch;
  const required = options.required !== false;
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (required && env.VERCEL_ENV === "production") throw httpError(503, "rate_limit_unavailable", "Request protection is not configured.");
    if (!required) logOptionalBypass("not_configured");
    return;
  }
  try {
    const bucket = `fydor:rate:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const response = await request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["INCR", bucket])
    });
    if (!response.ok) throw new RateLimitDependencyError(response.status);
    const data = await response.json();
    const count = Number(data.result);
    if (!Number.isFinite(count)) throw new RateLimitDependencyError();
    if (count === 1) {
      const expiry = await request(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(["EXPIRE", bucket, windowSeconds]) });
      if (!expiry.ok) throw new RateLimitDependencyError(expiry.status);
    }
    if (count > limit) throw httpError(429, "rate_limited", "Too many requests. Try again shortly.");
  } catch (error) {
    if (error?.status === 429) throw error;
    if (required) throw httpError(503, "rate_limit_unavailable", "Request protection is temporarily unavailable.");
    logOptionalBypass(error?.status ? "upstream_unavailable" : "request_failed", error?.status);
  }
}

class RateLimitDependencyError extends Error {
  constructor(status) { super("Rate limiter dependency failed."); this.status = status; }
}

function logOptionalBypass(reason, upstreamStatus) {
  console.warn("rate limiter bypassed for optional public read", {
    event: "rate_limit_optional_bypass",
    reason,
    ...(upstreamStatus ? { upstreamStatus } : {})
  });
}

module.exports = { rateLimit };
