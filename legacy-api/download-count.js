"use strict";

const { rpc } = require("../lib/db");
const { requireSameOrigin } = require("../lib/http");
const { rateLimit } = require("../lib/rate-limit");

const BASE_DOWNLOAD_COUNT = 162;

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  try {
    if (request.method === "POST") {
      requireSameOrigin(request);
      await rateLimit(`download:${clientKey(request)}`, 30, 60);
    }
    const count = normalizeCount(await rpc("download_count", {
      p_increment: request.method === "POST", p_base_count: BASE_DOWNLOAD_COUNT
    }));
    return response.status(200).json({ count });
  } catch {
    return response.status(503).json({
      count: BASE_DOWNLOAD_COUNT,
      error: "Download counter storage is temporarily unavailable."
    });
  }
};

function normalizeCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= BASE_DOWNLOAD_COUNT ? count : BASE_DOWNLOAD_COUNT;
}

function clientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0].trim().replace(/[^a-fA-F0-9:.]/g, "").slice(0, 80);
}
