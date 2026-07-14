"use strict";

const { authenticate, clearSessionCookies, setSessionCookies, signIn, signUp, userSummary } = require("../lib/auth");
const { handleOptions, httpError, readJsonBody, requireMethod, requireSameOrigin, send, sendError, setCors } = require("../lib/http");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response, { methods: "GET, POST, OPTIONS" })) return;
  setCors(request, response);
  response.setHeader("Cache-Control", "no-store");
  try {
    requireMethod(request, ["GET", "POST"]);
    if (request.method === "GET") {
      try {
        const actor = await authenticate(request, response);
        return send(response, 200, { authenticated: true, user: actor });
      } catch (error) {
        if (error?.status === 401) return send(response, 200, { authenticated: false, user: null });
        throw error;
      }
    }

    requireSameOrigin(request);
    const body = await readJsonBody(request, 20_000);
    const action = String(body.action || "");
    if (action === "sign_out") {
      clearSessionCookies(response, request);
      return send(response, 200, { authenticated: false, user: null });
    }
    if (action !== "sign_in" && action !== "sign_up") throw httpError(400, "invalid_action", "Unsupported authentication action.");

    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!email || !password) throw httpError(400, "invalid_credentials", "Email and password are required.");
    const username = String(body.username || "").trim();
    if (action === "sign_up" && (!username || username.length > 64)) throw httpError(400, "invalid_username", "A username of 1 to 64 characters is required.");
    if (action === "sign_up" && password.length < 8) throw httpError(400, "invalid_password", "Password must be at least 8 characters.");
    const session = action === "sign_in"
      ? await signIn(email, password)
      : await signUp(email, password, username);

    if (!session?.access_token) {
      return send(response, 202, { authenticated: false, user: null, requiresEmailConfirmation: true });
    }
    setSessionCookies(response, session, request);
    return send(response, 200, { authenticated: true, user: userSummary(session.user) });
  } catch (error) {
    console.error("auth request failed", { code: error?.code, status: error?.status });
    sendError(response, error);
  }
};
