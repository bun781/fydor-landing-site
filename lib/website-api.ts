"use client";

import { createClient } from "@/lib/supabase/browser";

export async function api<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in is required.");

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });
  return readJson<T>(response);
}

export async function publicApi<T>(path: string): Promise<T> {
  return readJson<T>(await fetch(path, { cache: "no-store" }));
}

export async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data as T;
  const error = data.error ?? data;
  throw new Error(String(error.message ?? error.error ?? `Request failed (${response.status}).`));
}
