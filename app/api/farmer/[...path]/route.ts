import { NextRequest, NextResponse } from "next/server";

import { buildBackendTarget, UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { isApiObject } from "@/lib/client-error";
import { adminOrigin, authOrigin } from "@/lib/config";
import { FARM_TOKEN, validSupplyQuery } from "@/lib/farm-supply-request-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function failure(code: string, status: number) {
  return NextResponse.json({ errors: [{ code }] }, { status, headers: privateHeaders });
}

function allowedQuery(method: string, path: string[]) {
  const [resource, id] = path;
  if (path.length === 1 && resource === "supply-requests" && method === "POST") return [];
  if (method !== "GET") return null;
  if (path.length === 1) {
    if (resource === "farm") return [];
    if (resource === "products") return ["page", "search"];
    if (resource === "supply-requests") return ["page"];
  }
  if (path.length === 2 && resource === "supply-requests" && UUID_PATH_SEGMENT.test(id)) return [];
  return null;
}

const MAX_SUBMISSION_BYTES = 32_768;

async function readBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  let body = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SUBMISSION_BYTES) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return isApiObject(JSON.parse(body)) ? body : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const query = allowedQuery(request.method, path);
  if (!query) return failure("backend_route_not_allowed", 404);
  if (!validSupplyQuery(request.nextUrl.searchParams, query)) return failure("invalid_query", 400);
  const token = request.headers.get("x-farm-token");
  if (!token || !FARM_TOKEN.test(token)) return failure("invalid_farm_token", 403);
  const isWrite = request.method === "POST";
  let body: string | undefined;
  if (isWrite) {
    if (request.headers.get("origin") !== adminOrigin()) return failure("csrf_rejected", 403);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") return failure("invalid_content_type", 415);
    const input = await readBody(request);
    if (input === null) return failure("invalid_request_body", 400);
    body = input;
  }
  if (request.signal.aborted)
    return new NextResponse(null, { status: 499, headers: privateHeaders });

  const target = buildBackendTarget(authOrigin(), ["farmer", ...path], request.nextUrl.search);
  const deadline = AbortSignal.timeout(10_000);
  const signal =
    !isWrite && typeof AbortSignal.any === "function"
      ? AbortSignal.any([request.signal, deadline])
      : deadline;
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        "X-Farm-Token": token,
        Accept: "application/json",
        ...(isWrite ? { "Content-Type": "application/json" } : {}),
      },
      body,
      signal,
      redirect: "error",
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) return failure("invalid_response", 502);
    const type = response.headers.get("content-type");
    if (type?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
      return failure("invalid_response", 502);
    const headers = new Headers(privateHeaders);
    headers.set("Content-Type", type);
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) headers.set("Retry-After", retryAfter);
    return new NextResponse(response.body, { status: response.status, headers });
  } catch {
    if (!isWrite && request.signal.aborted)
      return new NextResponse(null, { status: 499, headers: privateHeaders });
    return failure(
      deadline.aborted ? "upstream_timeout" : "upstream_unavailable",
      deadline.aborted ? 504 : 502,
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
