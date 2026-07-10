"use strict";

let configPromise;
let accessToken = "";
let authPending = false;

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

export async function signUp(email, password, username) {
  const config = await getConfig();
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) throw new Error("Username is required.");
  const response = await fetch(`${config.supabaseUrl}/auth/v1/signup`, {
    method: "POST", headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { username: normalizedUsername } })
  });
  const data = await expectJson(response);
  if (!data.access_token) throw new Error("Account created.");
  accessToken = data.access_token;
  return data.user;
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
  if (!response.ok) throw new Error(errorMessage(data, `Request failed (${response.status}).`));
  return data;
}

export function text(element, value) { element.textContent = String(value ?? ""); }
export function randomActionId(prefix = "action") { return `${prefix}:${crypto.randomUUID()}`; }

export function setupAuth(onSignedIn) {
  const form = document.querySelector("[data-auth-form]");
  const status = document.querySelector("[data-auth-status]");
  const signup = document.querySelector("[data-sign-up]");
  form?.addEventListener("submit", async (event) => {
    if (authPending) return;
    event.preventDefault(); status.textContent = "Signing in…";
    setAuthPending(form, true);
    try {
      const data = new FormData(form);
      const user = await signIn(String(data.get("email")), String(data.get("password")));
      status.textContent = `Signed in as ${user.email}. Session is held in memory only.`;
      form.hidden = true; await onSignedIn(user);
    } catch (error) { status.textContent = errorMessage(error); }
    finally { setAuthPending(form, false); }
  });
  signup?.addEventListener("click", async () => {
    if (authPending) return;
    const data = new FormData(form);
    const usernameInput = form.querySelector("[name=\"username\"]");
    if (usernameInput) {
      usernameInput.required = true;
      usernameInput.setAttribute("aria-required", "true");
      const valid = form.reportValidity();
      usernameInput.required = false;
      usernameInput.removeAttribute("aria-required");
      if (!valid) return;
    }
    status.textContent = "Creating account…";
    setAuthPending(form, true);
    try {
      const user = await signUp(String(data.get("email")), String(data.get("password")), String(data.get("username")));
      status.textContent = `Signed in as ${user.email}. Session is held in memory only.`;
      form.hidden = true; await onSignedIn(user);
    }
    catch (error) { status.textContent = errorMessage(error); }
    finally { setAuthPending(form, false); }
  });
}

function setAuthPending(form, pending) {
  authPending = pending;
  for (const control of form?.querySelectorAll("button, input, textarea, select") || []) control.disabled = pending;
}

function errorMessage(error, fallback = "Request failed.") {
  const message = error instanceof Error
    ? error.message
    : String(
        error?.message
        || (typeof error?.error === "string" ? error.error : "")
        || error?.msg
        || error?.error_description
        || fallback
      );
  if (/rate limit/i.test(message) || /too many requests/i.test(message)) {
    return `${message} Please wait a moment and try again.`;
  }
  return message || fallback;
}
