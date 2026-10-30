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

import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/backend/[...path]/route";
import { AuthServiceUnavailableError, refreshAccessToken } from "@/lib/oauth";
import { clearSession, readSession, writeSession } from "@/lib/session";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("admin backend proxy", () => {
  const membershipId = "87703641-2dce-4cac-8fc4-91e55f03e95f";
  const versionId = "77777777-7777-4777-8777-777777777777";

  it("forwards allowed coupon filters and rejects duplicate or unknown query parameters", async () => {
    const path = ["admin", "csa-coupons"];
    const base = `https://admin.example.test/api/backend/${path.join("/")}`;
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);
    const allowed = await GET(new NextRequest(`${base}?status=active&discount_type=fixed&page=1`), {
      params: Promise.resolve({ path }),
    });
    expect(allowed.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toContain("/api/v1/admin/csa-coupons?status=active");
    upstream.mockClear();
    for (const query of [
      "?secret=1",
      "?status=active&status=inactive",
      "?page=0",
      "?discount_type=other",
    ]) {
      const blocked = await GET(new NextRequest(`${base}${query}`), {
        params: Promise.resolve({ path }),
      });
      expect(blocked.status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
    const detail = [...path, "24803641-2dce-4cac-8fc4-91e55f03e95f"];
    const blockedDetail = await GET(new NextRequest(`${base}/${detail[2]}?status=active`), {
      params: Promise.resolve({ path: detail }),
    });
    expect(blockedDetail.status).toBe(404);
  });

  it("requires an admin session for coupons and preserves upstream permission denial", async () => {
    const path = ["admin", "csa-coupons"];
    const request = new NextRequest("https://admin.example.test/api/backend/admin/csa-coupons");
    vi.mocked(readSession).mockResolvedValueOnce(null);
    expect((await GET(request, { params: Promise.resolve({ path }) })).status).toBe(401);
    const upstream = vi
      .fn()
      .mockResolvedValue(Response.json({ detail: "Forbidden" }, { status: 403 }));
    vi.stubGlobal("fetch", upstream);
    const forbidden = await GET(request, { params: Promise.resolve({ path }) });
    expect(forbidden.status).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("forwards payment-plan writes with server authorization and rejects extra queries", async () => {
    const option = "a0c0313a-85df-4c29-930a-f19a05f3d8c4";
    const path = ["admin", "membership-price-options", option, "payment-plans"];
    const url = `https://admin.example.test/api/backend/${path.join("/")}`;
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { id: option } }));
    vi.stubGlobal("fetch", upstream);
    const created = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        body: JSON.stringify({ name: "Full payment" }),
      }),
      { params: Promise.resolve({ path }) },
    );
    expect(created.status).toBe(200);
    expect(new Headers(upstream.mock.calls[0][1].headers).get("authorization")).toBe(
      "Bearer access-token",
    );
    upstream.mockClear();
    const blocked = await GET(new NextRequest(`${url}?original=true`), {
      params: Promise.resolve({ path }),
    });
    expect(blocked.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards only POST mark-refunded for a valid CSA purchase UUID", async () => {
    const requestId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const upstream = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { refund_status: "completed" } }));
    vi.stubGlobal("fetch", upstream);
    const path = ["admin", "csa-purchase-requests", requestId, "mark-refunded"];
    const url = `https://admin.example.test/api/backend/${path.join("/")}`;
    const allowed = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        body: JSON.stringify({ refund_note: "Đã chuyển lại tiền" }),
      }),
      { params: Promise.resolve({ path }) },
    );
    expect(allowed.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/admin/csa-purchase-requests/${requestId}/mark-refunded`,
    );
    expect(new Headers(upstream.mock.calls[0][1].headers).get("authorization")).toBe(
      "Bearer access-token",
    );

    upstream.mockClear();
    const blockedGet = await GET(new NextRequest(url), { params: Promise.resolve({ path }) });
    const invalidPath = ["admin", "csa-purchase-requests", "invalid-id", "mark-refunded"];
    const blockedId = await POST(
      new NextRequest(`https://admin.example.test/api/backend/${invalidPath.join("/")}`, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path: invalidPath }) },
    );
    const otherPath = ["admin", "csa-purchase-requests", requestId, "refund-again"];
    const blockedAction = await POST(
      new NextRequest(`https://admin.example.test/api/backend/${otherPath.join("/")}`, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path: otherPath }) },
    );
    expect([blockedGet.status, blockedId.status, blockedAction.status]).toEqual([404, 404, 404]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards installment mutations with server-side authorization and rejects query or unsafe paths", async () => {
    const requestId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { id: requestId } }));
    vi.stubGlobal("fetch", upstream);
    const path = ["admin", "csa-purchase-requests", requestId, "payments", "2", "confirm"];
    const url = `https://admin.example.test/api/backend/${path.join("/")}`;
    const allowed = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        body: JSON.stringify({ amount_paid: "500000", note: "" }),
      }),
      { params: Promise.resolve({ path }) },
    );
    expect(allowed.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/${path.join("/")}`,
    );
    expect(new Headers(upstream.mock.calls[0][1].headers).get("authorization")).toBe(
      "Bearer access-token",
    );
    upstream.mockClear();
    const blockedGet = await GET(new NextRequest(url), { params: Promise.resolve({ path }) });
    const blockedQuery = await POST(
      new NextRequest(`${url}?original=true`, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path }) },
    );
    const wrongPath = ["admin", "csa-purchase-requests", requestId, "payments", "0", "confirm"];
    const blockedSequence = await POST(
      new NextRequest(`https://admin.example.test/api/backend/${wrongPath.join("/")}`, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path: wrongPath }) },
    );
    expect([blockedGet.status, blockedQuery.status, blockedSequence.status]).toEqual([
      404, 404, 404,
    ]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(["vi", "en"])(
    "streams the current %s Membership contract PDF and preserves safe download headers",
    async (locale) => {
      const bytes = new Uint8Array([37, 80, 68, 70]);
      const upstream = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://auth.example.test/api/v1/admin/memberships/${membershipId}/contract/pdf?locale=${locale}`,
        );
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="contract.${locale}.pdf"`,
            "X-Content-Type-Options": "nosniff",
          },
        });
      });
      vi.stubGlobal("fetch", upstream);

      const response = await GET(
        new NextRequest(
          `https://admin.example.test/api/backend/admin/memberships/${membershipId}/contract/pdf?locale=${locale}`,
        ),
        {
          params: Promise.resolve({
            path: ["admin", "memberships", membershipId, "contract", "pdf"],
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toContain(`contract.${locale}.pdf`);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([37, 80, 68, 70]);
    },
  );

  it("forwards a validated Contract version PDF query without exposing credentials", async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="CSA-CODE.v1.vi.pdf"',
        },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const path = ["admin", "memberships", membershipId, "contract", "pdf"];
    const response = await GET(
      new NextRequest(
        `https://admin.example.test/api/backend/${path.join("/")}?locale=vi&version_id=${versionId}`,
      ),
      { params: Promise.resolve({ path }) },
    );
    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/admin/memberships/${membershipId}/contract/pdf?locale=vi&version_id=${versionId}`,
    );
    expect(response.headers.get("content-disposition")).toContain("CSA-CODE.v1.vi.pdf");
    expect(response.headers.get("authorization")).toBeNull();
  });

  it.each([
    `?locale=fr`,
    `?locale=vi&original=true`,
    `?locale=vi&locale=en`,
    `?locale=vi&version_id=bad`,
    `?locale=vi&version_id=${versionId}&version_id=${versionId}`,
    `?locale=vi&version_id=${versionId}&extra=1`,
    ``,
  ])("rejects an unsafe Membership contract PDF query: %s", async (query) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await GET(
      new NextRequest(
        `https://admin.example.test/api/backend/admin/memberships/${membershipId}/contract/pdf${query}`,
      ),
      {
        params: Promise.resolve({
          path: ["admin", "memberships", membershipId, "contract", "pdf"],
        }),
      },
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("allows only a query-free Membership contract detail request", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { status: "active" } }));
    vi.stubGlobal("fetch", upstream);
    const response = await GET(
      new NextRequest(
        `https://admin.example.test/api/backend/admin/memberships/${membershipId}/contract`,
      ),
      { params: Promise.resolve({ path: ["admin", "memberships", membershipId, "contract"] }) },
    );
    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/admin/memberships/${membershipId}/contract`,
    );

    upstream.mockClear();
    const rejected = await GET(
      new NextRequest(
        `https://admin.example.test/api/backend/admin/memberships/${membershipId}/contract?original=true`,
      ),
      { params: Promise.resolve({ path: ["admin", "memberships", membershipId, "contract"] }) },
    );
    expect(rejected.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("proxies the Auth administrative-unit source with the requested locale", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    const response = await GET(
      new NextRequest("https://admin.example.test/api/backend/administrative-units/provinces", {
        headers: { "accept-language": "vi" },
      }),
      { params: Promise.resolve({ path: ["administrative-units", "provinces"] }) },
    );

    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      "https://auth.example.test/api/v1/administrative-units/provinces",
    );
    expect(new Headers(upstream.mock.calls[0][1].headers).get("accept-language")).toBe("vi");
  });

  it("proxies the public supported shipping areas used by guest CSA", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    const response = await GET(
      new NextRequest("https://admin.example.test/api/backend/public/shipping-areas?locale=en"),
      { params: Promise.resolve({ path: ["public", "shipping-areas"] }) },
    );

    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      "https://auth.example.test/api/v1/public/shipping-areas?locale=en",
    );
  });

  it.each([
    "https://admin.example.test/api/backend/public/shipping-areas",
    "https://admin.example.test/api/backend/public/shipping-areas?locale=fr",
    "https://admin.example.test/api/backend/public/shipping-areas?locale=vi&extra=1",
  ])("rejects an unsafe supported-shipping-area query: %s", async (url) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await GET(new NextRequest(url), {
      params: Promise.resolve({ path: ["public", "shipping-areas"] }),
    });

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("keeps the bearer token server-side for an allowed Membership detail lookup", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [] }, { headers: { "X-Upstream-Secret": "do-not-forward" } }),
      );
    vi.stubGlobal("fetch", upstream);

    const response = await GET(
      new NextRequest(
        "https://admin.example.test/api/backend/admin/memberships/membership-id?locale=en",
      ),
      { params: Promise.resolve({ path: ["admin", "memberships", "membership-id"] }) },
    );

    expect(response.status).toBe(200);
    const init = upstream.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(response.headers.get("authorization")).toBeNull();
    expect(response.headers.get("x-upstream-secret")).toBeNull();
    expect(await response.json()).toEqual({ data: [] });
  });

  it("allows manual assignment and keeps bank settings credentials server-side", async () => {
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

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const init = upstream.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(response.headers.get("authorization")).toBeNull();
    expect(JSON.stringify(await response.json())).not.toContain("access-token");
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

  it("forwards exact tracker farm collection, reorder, and permanent-delete routes", async () => {
    const mediaId = "11111111-1111-4111-8111-111111111111";
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);
    const mutationHeaders = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
    };

    const list = await GET(
      new NextRequest("https://admin.example.test/api/backend/admin/tracker-farms"),
      { params: Promise.resolve({ path: ["admin", "tracker-farms"] }) },
    );
    const reorder = await PATCH(
      new NextRequest("https://admin.example.test/api/backend/admin/tracker-farms/reorder", {
        method: "PATCH",
        headers: mutationHeaders,
        body: JSON.stringify({ items: [] }),
      }),
      { params: Promise.resolve({ path: ["admin", "tracker-farms", "reorder"] }) },
    );
    const removed = await DELETE(
      new NextRequest("https://admin.example.test/api/backend/admin/tracker-farms/farm-id", {
        method: "DELETE",
        headers: mutationHeaders,
      }),
      { params: Promise.resolve({ path: ["admin", "tracker-farms", "farm-id"] }) },
    );
    const temporaryMedia = await DELETE(
      new NextRequest(
        `https://admin.example.test/api/backend/admin/tracker-farms/media/${mediaId}`,
        {
          method: "DELETE",
          headers: mutationHeaders,
        },
      ),
      {
        params: Promise.resolve({
          path: ["admin", "tracker-farms", "media", mediaId],
        }),
      },
    );

    expect([list.status, reorder.status, removed.status, temporaryMedia.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(upstream.mock.calls.map(([target]) => String(target))).toEqual([
      "https://auth.example.test/api/v1/admin/tracker-farms",
      "https://auth.example.test/api/v1/admin/tracker-farms/reorder",
      "https://auth.example.test/api/v1/admin/tracker-farms/farm-id",
      `https://auth.example.test/api/v1/admin/tracker-farms/media/${mediaId}`,
    ]);
    expect((upstream.mock.calls[1][1] as RequestInit).method).toBe("PATCH");
    expect((upstream.mock.calls[2][1] as RequestInit).method).toBe("DELETE");
    expect((upstream.mock.calls[3][1] as RequestInit).method).toBe("DELETE");
  });

  it("forwards Farm weekly quantity writes through the same-origin proxy", async () => {
    const farm = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const product = "11111111-1111-4111-8111-111111111111";
    const path = ["admin", "farms", farm, "products", product, "weeks", "2026-10-19"];
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { quantity_units: 10 } }));
    vi.stubGlobal("fetch", upstream);
    const response = await PUT(
      new NextRequest(`https://admin.example.test/api/backend/${path.join("/")}`, {
        method: "PUT",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        body: JSON.stringify({ quantity_units: 10 }),
      }),
      { params: Promise.resolve({ path }) },
    );
    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/${path.join("/")}`,
    );
    expect((upstream.mock.calls[0][1] as RequestInit).method).toBe("PUT");
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
