"use strict";

const DEFAULT_PRODUCTION_ORIGIN = "https://fydor.vercel.app";
const PROVIDER_URLS = Object.freeze({
  chatgpt: "https://chatgpt.com/",
  claude: "https://claude.ai/"
});

function normalizeWebOrigin(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("FYDOR_WEB_ORIGIN is required.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("FYDOR_WEB_ORIGIN must be an absolute URL.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("FYDOR_WEB_ORIGIN cannot contain credentials, a query, or a fragment.");
  }
  if (!/^\/*$/.test(url.pathname)) throw new Error("FYDOR_WEB_ORIGIN cannot contain a path.");
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(options.allowLocalhost !== false && local && url.protocol === "http:")) {
    throw new Error("FYDOR_WEB_ORIGIN must use HTTPS (HTTP is allowed only for localhost). ");
  }
  return url.origin;
}

function configuredWebOrigin(env = process.env) {
  const previewOrigin = env.VERCEL_ENV === "preview" && env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "";
  return normalizeWebOrigin(env.FYDOR_WEB_ORIGIN || env.NEXT_PUBLIC_FYDOR_WEB_ORIGIN || env.VITE_FYDOR_WEB_ORIGIN || previewOrigin || DEFAULT_PRODUCTION_ORIGIN);
}

function webUrl(pathname, env = process.env) {
  const path = String(pathname || "/");
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Website paths must be root-relative.");
  return new URL(path, `${configuredWebOrigin(env)}/`).toString();
}

function supabasePublishableKey(env = process.env) {
  return env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "";
}

function supabaseSecretKey(env = process.env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function providerUrl(provider) {
  const url = PROVIDER_URLS[provider];
  if (!url) throw new Error("Unsupported chatbot provider.");
  return url;
}

function assertServerConfig(env = process.env) {
  configuredWebOrigin(env);
  if (!env.SUPABASE_URL) throw new Error("SUPABASE_URL is required.");
  if (!supabasePublishableKey(env)) throw new Error("SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required.");
  if (!supabaseSecretKey(env)) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.");
  const supabase = normalizeWebOrigin(env.SUPABASE_URL, { allowLocalhost: true });
  return {
    origin: configuredWebOrigin(env),
    supabase,
    supabasePublishableKey: supabasePublishableKey(env),
    supabaseSecretKey: supabaseSecretKey(env)
  };
}

module.exports = {
  DEFAULT_PRODUCTION_ORIGIN,
  PROVIDER_URLS,
  assertServerConfig,
  configuredWebOrigin,
  normalizeWebOrigin,
  providerUrl,
  supabasePublishableKey,
  supabaseSecretKey,
  webUrl
};
