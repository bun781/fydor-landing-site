"use strict";

const { httpError } = require("./http");

async function rateLimit(key, limit = 60, windowSeconds = 60) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.VERCEL_ENV === "production") throw httpError(503, "rate_limit_unavailable", "Request protection is not configured.");
    return;
  }
  const bucket = `fydor:rate:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["INCR", bucket])
  });
  if (!response.ok) throw httpError(503, "rate_limit_unavailable", "Request protection is temporarily unavailable.");
  const data = await response.json();
  const count = Number(data.result);
  if (count === 1) {
    await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(["EXPIRE", bucket, windowSeconds]) });
  }
  if (count > limit) throw httpError(429, "rate_limited", "Too many requests. Try again shortly.");
}

module.exports = { rateLimit };
