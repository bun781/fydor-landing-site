"use client";

export async function api<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
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
  throw new WebsiteApiError(
    String(error.message ?? error.error ?? `Request failed (${response.status}).`),
    String(error.code ?? "request_failed"),
    Array.isArray(error.issues) ? error.issues : Array.isArray(data.issues) ? data.issues : []
  );
}

export class WebsiteApiError extends Error {
  constructor(message: string, readonly code: string, readonly issues: Array<{ path: string; message: string }>) {
    super(message);
    this.name = "WebsiteApiError";
  }
}
