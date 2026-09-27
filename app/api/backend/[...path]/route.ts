import { NextRequest, NextResponse } from "next/server";

import {
  buildBackendTarget,
  isAllowedBackendRequest,
  UUID_PATH_SEGMENT,
} from "@/lib/backend-target";
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

function invalidMembershipContractQuery(request: NextRequest, path: string[]) {
  const [, resource, id, action, extra] = path;
  if (resource === "csa-coupons") {
    const params = request.nextUrl.searchParams;
    if (id !== undefined) return params.size > 0;
    const allowed = new Set(["page", "status", "discount_type"]);
    return (
      [...params.keys()].some((key) => !allowed.has(key) || params.getAll(key).length !== 1) ||
      (params.has("page") && !/^[1-9]\d*$/u.test(params.get("page") ?? "")) ||
      (params.has("status") &&
        !["active", "inactive", "scheduled", "expired", "exhausted"].includes(
          params.get("status") ?? "",
        )) ||
      (params.has("discount_type") &&
        !["percent", "fixed"].includes(params.get("discount_type") ?? ""))
    );
  }
  if (resource === "csa-purchase-requests" && action === "payments") {
    return request.nextUrl.searchParams.size > 0;
  }
  if (resource === "membership-price-options" && action === "payment-plans") {
    return request.nextUrl.searchParams.size > 0;
  }
  if (resource !== "memberships" || !id || action !== "contract") return false;
  const parameters = request.nextUrl.searchParams;
  if (extra === undefined) return parameters.size > 0;
  if (extra !== "pdf") return true;
  const locales = parameters.getAll("locale");
  const versions = parameters.getAll("version_id");
  return (
    locales.length !== 1 ||
    !["vi", "en"].includes(locales[0]) ||
    versions.length > 1 ||
    (versions.length === 1 && !UUID_PATH_SEGMENT.test(versions[0])) ||
    [...parameters.keys()].some((key) => key !== "locale" && key !== "version_id")
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
  if (invalidMembershipContractQuery(request, path)) {
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
  const responseHeaders = new Headers({
    "Content-Type": response.headers.get("content-type") || "application/json",
    "Cache-Control": "private, no-store",
  });
  for (const name of ["content-disposition", "pragma", "x-content-type-options"]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
