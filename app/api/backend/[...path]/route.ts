import { NextRequest, NextResponse } from "next/server";

import { buildBackendTarget } from "@/lib/backend-target";
import { adminOrigin, authOrigin } from "@/lib/config";
import { isTrustedAdminRequest } from "@/lib/csrf";
import { refreshAccessToken } from "@/lib/oauth";
import { clearSession, readSession, writeSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (
    !isTrustedAdminRequest(
      request.method,
      request.headers.get("origin"),
      adminOrigin(),
      request.headers.get("x-nfv-admin-request"),
    )
  ) {
    return NextResponse.json({ error: "csrf_rejected" }, { status: 403 });
  }
  let session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.expiresAt < Date.now() + 30_000) {
    try {
      session = await refreshAccessToken(session);
      await writeSession(session);
    } catch {
      await clearSession();
      return NextResponse.json({ error: "session_expired" }, { status: 401 });
    }
  }
  const { path } = await context.params;
  const target = buildBackendTarget(authOrigin(), path, request.nextUrl.search);
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${session.accessToken}`);
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
    });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }
  if (response.status === 401) await clearSession();
  return new NextResponse(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
