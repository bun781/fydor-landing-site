"use strict";

const { assertServerConfig } = require("./config");
const { db, rpc } = require("./db");
const { httpError } = require("./http");

async function authenticate(request) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) throw httpError(401, "unauthenticated", "Sign in is required.");
  const token = authorization.slice(7).trim();
  if (!token || token.length > 8192) throw httpError(401, "unauthenticated", "The session is invalid.");
  const config = assertServerConfig();
  const authResponse = await fetch(`${config.supabase}/auth/v1/user`, {
    headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${token}` }
  });
  if (!authResponse.ok) throw httpError(401, "unauthenticated", "The session is invalid or expired.");
  const user = await authResponse.json();
  if (!user.id || !user.email) throw httpError(401, "unauthenticated", "The session is invalid.");
  await rpc("ensure_profile", {
    p_user: user.id,
    p_email: user.email,
    p_username: user.user_metadata?.username || null,
    p_verified: user.email_confirmed_at || null
  });
  const rows = await db(`user_roles?select=roles(name),expires_at,suspended_at&user_id=eq.${encodeURIComponent(user.id)}`);
  const now = Date.now();
  const roles = rows.filter((row) => !row.suspended_at && (!row.expires_at || Date.parse(row.expires_at) > now)).map((row) => row.roles?.name).filter(Boolean);
  return { id: user.id, email: user.email, verified: Boolean(user.email_confirmed_at), roles };
}

function requireRole(actor, allowed) {
  if (!actor.roles.some((role) => allowed.includes(role))) throw httpError(403, "forbidden", "You do not have permission for this action.");
}

module.exports = { authenticate, requireRole };
