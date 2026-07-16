import { Readable } from "node:stream";
import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
const require = createRequire(import.meta.url);
const handlers: Record<string, (request: LegacyRequest, response: LegacyResponse) => Promise<void> | void> = {
  admin: require("../../../legacy-api/admin.js"), contributor: require("../../../legacy-api/contributor.js"),
  moderation: require("../../../legacy-api/moderation.js"), library: require("../../../legacy-api/library.js"),
  "download-count": require("../../../legacy-api/download-count.js"), packs: require("../../../legacy-api/packs.js")
};

type LegacyRequest = Readable & { method: string; headers: Record<string, string>; query: Record<string, string>; body?: unknown; socket: { remoteAddress?: string } };
class LegacyResponse {
  statusCode = 200; body = ""; headers = new Headers(); ended = false;
  setHeader(name: string, value: string) { this.headers.set(name, value); }
  status(code: number) { this.statusCode = code; return this; }
  json(value: unknown) { this.headers.set("Content-Type", "application/json; charset=utf-8"); this.body = JSON.stringify(value); this.ended = true; return this; }
  send(value: unknown) { this.body = typeof value === "string" ? value : String(value); this.ended = true; return this; }
  end(value = "") { this.body = value; this.ended = true; return this; }
}

async function handle(request: NextRequest, context: { params: Promise<{ endpoint: string }> }) {
  const { endpoint } = await context.params; const handler = handlers[endpoint];
  if (!handler) return NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
  const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const headers = Object.fromEntries([...request.headers].map(([name, value]) => [name.toLowerCase(), value]));
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { return NextResponse.json({ error: { code: "invalid_json", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const legacy = Object.assign(Readable.from(text ? [Buffer.from(text)] : []), { method: request.method, headers, query, body, socket: { remoteAddress: headers["x-forwarded-for"] } }) as LegacyRequest;
  const response = new LegacyResponse();
  try { await handler(legacy, response); } catch { return NextResponse.json({ error: { code: "internal_error", message: "The request could not be completed." } }, { status: 500 }); }
  return new NextResponse(response.body, { status: response.statusCode, headers: response.headers });
}
export const GET = handle; export const POST = handle; export const OPTIONS = handle;
