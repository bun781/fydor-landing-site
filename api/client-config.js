"use strict";

const { assertServerConfig, PROVIDER_URLS } = require("../lib/config");
const { handleOptions, requireMethod, send, sendError, setCors } = require("../lib/http");

module.exports = function handler(request, response) {
  if (handleOptions(request, response, { public: true, methods: "GET, OPTIONS" })) return;
  setCors(request, response, { public: true });
  try {
    requireMethod(request, ["GET"]);
    const config = assertServerConfig();
    response.setHeader("Cache-Control", "public, max-age=300");
    send(response, 200, {
      webOrigin: config.origin,
      providerUrls: PROVIDER_URLS,
      supabaseUrl: config.supabase,
      supabasePublishableKey: config.supabasePublishableKey
    });
  } catch (error) { sendError(response, error); }
};
