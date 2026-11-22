import { NextRequest, NextResponse } from "next/server";

import {
  buildBackendTarget,
  isAllowedBackendRequest,
  PROVINCE_CODE,
  UUID_PATH_SEGMENT,
} from "@/lib/backend-target";
import { adminOrigin, authOrigin } from "@/lib/config";
import { ADMIN_PAGE_SESSION_HEADER, isTrustedAdminRequest } from "@/lib/csrf";
import { AuthServiceUnavailableError, refreshAccessToken } from "@/lib/oauth";
import { adminSessionBinding, clearSession, readSession, writeSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function clientClosed() {
  return new NextResponse(null, {
    status: 499,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function invalidLocale(params: URLSearchParams, required = false) {
  const locales = params.getAll("locale");
  if (locales.length === 0) return required;
  return locales.length !== 1 || !["vi", "en"].includes(locales[0]);
}

function hasDuplicateQuery(params: URLSearchParams, ...keys: string[]) {
  return keys.some((key) => params.getAll(key).length > 1);
}

function invalidBackendQuery(request: NextRequest, path: string[]) {
  const params = request.nextUrl.searchParams;
  if (path[0] === "public" && path[1] === "shipping-areas") {
    return invalidLocale(params, true) || [...params.keys()].some((key) => key !== "locale");
  }
  if (path[0] === "administrative-units" && path[1] === "wards") {
    const codes = params.getAll("province");
    return codes.length !== 1 || !PROVINCE_CODE.test(codes[0]);
  }
  const [, resource, id, action, extra] = path;
  if (resource === "users") {
    if (request.method === "POST") return action !== "points" && params.size > 0;
    if (action === "points") return hasDuplicateQuery(params, "page");
    if (id !== undefined) return hasDuplicateQuery(params, "invited_page");
    return hasDuplicateQuery(params, "page", "search", "status");
  }
  if (resource === "store-orders") {
    if (id !== undefined) return params.size > 0;
    const allowed = new Set(["page", "page_size", "search", "status", "payment_status", "sort"]);
    const statuses = new Set([
      "payment_pending",
      "pending_review",
      "payment_review",
      "pending_delivery",
      "delivered",
      "cancelled",
    ]);
    const paymentStatuses = new Set([
      "not_required",
      "unconfirmed",
      "received",
      "refund_required",
      "refunded",
    ]);
    const sorts = new Set(["created_desc", "created_asc", "deadline_asc", "total_desc"]);
    const positiveIntegerWithin = (key: string, maximum: bigint) => {
      const value = params.get(key) ?? "";
      return /^[1-9]\d*$/u.test(value) && BigInt(value) <= maximum;
    };
    return (
      [...params.keys()].some((key) => !allowed.has(key) || params.getAll(key).length !== 1) ||
      (params.has("page") && !positiveIntegerWithin("page", 10_000n)) ||
      (params.has("page_size") && !positiveIntegerWithin("page_size", 50n)) ||
      (params.has("search") && (params.get("search")?.length ?? 0) > 200) ||
      (params.has("status") && !statuses.has(params.get("status") ?? "")) ||
      (params.has("payment_status") && !paymentStatuses.has(params.get("payment_status") ?? "")) ||
      (params.has("sort") && !sorts.has(params.get("sort") ?? ""))
    );
  }
  if (resource === "vouchers" || resource === "csa-coupons") {
    if (id !== undefined) return params.size > 0;
    const allowed = new Set(["page", "status", "discount_type", "application_scope"]);
    return (
      [...params.keys()].some((key) => !allowed.has(key) || params.getAll(key).length !== 1) ||
      (params.has("page") && !/^[1-9]\d*$/u.test(params.get("page") ?? "")) ||
      (params.has("status") &&
        !["active", "inactive", "scheduled", "expired", "exhausted"].includes(
          params.get("status") ?? "",
        )) ||
      (params.has("discount_type") &&
        !["percent", "fixed"].includes(params.get("discount_type") ?? "")) ||
      (params.has("application_scope") &&
        !["csa", "store", "both"].includes(params.get("application_scope") ?? ""))
    );
  }
  if (resource === "csa-purchase-requests" && action === "payments") {
    return params.size > 0;
  }
  if (resource === "membership-price-options" && action === "payment-plans") {
    return params.size > 0;
  }
  if (request.method === "GET") {
    if (
      (resource === "csa-rounds" && (id === undefined || action === "selections")) ||
      (resource === "csa-selections" && action === "events")
    ) {
      return invalidLocale(params) || hasDuplicateQuery(params, "page", "page_size");
    }
    if (id === undefined && resource === "store-products") {
      return hasDuplicateQuery(params, "page", "category_id");
    }
    if (id === undefined && resource === "testimonials") {
      return hasDuplicateQuery(params, "page", "page_size", "search", "status", "type");
    }
  }
  if (resource !== "memberships" && resource !== "membership-usage") return false;
  if (action !== "contract") {
    return invalidLocale(params) || (action === "history" && hasDuplicateQuery(params, "page"));
  }
  if (extra === undefined) return params.size > 0;
  const versions = params.getAll("version_id");
  return (
    invalidLocale(params, true) ||
    versions.length > 1 ||
    (versions.length === 1 && !UUID_PATH_SEGMENT.test(versions[0])) ||
    [...params.keys()].some((key) => key !== "locale" && key !== "version_id")
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
  if (request.headers.get(ADMIN_PAGE_SESSION_HEADER) !== adminSessionBinding(session)) {
    return jsonError("session_changed", 409);
  }
  const { path } = await context.params;
  if (!isAllowedBackendRequest(request.method, path) || invalidBackendQuery(request, path)) {
    return jsonError("backend_route_not_allowed", 404);
  }
  if (request.signal.aborted) return clientClosed();
  if (session.expiresAt < Date.now() + 30_000) {
    try {
      session = await refreshAccessToken(session);
      await writeSession(session);
    } catch (error) {
      if (error instanceof AuthServiceUnavailableError) {
        return jsonError("upstream_unavailable", 502);
      }
      await clearSession(session);
      return jsonError("session_expired", 401);
    }
  }
  // Refresh is shared between requests. Check for obsolescence once it settles.
  if (request.signal.aborted) return clientClosed();

  const method = request.method;
  const isRead = method === "GET";
  let body: ArrayBuffer | undefined;
  if (!isRead) {
    try {
      body = await request.arrayBuffer();
    } catch (error) {
      if (request.signal.aborted && Object.is(error, request.signal.reason)) return clientClosed();
      return jsonError("invalid_request_body", 400);
    }
    if (request.signal.aborted) return clientClosed();
  }

  const target = buildBackendTarget(authOrigin(), path, request.nextUrl.search);
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) headers.set("Accept-Language", acceptLanguage);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const deadline = AbortSignal.timeout(10_000);
  // Only upstream reads inherit client cancellation after dispatch.
  const signal =
    isRead && typeof AbortSignal.any === "function"
      ? AbortSignal.any([request.signal, deadline])
      : deadline;
  let response: Response;
  try {
    signal.throwIfAborted();
    response = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch (error) {
    const aborted = signal.aborted && Object.is(error, signal.reason);
    if (aborted && isRead && request.signal.aborted && Object.is(error, request.signal.reason))
      return clientClosed();
    const timedOut = aborted && deadline.aborted && Object.is(error, deadline.reason);
    return jsonError(timedOut ? "upstream_timeout" : "upstream_unavailable", timedOut ? 504 : 502);
  }
  if (response.status === 401) await clearSession(session);
  const responseHeaders = new Headers({ "Cache-Control": "private, no-store" });
  for (const name of ["content-type", "content-disposition", "pragma", "x-content-type-options"]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // Forward the readable body directly. A later stream error reaches the consumer.
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
