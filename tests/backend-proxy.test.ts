import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  adminOrigin: () => "https://admin.example.test",
  authOrigin: () => "https://auth.example.test",
}));
vi.mock("@/lib/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oauth")>();
  return {
    ...actual,
    refreshAccessToken: vi.fn(async (session) => session),
  };
});
vi.mock("@/lib/session", () => ({
  clearSession: vi.fn(),
  readSession: vi.fn(async () => ({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    user: {},
  })),
  writeSession: vi.fn(),
}));

import { DELETE, GET, PATCH, POST } from "@/app/api/backend/[...path]/route";
import { AuthServiceUnavailableError, refreshAccessToken } from "@/lib/oauth";
import { clearSession, readSession, writeSession } from "@/lib/session";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("admin backend proxy", () => {
  it("keeps the bearer token server-side for an allowed Membership lookup", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [] }, { headers: { "X-Upstream-Secret": "do-not-forward" } }),
      );
    vi.stubGlobal("fetch", upstream);

    const response = await GET(
      new NextRequest(
        "https://admin.example.test/api/backend/admin/memberships?page=1&search=0912",
      ),
      { params: Promise.resolve({ path: ["admin", "memberships"] }) },
    );

    expect(response.status).toBe(200);
    const init = upstream.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(response.headers.get("authorization")).toBeNull();
    expect(response.headers.get("x-upstream-secret")).toBeNull();
    expect(await response.json()).toEqual({ data: [] });
  });

  it("allows manual assignment and rejects removed payment/request paths", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { id: "membership-id" } }));
    vi.stubGlobal("fetch", upstream);

    const allowed = await POST(
      new NextRequest("https://admin.example.test/api/backend/admin/memberships", {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path: ["admin", "memberships"] }) },
    );
    expect(allowed.status).toBe(200);

    upstream.mockClear();
    const response = await GET(
      new NextRequest("https://admin.example.test/api/backend/admin/membership-payment-settings"),
      { params: Promise.resolve({ path: ["admin", "membership-payment-settings"] }) },
    );

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects non-allowlisted proxy paths before forwarding", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await POST(
      new NextRequest("https://admin.example.test/api/backend/admin/membership-requests", {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path: ["admin", "membership-requests"] }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "backend_route_not_allowed" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("only proxies POST for the Membership revoke action", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { status: "revoked" } }));
    vi.stubGlobal("fetch", upstream);
    const path = ["admin", "memberships", "membership-id", "revoke"];
    const mutationHeaders = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
    };

    const allowed = await POST(
      new NextRequest(
        "https://admin.example.test/api/backend/admin/memberships/membership-id/revoke",
        { method: "POST", headers: mutationHeaders, body: JSON.stringify({ reason: "test" }) },
      ),
      { params: Promise.resolve({ path }) },
    );
    expect(allowed.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(String(upstream.mock.calls[0][0])).toBe(
      "https://auth.example.test/api/v1/admin/memberships/membership-id/revoke",
    );

    upstream.mockClear();
    const blockedGet = await GET(
      new NextRequest(
        "https://admin.example.test/api/backend/admin/memberships/membership-id/revoke",
      ),
      { params: Promise.resolve({ path }) },
    );
    const blockedDelete = await DELETE(
      new NextRequest(
        "https://admin.example.test/api/backend/admin/memberships/membership-id/revoke",
        { method: "DELETE", headers: mutationHeaders },
      ),
      { params: Promise.resolve({ path }) },
    );
    const blockedAction = await POST(
      new NextRequest(
        "https://admin.example.test/api/backend/admin/memberships/membership-id/unknown",
        { method: "POST", headers: mutationHeaders },
      ),
      {
        params: Promise.resolve({
          path: ["admin", "memberships", "membership-id", "unknown"],
        }),
      },
    );

    expect([blockedGet.status, blockedDelete.status, blockedAction.status]).toEqual([
      404, 404, 404,
    ]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns a bounded timeout with no-store caching", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );

    const response = await GET(
      new NextRequest("https://admin.example.test/api/backend/admin/redemptions"),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );

    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "upstream_timeout" });
  });

  it("forwards exact Testimonial routes and blocks hard delete", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { id: "testimonial-id" } }));
    vi.stubGlobal("fetch", upstream);
    const mutationHeaders = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
    };
    const detailPath = ["admin", "testimonials", "testimonial-id"];

    const patched = await PATCH(
      new NextRequest("https://admin.example.test/api/backend/admin/testimonials/testimonial-id", {
        method: "PATCH",
        headers: mutationHeaders,
        body: JSON.stringify({ featured: true }),
      }),
      { params: Promise.resolve({ path: detailPath }) },
    );
    expect(patched.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      "https://auth.example.test/api/v1/admin/testimonials/testimonial-id/",
    );

    upstream.mockClear();
    const removed = await DELETE(
      new NextRequest("https://admin.example.test/api/backend/admin/testimonials/testimonial-id", {
        method: "DELETE",
        headers: mutationHeaders,
      }),
      { params: Promise.resolve({ path: detailPath }) },
    );
    expect(removed.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("keeps the encrypted session when token refresh has a transient outage", async () => {
    vi.mocked(readSession).mockResolvedValueOnce({
      accessToken: "expired-access-token",
      refreshToken: "refresh-token",
      expiresAt: 0,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "admin@example.com",
        name: "Admin",
        locale: "vi",
        roles: ["website_admin"],
      },
    });
    vi.mocked(refreshAccessToken).mockRejectedValueOnce(new AuthServiceUnavailableError("offline"));

    const response = await GET(
      new NextRequest("https://admin.example.test/api/backend/admin/redemptions"),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream_unavailable" });
    expect(clearSession).not.toHaveBeenCalled();
    expect(writeSession).not.toHaveBeenCalled();
  });
});
