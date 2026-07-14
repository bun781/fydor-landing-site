"use strict";

let configPromise;
let authPending = false;

export function getConfig() {
  configPromise ||= fetch("/api/client-config", { headers: { Accept: "application/json" }, credentials: "same-origin" }).then(expectJson);
  return configPromise;
}

export async function signIn(email, password) {
  const result = await authRequest({ action: "sign_in", email, password });
  return result.user;
}

export async function signUp(email, password, username) {
  const result = await authRequest({ action: "sign_up", email, password, username });
  return result.user || null;
}

export async function signOut() {
  await authRequest({ action: "sign_out" });
}

export async function getSession() {
  const response = await fetch("/api/auth", { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
  const result = await expectJson(response);
  return result.authenticated ? result.user : null;
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
    cache: "no-store"
  });
  return expectJson(response);
}

export async function expectJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data.error || data;
    const details = Array.isArray(error.issues) && error.issues.length
      ? ` ${error.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" ")}`
      : "";
    throw new Error(`${errorMessage(error, `Request failed (${response.status}).`)}${details}`);
  }
  return data;
}

export function text(element, value) { element.textContent = String(value ?? ""); }
export function randomActionId(prefix = "action") { return `${prefix}:${crypto.randomUUID()}`; }

export function setupAuth(onSignedIn) {
  const form = document.querySelector("[data-auth-form]");
  const status = document.querySelector("[data-auth-status]");
  const signup = document.querySelector("[data-sign-up]");
  const signout = document.querySelector("[data-sign-out]");

  const showSignedIn = async (user) => {
    if (form) form.hidden = true;
    if (signout) signout.hidden = false;
    await onSignedIn(user);
  };

  void getSession().then((user) => {
    if (user) return showSignedIn(user);
    if (signout) signout.hidden = true;
  }).catch((error) => {
    if (status) status.textContent = errorMessage(error, "Unable to check the sign-in session.");
  });

  form?.addEventListener("submit", async (event) => {
    if (authPending) return;
    event.preventDefault();
    if (status) status.textContent = "Signing in…";
    setAuthPending(form, true);
    try {
      const data = new FormData(form);
      const user = await signIn(String(data.get("email")), String(data.get("password")));
      if (!user) throw new Error("Unable to sign in.");
      if (status) status.textContent = `Signed in as ${user.email}.`;
      await showSignedIn(user);
    } catch (error) {
      if (status) status.textContent = errorMessage(error);
    } finally { setAuthPending(form, false); }
  });

  signup?.addEventListener("click", async () => {
    if (authPending) return;
    const data = new FormData(form);
    const usernameInput = form?.querySelector("[name=\"username\"]");
    if (usernameInput) {
      usernameInput.required = true;
      usernameInput.setAttribute("aria-required", "true");
      const valid = form.reportValidity();
      usernameInput.required = false;
      usernameInput.removeAttribute("aria-required");
      if (!valid) return;
    }
    if (status) status.textContent = "Creating account…";
    setAuthPending(form, true);
    try {
      const user = await signUp(String(data.get("email")), String(data.get("password")), String(data.get("username")));
      if (!user) {
        if (status) status.textContent = "Account created. Check your email, then sign in.";
        return;
      }
      if (status) status.textContent = `Signed in as ${user.email}.`;
      await showSignedIn(user);
    } catch (error) {
      if (status) status.textContent = errorMessage(error);
    } finally { setAuthPending(form, false); }
  });

  signout?.addEventListener("click", async () => {
    if (authPending) return;
    authPending = true;
    signout.disabled = true;
    try { await signOut(); location.reload(); }
    catch (error) { if (status) status.textContent = errorMessage(error, "Unable to sign out."); }
    finally { authPending = false; signout.disabled = false; }
  });
}

async function authRequest(body) {
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
    cache: "no-store"
  });
  return expectJson(response);
}

function setAuthPending(form, pending) {
  authPending = pending;
  for (const control of form?.querySelectorAll("button, input, textarea, select") || []) control.disabled = pending;
}

function errorMessage(error, fallback = "Request failed.") {
  const message = error instanceof Error
    ? error.message
    : String(error?.message || (typeof error?.error === "string" ? error.error : "") || error?.msg || error?.error_description || fallback);
  if (/rate limit/i.test(message) || /too many requests/i.test(message)) return `${message} Please wait a moment and try again.`;
  return message || fallback;
}
