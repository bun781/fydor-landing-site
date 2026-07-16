"use strict";

const { handleOptions, httpError, requireMethod, sendError, setCors } = require("../lib/http");

// Kept as a compatibility response for older desktop callers. Publication is
// intentionally owned by the authenticated contributor/moderation pipeline.
module.exports = async function handler(request, response) {
  if (handleOptions(request, response, { public: true, methods: "POST, OPTIONS" })) return;
  setCors(request, response, { public: true, methods: "POST, OPTIONS" });
  response.setHeader("Cache-Control", "no-store");
  try {
    requireMethod(request, ["POST"]);
    throw httpError(410, "publication_requires_moderation", "Direct pack publishing is disabled. Submit the pack from the authenticated contributor workspace for moderation.");
  } catch (error) {
    console.error("legacy direct pack publish rejected", { code: error?.code, status: error?.status });
    sendError(response, error);
  }
};
