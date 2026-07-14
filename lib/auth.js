"use strict";

const { assertServerConfig } = require("./config");
const { db, rpc } = require("./db");
const { httpError } = require("./http");

async function authenticate(request) {
  const user = await fetchUser(accessToken(request));

  if (!user?.id || !user.email) {
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

function accessToken(request) {
  const header = String(request?.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token && token.length <= 8192 ? token : null;
}

function requireRole(actor, allowed) {
  if (!actor.roles.some((role) => allowed.includes(role))) throw httpError(403, "forbidden", "You do not have permission for this action.");
}

module.exports = { accessToken, authenticate, requireRole };
