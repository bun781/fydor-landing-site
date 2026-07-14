"use strict";

const { assertServerConfig } = require("./config");
const { db, rpc } = require("./db");
const { httpError } = require("./http");

const SESSION_COOKIE = "fydor_session";
const REFRESH_COOKIE = "fydor_refresh";

async function authenticate(request, response) {
  const cookies = parseCookies(request.headers.cookie);
  let user = await fetchUser(cookies[SESSION_COOKIE]);

  if (!user && cookies[REFRESH_COOKIE]) {
    const refreshed = await refreshSession(cookies[REFRESH_COOKIE]);
    if (refreshed) {
      setSessionCookies(response, refreshed, request);
      user = refreshed.user;
    }
  }

  if (!user?.id || !user.email) {
    clearSessionCookies(response, request);
    throw httpError(401, "unauthenticated", "Sign in is required.");
  }

  await rpc("ensure_profile", {
    p_user: user.id,
    p_email: user.email,
    p_username: user.user_metadata?.username || null,
    p_verified: user.email_confirmed_at || null
  });
  const rows = await db(`user_roles?select=roles(name),expires_at,suspended_at&user_id=eq.${encodeURIComponent(user.id)}`);
  const now = Date.now();
  const roles = rows
    .filter((row) => !row.suspended_at && (!row.expires_at || Date.parse(row.expires_at) > now))
    .map((row) => row.roles?.name)
    .filter(Boolean);
  return { id: user.id, email: user.email, verified: Boolean(user.email_confirmed_at), roles };
}

async function signIn(email, password) {
  const config = assertServerConfig();
  return supabaseAuth(config, "token?grant_type=password", { email, password });
}

async function signUp(email, password, username) {
  const config = assertServerConfig();
  return supabaseAuth(config, "signup", { email, password, data: { username } });
}

function setSessionCookies(response, session, request) {
  const cookies = [
    serializeCookie(SESSION_COOKIE, session.access_token, request),
    session.refresh_token ? serializeCookie(REFRESH_COOKIE, session.refresh_token, request) : null
  ].filter(Boolean);
  response.setHeader("Set-Cookie", cookies);
}

function clearSessionCookies(response, request) {
  response.setHeader("Set-Cookie", [
    serializeCookie(SESSION_COOKIE, "", request, "Max-Age=0"),
    serializeCookie(REFRESH_COOKIE, "", request, "Max-Age=0")
  ]);
}

function userSummary(user) {
  return { id: user.id, email: user.email, verified: Boolean(user.email_confirmed_at) };
}

async function fetchUser(accessToken) {
  if (!accessToken || accessToken.length > 8192) return null;
  const config = assertServerConfig();
  const response = await fetch(`${config.supabase}/auth/v1/user`, {
    headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id && user?.email ? user : null;
}

async function refreshSession(refreshToken) {
  if (!refreshToken || refreshToken.length > 8192) return null;
  const config = assertServerConfig();
  const response = await fetch(`${config.supabase}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  if (!response.ok) return null;
  const session = await response.json().catch(() => null);
  if (!session?.access_token || !session?.user?.id || !session.user.email) return null;
  return session;
}

async function supabaseAuth(config, path, body) {
  const response = await fetch(`${config.supabase}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : data?.msg || data?.error_description || data?.message;
    throw httpError(response.status, "authentication_failed", message || "Unable to authenticate.");
  }
  return data;
}

function serializeCookie(name, value, request, extra = "") {
  const attributes = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (!isLocalRequest(request)) attributes.push("Secure");
  if (extra) attributes.push(extra);
  return attributes.join("; ");
}

function isLocalRequest(request) {
  const header = String(request?.headers?.["x-forwarded-host"] || request?.headers?.host || "").split(",")[0].trim();
  const host = header.startsWith("[") ? header.slice(1, header.indexOf("]")) : header.split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function parseCookies(header) {
  const cookies = Object.create(null);
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    try { cookies[name] = decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { cookies[name] = ""; }
  }
  return cookies;
}

function requireRole(actor, allowed) {
  if (!actor.roles.some((role) => allowed.includes(role))) throw httpError(403, "forbidden", "You do not have permission for this action.");
}

module.exports = { authenticate, clearSessionCookies, parseCookies, requireRole, setSessionCookies, signIn, signUp, userSummary };
