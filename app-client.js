"use strict";

let configPromise;
let accessToken = "";

export function getConfig() {
  configPromise ||= fetch("/api/client-config", { headers: { Accept: "application/json" } }).then(expectJson);
  return configPromise;
}

export async function signIn(email, password) {
  const config = await getConfig();
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await expectJson(response);
  accessToken = data.access_token;
  return data.user;
}

export async function signUp(email, password) {
  const config = await getConfig();
  const redirect = encodeURIComponent(`${config.webOrigin}/contribute.html`);
  const response = await fetch(`${config.supabaseUrl}/auth/v1/signup?redirect_to=${redirect}`, {
    method: "POST", headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  return expectJson(response);
}

export function signOut() { accessToken = ""; }
export function isSignedIn() { return Boolean(accessToken); }

export async function api(path, options = {}) {
  if (!accessToken) throw new Error("Sign in first.");
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json", ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: "no-store"
  });
  return expectJson(response);
}

export async function expectJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.msg || `Request failed (${response.status}).`);
  return data;
}

export function text(element, value) { element.textContent = String(value ?? ""); }
export function randomActionId(prefix = "action") { return `${prefix}:${crypto.randomUUID()}`; }

export function setupAuth(onSignedIn) {
  const form = document.querySelector("[data-auth-form]");
  const status = document.querySelector("[data-auth-status]");
  const signup = document.querySelector("[data-sign-up]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault(); status.textContent = "Signing in…";
    try {
      const data = new FormData(form);
      const user = await signIn(String(data.get("email")), String(data.get("password")));
      status.textContent = `Signed in as ${user.email}. Session is held in memory only.`;
      form.hidden = true; await onSignedIn(user);
    } catch (error) { status.textContent = error.message; }
  });
  signup?.addEventListener("click", async () => {
    const data = new FormData(form); status.textContent = "Creating account…";
    try { await signUp(String(data.get("email")), String(data.get("password"))); status.textContent = "Account created. Verify your email, then sign in."; }
    catch (error) { status.textContent = error.message; }
  });
}
