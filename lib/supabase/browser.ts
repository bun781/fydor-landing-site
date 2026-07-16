"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase browser configuration is missing.");
  console.info("[AUTH-CONFIG] Supabase browser client configured", {
    hostname: new URL(url).hostname,
    publishableKeyExists: Boolean(key)
  });
  return createBrowserClient(url, key);
}
