import { NextRequest, NextResponse } from "next/server";

import { buildBackendTarget, isAllowedBackendRequest } from "@/lib/backend-target";
import { adminOrigin, authOrigin } from "@/lib/config";
import { isTrustedAdminRequest } from "@/lib/csrf";
import { AuthServiceUnavailableError, refreshAccessToken } from "@/lib/oauth";
import { clearSession, readSession, writeSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (
    !isTrustedAdminRequest(
      request.method,
      request.headers.get("origin"),
      adminOrigin(),
      request.headers.get("x-nfv-admin-request"),
    )
  ) {
    return jsonError("csrf_rejected", 403);
  }
  let session = await readSession();
  if (!session) return jsonError("unauthorized", 401);
  if (session.expiresAt < Date.now() + 30_000) {
    try {
      session = await refreshAccessToken(session);
      await writeSession(session);
    } catch (error) {
      if (error instanceof AuthServiceUnavailableError) {
        return jsonError("upstream_unavailable", 502);
      }
      await clearSession();
      return jsonError("session_expired", 401);
    }
  }
  const { path } = await context.params;
  if (!isAllowedBackendRequest(request.method, path)) {
    return jsonError("backend_route_not_allowed", 404);
  }
  const target = buildBackendTarget(authOrigin(), path, request.nextUrl.search);
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) headers.set("Accept-Language", acceptLanguage);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const method = request.method;
  let response: Response;
  try {
    response = await fetch(target, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name);
    return jsonError(timedOut ? "upstream_timeout" : "upstream_unavailable", timedOut ? 504 : 502);
  }
  if (response.status === 401) await clearSession();
  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
