"use strict";

import { randomBytes } from "node:crypto";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";

try { loadEnvFile(".env"); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("Auth probe requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
}

const hostname = new URL(url).hostname;
const email = `fydor-auth-probe-${Date.now()}@example.com`;
const password = `Probe-${randomBytes(18).toString("base64url")}`;
const signupEmail = `fydor-signup-probe-${Date.now()}@example.com`;
const signupPassword = `Signup-${randomBytes(18).toString("base64url")}`;
const persisted = new Map();
const storage = {
  getItem: (key) => persisted.get(key) ?? null,
  setItem: (key, value) => persisted.set(key, value),
  removeItem: (key) => persisted.delete(key)
};
const tracedFetch = async (input, init) => {
  const requestUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  console.info("[AUTH-SUPABASE] network request", {
    hostname: requestUrl.hostname,
    method: init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"),
    path: requestUrl.pathname
  });
  const response = await fetch(input, init);
  console.info("[AUTH-SUPABASE] network response", {
    hostname: requestUrl.hostname,
    path: requestUrl.pathname,
    status: response.status
  });
  return response;
};
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
let userId;
let signupUserId;

console.info("[AUTH-CONFIG] runtime probe configured", {
  hostname,
  publishableKeyExists: true,
  serviceRoleKeyExists: true
});

try {
  const signupClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: tracedFetch }
  });
  console.info("[AUTH-SUPABASE] call starting", { operation: "signUp" });
  const { data: signedUp, error: signupError } = await signupClient.auth.signUp({
    email: signupEmail,
    password: signupPassword
  });
  console.info("[AUTH-SUPABASE] call completed", {
    operation: "signUp",
    errorCode: signupError?.code,
    errorMessage: signupError?.message,
    sessionExists: Boolean(signedUp.session),
    userIdExists: Boolean(signedUp.user?.id)
  });
  if (signupError || !signedUp.user) throw signupError ?? new Error("Sign-up returned no user result.");
  signupUserId = signedUp.user.id;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (createError || !created.user) throw createError ?? new Error("Probe user was not created.");
  userId = created.user.id;

  const firstClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, storage },
    global: { fetch: tracedFetch }
  });
  console.info("[AUTH-SUPABASE] call starting", { operation: "signInWithPassword" });
  const { data: signedIn, error: signInError } = await firstClient.auth.signInWithPassword({ email, password });
  console.info("[AUTH-SUPABASE] call completed", {
    operation: "signInWithPassword",
    errorCode: signInError?.code,
    errorMessage: signInError?.message,
    sessionExists: Boolean(signedIn.session),
    userIdExists: Boolean(signedIn.user?.id)
  });
  if (signInError || !signedIn.session) throw signInError ?? new Error("Sign-in returned no session.");

  const nextClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, storage },
    global: { fetch: tracedFetch }
  });
  const { data: restored, error: restoreError } = await nextClient.auth.getSession();
  console.info("[AUTH-SESSION] session restored in a new client", {
    errorCode: restoreError?.code,
    sessionExists: Boolean(restored.session),
    userIdExists: Boolean(restored.session?.user.id)
  });
  if (restoreError || !restored.session) throw restoreError ?? new Error("Persisted session was not restored.");

  const { data: verified, error: verifyError } = await nextClient.auth.getUser();
  console.info("[AUTH-SESSION] authenticated request verified", {
    errorCode: verifyError?.code,
    userIdExists: Boolean(verified.user?.id)
  });
  if (verifyError || verified.user?.id !== userId) throw verifyError ?? new Error("Restored session did not identify the probe user.");

  console.info("[AUTH-PROBE] complete", {
    signupRequestReachedSupabase: true,
    authRequestReachedSupabase: true,
    sessionPersisted: true,
    authenticatedRequestSucceeded: true
  });
} finally {
  if (signupUserId) {
    const { error } = await admin.auth.admin.deleteUser(signupUserId);
    if (error) console.error("[AUTH-PROBE] signup cleanup failed", { errorCode: error.code, errorMessage: error.message });
    else console.info("[AUTH-PROBE] signup cleanup complete", { probeUserDeleted: true });
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("[AUTH-PROBE] cleanup failed", { errorCode: error.code, errorMessage: error.message });
    else console.info("[AUTH-PROBE] cleanup complete", { probeUserDeleted: true });
  }
}
