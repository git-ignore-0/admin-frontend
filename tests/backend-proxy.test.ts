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
  adminSessionBinding: () => "test-rendered-session",
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

function pageRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  const headers = new Headers(init?.headers);
  if (!headers.has("x-nfv-admin-session")) {
    headers.set("x-nfv-admin-session", "test-rendered-session");
  }
  return new NextRequest(url, { ...init, headers });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("admin backend proxy", () => {
  const membershipId = "87703641-2dce-4cac-8fc4-91e55f03e95f";
  const versionId = "77777777-7777-4777-8777-777777777777";

  it("binds product transition to the page session and same-origin CSRF checks", async () => {
    const path = ["admin", "store-products", membershipId, "transition"];
    const url = `https://admin.example.test/api/backend/${path.join("/")}`;
    const context = { params: Promise.resolve({ path }) };
    const body = JSON.stringify({ expected_status: "draft", target_status: "active" });
    const verifiedHeaders = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
      "content-type": "application/json",
      authorization: "Bearer browser-token",
    };
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { status: "active" } }));
    vi.stubGlobal("fetch", upstream);
    expect((await POST(pageRequest(url, { method: "POST", body }), context)).status).toBe(403);
    vi.mocked(readSession).mockResolvedValueOnce(null);
    expect(
      (await POST(pageRequest(url, { method: "POST", body, headers: verifiedHeaders }), context))
        .status,
    ).toBe(401);
    expect(
      (
        await POST(
          pageRequest(url, {
            method: "POST",
            body,
            headers: { ...verifiedHeaders, "x-nfv-admin-session": "obsolete-page" },
          }),
          context,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await POST(
          pageRequest(`${url}?status=active`, { method: "POST", body, headers: verifiedHeaders }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(upstream).not.toHaveBeenCalled();

    const response = await POST(
      pageRequest(url, { method: "POST", body, headers: verifiedHeaders }),
      context,
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/${path.join("/")}`,
    );
    expect(new Headers(upstream.mock.calls[0][1].headers).get("authorization")).toBe(
      "Bearer access-token",
    );
  });

  describe("CMS user accounts", () => {
    const userId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const base = "https://admin.example.test/api/backend/admin/users";
    const upstreamBase = "https://auth.example.test/api/v1/admin/users";
    const trustedHeaders = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
      "content-type": "application/json",
    };
    it("forwards a session-bound shipping address PUT through the existing CSRF checks", async () => {
      const path = ["admin", "users", userId, "shipping-address"];
      const tail = `/${userId}/shipping-address`;
      const context = { params: Promise.resolve({ path }) };
      const body =
        '{"province_code":"66","ward_code":"22015","address":"12 Nguyễn Huệ","expected_updated_at":null}';
      const upstream = vi
        .fn()
        .mockResolvedValue(Response.json({ data: { address: "12 Nguyễn Huệ" } }));
      vi.stubGlobal("fetch", upstream);

      const blocked = await PUT(pageRequest(`${base}${tail}`, { method: "PUT", body }), context);
      expect(blocked.status).toBe(403);
      expect(upstream).not.toHaveBeenCalled();

      const result = await PUT(
        pageRequest(`${base}${tail}`, {
          method: "PUT",
          headers: { ...trustedHeaders, authorization: "Bearer browser-token" },
          body,
        }),
        context,
      );
      expect(result.status).toBe(200);
      const [target, init] = upstream.mock.calls[0];
      expect(String(target)).toBe(`${upstreamBase}${tail}`);
      expect(init.method).toBe("PUT");
      expect(init.headers.get("authorization")).toBe("Bearer access-token");
      expect(new TextDecoder().decode(init.body)).toBe(body);
      expect(result.headers.get("cache-control")).toBe("private, no-store");
    });

    const writes = [
      {
        name: "create",
        suffix: [],
        body: '{"name":"Nguyễn An", "login_phone_number":"0912345678", "password1":" p@ss Phrase! ", "password2":" p@ss Phrase! "}',
        status: 201,
      },
      { name: "activate", suffix: [userId, "activate"], body: undefined, status: 200 },
      { name: "suspend", suffix: [userId, "suspend"], body: "{}", status: 200 },
      { name: "reactivate", suffix: [userId, "reactivate"], body: "{}", status: 200 },
      {
        name: "reset-password",
        suffix: [userId, "reset-password"],
        body: '{ "password1":" New p@ss Phrase! ", "password2":" New p@ss Phrase! " }',
        status: 200,
      },
    ];

    it("asks an outdated CMS page to reload before using the current session", async () => {
      const upstream = vi.fn(async () => Response.json({ data: {} }));
      vi.stubGlobal("fetch", upstream);
      const response = await POST(
        pageRequest(`${base}/${userId}/activate`, {
          method: "POST",
          headers: { ...trustedHeaders, "x-nfv-admin-session": "outdated-render" },
          body: "{}",
        }),
        { params: Promise.resolve({ path: ["admin", "users", userId, "activate"] }) },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "session_changed" });
      expect(upstream).not.toHaveBeenCalled();
    });

    it.each(writes)(
      "forwards the exact $name POST with the session bearer token",
      async ({ suffix, body, status }) => {
        const path = ["admin", "users", ...suffix];
        const tail = suffix.length === 0 ? "" : `/${suffix.join("/")}`;
        const upstream = vi
          .fn()
          .mockResolvedValue(Response.json({ data: { id: userId } }, { status }));
        vi.stubGlobal("fetch", upstream);

        const response = await POST(
          pageRequest(`${base}${tail}`, {
            method: "POST",
            headers: { ...trustedHeaders, authorization: "Bearer browser-token" },
            body,
          }),
          { params: Promise.resolve({ path }) },
        );

        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ data: { id: userId } });
        expect(upstream).toHaveBeenCalledTimes(1);
        const [target, init] = upstream.mock.calls[0];
        expect(String(target)).toBe(`${upstreamBase}${tail}`);
        expect(init.method).toBe("POST");
        expect(init.headers.get("authorization")).toBe("Bearer access-token");
        expect(init.headers.get("content-type")).toBe("application/json");
        expect(new TextDecoder().decode(init.body)).toBe(body ?? "");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      },
    );

    it.each(writes)("requires origin, CSRF marker and session for $name", async ({ suffix }) => {
      const path = ["admin", "users", ...suffix];
      const url = `https://admin.example.test/api/backend/${path.join("/")}`;
      const context = { params: Promise.resolve({ path }) };
      const upstream = vi.fn();
      vi.stubGlobal("fetch", upstream);

      for (const headers of [
        { "x-nfv-admin-request": "1" },
        { ...trustedHeaders, origin: "https://other.example.test" },
        { origin: trustedHeaders.origin },
      ] as Record<string, string>[]) {
        const response = await POST(pageRequest(url, { method: "POST", headers }), context);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "csrf_rejected" });
      }
      expect(readSession).not.toHaveBeenCalled();

      vi.mocked(readSession).mockResolvedValueOnce(null);
      const response = await POST(
        pageRequest(url, { method: "POST", headers: trustedHeaders }),
        context,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
      expect(upstream).not.toHaveBeenCalled();
    });

    it.each(writes)("rejects query parameters on $name", async ({ suffix }) => {
      const path = ["admin", "users", ...suffix];
      const upstream = vi.fn().mockResolvedValue(Response.json({ data: {} }));
      vi.stubGlobal("fetch", upstream);

      const response = await POST(
        pageRequest(`https://admin.example.test/api/backend/${path.join("/")}?unexpected=1`, {
          method: "POST",
          headers: trustedHeaders,
        }),
        { params: Promise.resolve({ path }) },
      );

      expect(response.status).toBe(404);
      expect(upstream).not.toHaveBeenCalled();
    });

    const handlers = { DELETE, GET, PATCH, POST, PUT };
    it.each<[keyof typeof handlers, string[]]>([
      ["PATCH", []],
      ["PUT", []],
      ["DELETE", []],
      ["POST", [userId]],
      ["GET", [userId, "activate"]],
      ["GET", [userId, "suspend"]],
      ["GET", [userId, "reactivate"]],
      ["GET", [userId, "reset-password"]],
      ["PATCH", [userId, "activate"]],
      ["PUT", [userId, "suspend"]],
      ["DELETE", [userId, "reset-password"]],
      ["GET", ["malformed-id"]],
      ["GET", ["malformed-id", "points"]],
      ["POST", ["malformed-id", "activate"]],
      ["POST", [userId, "delete"]],
      ["POST", [userId, "activate", "extra"]],
    ])("returns 404 without forwarding %s %j", async (method, suffix) => {
      const path = ["admin", "users", ...suffix];
      const upstream = vi.fn().mockResolvedValue(Response.json({ data: {} }));
      vi.stubGlobal("fetch", upstream);

      const response = await handlers[method](
        pageRequest(`https://admin.example.test/api/backend/${path.join("/")}`, {
          method,
          headers: trustedHeaders,
        }),
        { params: Promise.resolve({ path }) },
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "backend_route_not_allowed" });
      expect(upstream).not.toHaveBeenCalled();
    });

    it.each([
      { suffix: [], tail: "?page=2&search=0912345678" },
      { suffix: [userId], tail: `/${userId}?invited_page=2` },
      { suffix: [userId, "points"], tail: `/${userId}/points?page=3` },
    ])("preserves GET /users$tail", async ({ suffix, tail }) => {
      const path = ["admin", "users", ...suffix];
      const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
      vi.stubGlobal("fetch", upstream);

      const response = await GET(pageRequest(`${base}${tail}`), {
        params: Promise.resolve({ path }),
      });

      expect(response.status).toBe(200);
      expect(String(upstream.mock.calls[0][0])).toBe(`${upstreamBase}${tail}`);
    });

    it("preserves POST to the existing user points route", async () => {
      const path = ["admin", "users", userId, "points"];
      const body = '{"direction":"credit","amount":50,"message":"Thưởng giới thiệu"}';
      const upstream = vi
        .fn()
        .mockResolvedValue(Response.json({ data: { balance: 50 } }, { status: 201 }));
      vi.stubGlobal("fetch", upstream);

      const response = await POST(
        pageRequest(`${base}/${userId}/points`, {
          method: "POST",
          headers: trustedHeaders,
          body,
        }),
        { params: Promise.resolve({ path }) },
      );

      expect(response.status).toBe(201);
      const [target, init] = upstream.mock.calls[0];
      expect(String(target)).toBe(`${upstreamBase}/${userId}/points`);
      expect(new TextDecoder().decode(init.body)).toBe(body);
    });
  });

  it.each(["vouchers", "csa-coupons"])(
    "forwards valid %s list scopes and rejects unsafe queries",
    async (resource) => {
      const path = ["admin", resource];
      const base = `https://admin.example.test/api/backend/${path.join("/")}`;
      const upstream = vi
        .fn()
        .mockImplementation(() => Promise.resolve(Response.json({ data: [] })));
      vi.stubGlobal("fetch", upstream);
      for (const scope of ["csa", "store", "both"]) {
        const query = `?application_scope=${scope}&status=active&discount_type=fixed&page=2`;
        const response = await GET(pageRequest(`${base}${query}`), {
          params: Promise.resolve({ path }),
        });
        expect(response.status).toBe(200);
        expect(String(upstream.mock.calls.at(-1)?.[0])).toBe(
          `https://auth.example.test/api/v1/admin/${resource}${query}`,
        );
      }
      upstream.mockClear();
      for (const query of [
        "?application_scope=other",
        "?application_scope=",
        "?application_scope=csa&application_scope=store",
        "?page=1&page=2",
        "?page=-1",
        "?page=1.5",
        "?page=",
        "?status=other",
        "?discount_type=other",
        "?search=secret",
        "?page_size=30",
      ]) {
        expect(
          (await GET(pageRequest(`${base}${query}`), { params: Promise.resolve({ path }) })).status,
        ).toBe(404);
      }
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it("keeps voucher mutations authenticated and origin protected while preserving upstream denials", async () => {
    const path = ["admin", "vouchers", membershipId, "activate"];
    const url = `https://admin.example.test/api/backend/${path.join("/")}`;
    const upstream = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ detail: "Forbidden" }, { status: 403 })),
      );
    vi.stubGlobal("fetch", upstream);
    for (const headers of [
      {},
      { origin: "https://evil.example.test", "x-nfv-admin-request": "1" },
      { origin: "https://admin.example.test" },
    ] as Record<string, string>[]) {
      expect(
        (
          await POST(pageRequest(url, { method: "POST", headers }), {
            params: Promise.resolve({ path }),
          })
        ).status,
      ).toBe(403);
    }
    expect(upstream).not.toHaveBeenCalled();
    const headers = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
      "content-type": "application/json",
      "accept-language": "vi",
    };
    vi.mocked(readSession).mockResolvedValueOnce(null);
    expect(
      (
        await POST(pageRequest(url, { method: "POST", headers }), {
          params: Promise.resolve({ path }),
        })
      ).status,
    ).toBe(401);
    const response = await POST(pageRequest(url, { method: "POST", headers, body: "{}" }), {
      params: Promise.resolve({ path }),
    });
    expect(response.status).toBe(403);
    const forwarded = new Headers(upstream.mock.calls[0][1].headers);
    expect(forwarded.get("authorization")).toBe("Bearer access-token");
    expect(forwarded.get("accept-language")).toBe("vi");
    expect(forwarded.get("content-type")).toBe("application/json");
    expect(response.headers.get("authorization")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["vouchers", "csa-coupons"])(
    "rejects queries on %s options, preview, detail and actions",
    async (resource) => {
      const upstream = vi.fn();
      vi.stubGlobal("fetch", upstream);
      for (const [method, suffix] of [
        ["GET", ["options"]],
        ["GET", [membershipId]],
        ["POST", ["preview"]],
        ["PATCH", [membershipId]],
        ["POST", [membershipId, "activate"]],
        ["POST", [membershipId, "deactivate"]],
      ] as const) {
        const path = ["admin", resource, ...suffix];
        const request = pageRequest(
          `https://admin.example.test/api/backend/${path.join("/")}?page=1`,
          { method, headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" } },
        );
        const response = await { GET, POST, PATCH }[method](request, {
          params: Promise.resolve({ path }),
        });
        expect(response.status).toBe(404);
      }
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it.each([
    "pending_review",
    "payment_pending",
    "payment_review",
    "pending_delivery",
    "delivered",
    "cancelled",
  ])("forwards only the Store order list query contract (%s)", async (status) => {
    const path = ["admin", "store-orders"];
    const base = `https://admin.example.test/api/backend/${path.join("/")}`;
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    const allowed = await GET(
      pageRequest(
        `${base}?page=2&page_size=20&search=NFV&status=${status}&payment_status=received&sort=deadline_asc`,
      ),
      { params: Promise.resolve({ path }) },
    );
    expect(allowed.status).toBe(200);
    upstream.mockClear();

    for (const query of [
      "?unknown=1",
      "?status=other",
      "?payment_status=other",
      "?refund_status=pending",
      "?sort=other",
      "?page=0",
      "?page=10001",
      "?page_size=51",
      `?search=${"x".repeat(201)}`,
      "?page_size=20&page_size=50",
    ]) {
      const blocked = await GET(pageRequest(`${base}${query}`), {
        params: Promise.resolve({ path }),
      });
      expect(blocked.status).toBe(404);
    }
    const detailPath = [...path, "24803641-2dce-4cac-8fc4-91e55f03e95f"];
    const blockedDetail = await GET(pageRequest(`${base}/${detailPath[2]}?page=1`), {
      params: Promise.resolve({ path: detailPath }),
    });
    expect(blockedDetail.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards close-refund-request exact body server-side and rejects method/query/segments", async () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const path = ["admin", "store-orders", id, "close-refund-request"];
    const url = `https://admin.example.test/api/backend/${path.join("/")}`;
    const payload = JSON.stringify({
      idempotency_key: "77777777-7777-4777-8777-777777777777",
      reason: "Không có tiền",
    });
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        data: { status: "cancelled", payment_status: "unconfirmed", refund_status: null },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const request = (address: string, method = "POST") =>
      pageRequest(address, {
        method,
        headers: {
          origin: "https://admin.example.test",
          "x-nfv-admin-request": "1",
          "content-type": "application/json",
        },
        ...(method === "POST" ? { body: payload } : {}),
      });
    const response = await POST(request(url), { params: Promise.resolve({ path }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { status: "cancelled", payment_status: "unconfirmed", refund_status: null },
    });
    const [target, init] = upstream.mock.calls[0];
    expect(String(target)).toBe(
      `https://auth.example.test/api/v1/admin/store-orders/${id}/close-refund-request`,
    );
    expect(new TextDecoder().decode(init.body)).toBe(payload);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(response.headers.get("authorization")).toBeNull();
    upstream.mockClear();
    for (const method of ["GET", "PATCH", "DELETE"] as const)
      expect(
        (
          await { GET, PATCH, DELETE }[method](request(url, method), {
            params: Promise.resolve({ path }),
          })
        ).status,
      ).toBe(404);
    for (const blocked of [
      [...path, "extra"],
      ["admin", "store-orders", "bad", path[3]],
    ])
      expect(
        (await POST(request(url), { params: Promise.resolve({ path: blocked }) })).status,
      ).toBe(404);
    expect(
      (await POST(request(`${url}?page=1`), { params: Promise.resolve({ path }) })).status,
    ).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(["sources", "allocations"] as const)(
    "forwards Store approval %s bytes and preserves the upstream status and receipt",
    async (shape) => {
      const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
      const key = "77777777-7777-4777-8777-777777777777";
      const line = "11111111-1111-4111-8111-111111111111";
      const farmOrBatch = "22222222-2222-4222-8222-222222222222";
      const path = ["admin", "store-orders", id, "approve"];
      const request = (body: string) =>
        pageRequest(`https://admin.example.test/api/backend/${path.join("/")}`, {
          method: "POST",
          headers: {
            origin: "https://admin.example.test",
            "x-nfv-admin-request": "1",
            "content-type": "application/json",
          },
          body,
        });
      const payload = JSON.stringify({
        idempotency_key: key,
        ...(shape === "sources"
          ? { sources: [{ line_id: line, farm_id: farmOrBatch }] }
          : { allocations: [{ line_id: line, batch_id: farmOrBatch, quantity: 3 }] }),
      });
      const receipt = { order_id: id, action: "approve", idempotency_key: key };
      const success = { data: { id }, meta: { action_receipt: receipt } };
      const conflict = {
        errors: [
          { code: "store_allocation_stale", context: { line_id: line, available_quantity: 2 } },
        ],
      };
      const upstream = vi
        .fn()
        .mockResolvedValueOnce(Response.json(success))
        .mockResolvedValueOnce(Response.json(conflict, { status: 409 }));
      vi.stubGlobal("fetch", upstream);
      const options = { params: Promise.resolve({ path }) };
      for (const [status, data] of [
        [200, success],
        [409, conflict],
      ] as const) {
        const response = await POST(request(payload), options);
        expect(response.status).toBe(status);
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(await response.json()).toEqual(data);
      }
      expect(upstream).toHaveBeenCalledTimes(2);
      for (const [target, init] of upstream.mock.calls) {
        expect(String(target)).toBe(
          `https://auth.example.test/api/v1/admin/store-orders/${id}/approve`,
        );
        expect(init.method).toBe("POST");
        expect(new TextDecoder().decode(init.body)).toBe(payload);
      }
    },
  );

  it("keeps Store order authorization server-side and preserves permission denials", async () => {
    const path = ["admin", "store-orders"];
    const request = pageRequest("https://admin.example.test/api/backend/admin/store-orders");
    vi.mocked(readSession).mockResolvedValueOnce(null);
    expect((await GET(request, { params: Promise.resolve({ path }) })).status).toBe(401);

    const upstream = vi
      .fn()
      .mockResolvedValue(Response.json({ detail: "Forbidden" }, { status: 403 }));
    vi.stubGlobal("fetch", upstream);
    const forbidden = await GET(request, { params: Promise.resolve({ path }) });
    expect(forbidden.status).toBe(403);
    expect(new Headers(upstream.mock.calls[0][1].headers).get("authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("forwards allowed coupon filters and rejects duplicate or unknown query parameters", async () => {
    const path = ["admin", "csa-coupons"];
    const base = `https://admin.example.test/api/backend/${path.join("/")}`;
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);
    const allowed = await GET(pageRequest(`${base}?status=active&discount_type=fixed&page=1`), {
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
      const blocked = await GET(pageRequest(`${base}${query}`), {
        params: Promise.resolve({ path }),
      });
      expect(blocked.status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
    const detail = [...path, "24803641-2dce-4cac-8fc4-91e55f03e95f"];
    const blockedDetail = await GET(pageRequest(`${base}/${detail[2]}?status=active`), {
      params: Promise.resolve({ path: detail }),
    });
    expect(blockedDetail.status).toBe(404);
  });

  it("requires an admin session for coupons and preserves upstream permission denial", async () => {
    const path = ["admin", "csa-coupons"];
    const request = pageRequest("https://admin.example.test/api/backend/admin/csa-coupons");
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
      pageRequest(url, {
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
    const blocked = await GET(pageRequest(`${url}?original=true`), {
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
      pageRequest(url, {
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
    const blockedGet = await GET(pageRequest(url), { params: Promise.resolve({ path }) });
    const invalidPath = ["admin", "csa-purchase-requests", "invalid-id", "mark-refunded"];
    const blockedId = await POST(
      pageRequest(`https://admin.example.test/api/backend/${invalidPath.join("/")}`, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path: invalidPath }) },
    );
    const otherPath = ["admin", "csa-purchase-requests", requestId, "refund-again"];
    const blockedAction = await POST(
      pageRequest(`https://admin.example.test/api/backend/${otherPath.join("/")}`, {
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
      pageRequest(url, {
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
    const blockedGet = await GET(pageRequest(url), { params: Promise.resolve({ path }) });
    const blockedQuery = await POST(
      pageRequest(`${url}?original=true`, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path }) },
    );
    const wrongPath = ["admin", "csa-purchase-requests", requestId, "payments", "0", "confirm"];
    const blockedSequence = await POST(
      pageRequest(`https://admin.example.test/api/backend/${wrongPath.join("/")}`, {
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
        pageRequest(
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
      pageRequest(
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
      pageRequest(
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
      pageRequest(
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
      pageRequest(
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
      pageRequest("https://admin.example.test/api/backend/administrative-units/provinces", {
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

  it("forwards the province code intact and leaves province existence validation to Django", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);
    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/administrative-units/wards?province=01", {
        headers: { "accept-language": "en" },
      }),
      { params: Promise.resolve({ path: ["administrative-units", "wards"] }) },
    );

    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      "https://auth.example.test/api/v1/administrative-units/wards?province=01",
    );
    expect(new Headers(upstream.mock.calls[0][1].headers).get("accept-language")).toBe("en");
  });

  it("forwards the status filter and pagination for the CSA round list", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);
    const suffix = "admin/csa-rounds?page=2&page_size=20&status=open";
    const response = await GET(pageRequest(`https://admin.example.test/api/backend/${suffix}`), {
      params: Promise.resolve({ path: ["admin", "csa-rounds"] }),
    });

    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(`https://auth.example.test/api/v1/${suffix}`);
  });

  it.each([
    { suffix: [], search: "?type=weekly&status=published&page=2&page_size=20" },
    { suffix: [], search: `?creation_key=${membershipId}` },
    { suffix: [membershipId], search: "" },
    { suffix: [membershipId, "rounds"], search: "?status=draft&page=2&page_size=100" },
    {
      suffix: [membershipId, "rounds"],
      search: "?status=draft&generated_only=true&search=27%2F11%2F2026",
    },
  ])(
    "forwards a CSA configuration read to the canonical API with $search",
    async ({ suffix, search }) => {
      const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
      vi.stubGlobal("fetch", upstream);
      const path = ["admin", "csa-round-configurations", ...suffix];
      const endpoint = `${path.join("/")}${search}`;
      const response = await GET(
        pageRequest(`https://admin.example.test/api/backend/${endpoint}`),
        {
          params: Promise.resolve({ path }),
        },
      );

      expect(response.status).toBe(200);
      expect(String(upstream.mock.calls[0][0])).toBe(
        `https://auth.example.test/api/v1/${endpoint}`,
      );
    },
  );

  it.each([
    ["POST", [], POST],
    ["PATCH", [membershipId], PATCH],
    ["DELETE", [membershipId], DELETE],
    ["POST", [membershipId, "publish"], POST],
    ["POST", [membershipId, "stop"], POST],
  ] as const)("forwards CSA configuration %s %j", async (method, suffix, handler) => {
    const upstream = vi
      .fn()
      .mockResolvedValue(
        method === "DELETE"
          ? new Response(null, { status: 204 })
          : Response.json({ data: { id: membershipId } }),
      );
    vi.stubGlobal("fetch", upstream);
    const path = ["admin", "csa-round-configurations", ...suffix];
    const endpoint = path.join("/");
    for (const search of ["?page=1", ""]) {
      const response = await handler(
        pageRequest(`https://admin.example.test/api/backend/${endpoint}${search}`, {
          method,
          headers: {
            origin: "https://admin.example.test",
            "x-nfv-admin-request": "1",
            ...(method !== "DELETE" && { "content-type": "application/json" }),
          },
          body: method === "DELETE" ? undefined : "{}",
        }),
        { params: Promise.resolve({ path }) },
      );
      expect(response.status).toBe(search ? 404 : method === "DELETE" ? 204 : 200);
      if (search) expect(upstream).not.toHaveBeenCalled();
      else {
        const [target, init] = upstream.mock.calls[0];
        expect(String(target)).toBe(`https://auth.example.test/api/v1/${endpoint}`);
        expect(init.method).toBe(method);
        if (method !== "DELETE") expect(new TextDecoder().decode(init.body)).toBe("{}");
      }
    }
  });

  it.each([
    { path: ["administrative-units", "wards"], search: "" },
    { path: ["administrative-units", "wards"], search: "?province=1" },
    { path: ["administrative-units", "wards"], search: "?province=ab" },
    { path: ["administrative-units", "wards"], search: "?province=01&province=01" },
    { path: ["administrative-units", "wards"], search: "?province=01&province=79" },
    { path: ["admin", "users", membershipId], search: "?invited_page=1&invited_page=2" },
    { path: ["admin", "csa-rounds"], search: "?page_size=20&page_size=20" },
    { path: ["admin", "csa-rounds"], search: "?status=draft&status=open" },
    { path: ["admin", "csa-rounds", membershipId, "selections"], search: "?locale=fr" },
    { path: ["admin", "csa-round-configurations"], search: "?type=monthly" },
    { path: ["admin", "csa-round-configurations"], search: "?status=open" },
    {
      path: ["admin", "csa-round-configurations", membershipId, "rounds"],
      search: "?status=published",
    },
    { path: ["admin", "csa-round-configurations"], search: "?search=anything" },
    {
      path: ["admin", "csa-round-configurations", membershipId, "rounds"],
      search: "?generated_only=maybe",
    },
    { path: ["admin", "csa-round-configurations"], search: "?type=weekly&type=standalone" },
    { path: ["admin", "csa-round-configurations"], search: "?sort=sequence" },
    { path: ["admin", "csa-round-configurations"], search: "?page=10001" },
    { path: ["admin", "csa-round-configurations", membershipId], search: "?page=1" },
    { path: ["admin", "csa-round-configurations", membershipId, "rounds"], search: "?type=weekly" },
    {
      path: ["admin", "csa-round-configurations", membershipId, "rounds"],
      search: "?status=active",
    },
    {
      path: ["admin", "csa-round-configurations", membershipId, "rounds"],
      search: "?page_size=101",
    },
    { path: ["admin", "memberships", membershipId, "history"], search: "?page=1&page=2" },
    { path: ["admin", "membership-usage", membershipId], search: "?locale=en&locale=vi" },
    {
      path: ["admin", "store-products"],
      search: `?category_id=${membershipId}&category_id=${versionId}`,
    },
    { path: ["admin", "store-products"], search: "?status=all" },
    { path: ["admin", "store-products"], search: "?status=active&status=draft" },
    { path: ["admin", "store-products"], search: "?search=rau&search=qua" },
    { path: ["admin", "store-products"], search: "?csa_eligible=true&csa_eligible=false" },
    { path: ["admin", "testimonials"], search: "?type=farmer&type=customer" },
  ])("rejects an ambiguous or malformed query at $path with $search", async ({ path, search }) => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);
    const response = await GET(
      pageRequest(`https://admin.example.test/api/backend/${path.join("/")}${search}`),
      { params: Promise.resolve({ path }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "backend_route_not_allowed" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("preserves recognized pagination and legacy passthrough keys on User details", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", upstream);
    const suffix = `admin/users/${membershipId}?invited_page=2&legacy=one&legacy=two`;
    const response = await GET(pageRequest(`https://admin.example.test/api/backend/${suffix}`), {
      params: Promise.resolve({ path: ["admin", "users", membershipId] }),
    });

    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(`https://auth.example.test/api/v1/${suffix}`);
  });

  it("preserves the locale on a Membership revoke and rejects ambiguous locale values", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", upstream);
    const path = ["admin", "memberships", membershipId, "revoke"];
    const suffix = path.join("/");
    const init = {
      method: "POST",
      headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      body: JSON.stringify({ reason: "test" }),
    };
    const context = { params: Promise.resolve({ path }) };
    const valid = await POST(
      pageRequest(`https://admin.example.test/api/backend/${suffix}?locale=en`, init),
      context,
    );
    const invalid = await POST(
      pageRequest(`https://admin.example.test/api/backend/${suffix}?locale=en&locale=en`, init),
      context,
    );

    expect(valid.status).toBe(200);
    expect(invalid.status).toBe(404);
    expect(upstream).toHaveBeenCalledOnce();
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/${suffix}?locale=en`,
    );
  });

  it("proxies the public supported shipping areas used by guest CSA", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/public/shipping-areas?locale=en"),
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

    const response = await GET(pageRequest(url), {
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
      pageRequest(
        `https://admin.example.test/api/backend/admin/memberships/${membershipId}?locale=en`,
      ),
      { params: Promise.resolve({ path: ["admin", "memberships", membershipId] }) },
    );

    expect(response.status).toBe(200);
    const init = upstream.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(response.headers.get("authorization")).toBeNull();
    expect(response.headers.get("x-upstream-secret")).toBeNull();
    expect(await response.json()).toEqual({ data: [] });
  });

  it("allows manual assignment and keeps bank settings credentials server-side", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { id: membershipId } }));
    vi.stubGlobal("fetch", upstream);

    const allowed = await POST(
      pageRequest("https://admin.example.test/api/backend/admin/memberships", {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path: ["admin", "memberships"] }) },
    );
    expect(allowed.status).toBe(200);

    upstream.mockClear();
    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/admin/membership-payment-settings"),
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
      pageRequest("https://admin.example.test/api/backend/admin/membership-requests", {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path: ["admin", "membership-requests"] }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "backend_route_not_allowed" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(
    [
      ["admin", "workshops", "invalid-id"],
      ["admin", "testimonials", ""],
      ["admin", "memberships", membershipId, "contract", "pdf", "extra"],
    ].map((path) => ({ path })),
  )("rejects the invalid route $path before refresh or dispatch", async ({ path }) => {
    const session = await readSession();
    if (!session) throw new Error("Test session missing");
    vi.mocked(readSession).mockResolvedValueOnce({ ...session, expiresAt: 0 });
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", upstream);
    const response = await GET(
      pageRequest(`https://admin.example.test/api/backend/${path.join("/")}?locale=vi`),
      { params: Promise.resolve({ path }) },
    );

    expect(response.status).toBe(404);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("only proxies POST for the Membership revoke action", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { status: "revoked" } }));
    vi.stubGlobal("fetch", upstream);
    const path = ["admin", "memberships", membershipId, "revoke"];
    const mutationHeaders = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
    };

    const allowed = await POST(
      pageRequest(
        `https://admin.example.test/api/backend/admin/memberships/${membershipId}/revoke`,
        {
          method: "POST",
          headers: mutationHeaders,
          body: JSON.stringify({ reason: "test" }),
        },
      ),
      { params: Promise.resolve({ path }) },
    );
    expect(allowed.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/admin/memberships/${membershipId}/revoke`,
    );

    upstream.mockClear();
    const blockedGet = await GET(
      pageRequest(
        `https://admin.example.test/api/backend/admin/memberships/${membershipId}/revoke`,
      ),
      { params: Promise.resolve({ path }) },
    );
    const blockedDelete = await DELETE(
      pageRequest(
        `https://admin.example.test/api/backend/admin/memberships/${membershipId}/revoke`,
        {
          method: "DELETE",
          headers: mutationHeaders,
        },
      ),
      { params: Promise.resolve({ path }) },
    );
    const blockedAction = await POST(
      pageRequest(
        `https://admin.example.test/api/backend/admin/memberships/${membershipId}/unknown`,
        { method: "POST", headers: mutationHeaders },
      ),
      {
        params: Promise.resolve({
          path: ["admin", "memberships", membershipId, "unknown"],
        }),
      },
    );

    expect([blockedGet.status, blockedDelete.status, blockedAction.status]).toEqual([
      404, 404, 404,
    ]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards exact tracker farm collection, reorder, and permanent-delete routes", async () => {
    const trackerId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const mediaId = "11111111-1111-4111-8111-111111111111";
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);
    const mutationHeaders = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
    };

    const list = await GET(
      pageRequest("https://admin.example.test/api/backend/admin/tracker-farms"),
      { params: Promise.resolve({ path: ["admin", "tracker-farms"] }) },
    );
    const reorder = await PATCH(
      pageRequest("https://admin.example.test/api/backend/admin/tracker-farms/reorder", {
        method: "PATCH",
        headers: mutationHeaders,
        body: JSON.stringify({ items: [] }),
      }),
      { params: Promise.resolve({ path: ["admin", "tracker-farms", "reorder"] }) },
    );
    const removed = await DELETE(
      pageRequest(`https://admin.example.test/api/backend/admin/tracker-farms/${trackerId}`, {
        method: "DELETE",
        headers: mutationHeaders,
      }),
      { params: Promise.resolve({ path: ["admin", "tracker-farms", trackerId] }) },
    );
    const temporaryMedia = await DELETE(
      pageRequest(`https://admin.example.test/api/backend/admin/tracker-farms/media/${mediaId}`, {
        method: "DELETE",
        headers: mutationHeaders,
      }),
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
      `https://auth.example.test/api/v1/admin/tracker-farms/${trackerId}`,
      `https://auth.example.test/api/v1/admin/tracker-farms/media/${mediaId}`,
    ]);
    expect((upstream.mock.calls[1][1] as RequestInit).method).toBe("PATCH");
    expect((upstream.mock.calls[2][1] as RequestInit).method).toBe("DELETE");
    expect((upstream.mock.calls[3][1] as RequestInit).method).toBe("DELETE");
  });

  it("forwards only valid Farm lifecycle queries and methods", async () => {
    const farm = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const product = "11111111-1111-4111-8111-111111111111";
    const collection = ["admin", "farms", farm, "products"];
    const source = [...collection, product];
    const batches = [...source, "batches"];
    const history = [...source, "history"];
    const upstream = vi.fn<typeof fetch>(async () => Response.json({ data: {} }));
    vi.stubGlobal("fetch", upstream);
    const invoke = (
      method: "GET" | "POST" | "PATCH" | "DELETE",
      path: readonly string[],
      query = "",
    ) => {
      const proxy = { GET, POST, PATCH, DELETE }[method];
      return proxy(
        pageRequest(`https://admin.example.test/api/backend/${path.join("/")}${query}`, {
          method,
          headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        }),
        { params: Promise.resolve({ path: [...path] }) },
      );
    };

    for (const [path, query] of [
      [collection, "?supply_status=active"],
      [collection, "?supply_status=supplying&supply_status=all"],
      [collection, "?page=10001"],
      [collection, "?scope=history"],
      [source, "?page=1"],
      [batches, "?scope=expired"],
      [batches, "?status=historical"],
      [batches, "?scope=all&scope=history"],
      [history, "?search=R01"],
    ] as const) {
      expect((await invoke("GET", path, query)).status).toBe(404);
    }
    expect((await invoke("PATCH", source)).status).toBe(404);
    expect((await invoke("DELETE", source)).status).toBe(404);
    expect((await invoke("POST", [...source, "remove"], "?page=1")).status).toBe(404);
    expect((await invoke("POST", [...source, "remove", "extra"])).status).toBe(404);
    expect((await invoke("POST", [...collection, "bad-id", "re-add"])).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();

    const allowed = [
      ["GET", collection, "?page=2&supply_status=removed&search=R01"],
      ["GET", source, ""],
      ["GET", batches, "?page=1&scope=history&status=active"],
      ["GET", history, "?page=2"],
      ["POST", [...source, "remove"], ""],
      ["POST", [...source, "re-add"], ""],
    ] as const;
    for (const [method, path, query] of allowed) {
      const response = await invoke(method, path, query);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(upstream).toHaveBeenCalledTimes(allowed.length);
    for (let index = 0; index < allowed.length; index += 1) {
      const [, path, query] = allowed[index];
      const [url, init] = upstream.mock.calls[index];
      expect(String(url)).toBe(`https://auth.example.test/api/v1/${path.join("/")}${query}`);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
    }
  });

  describe("Farm bulk supply product-status query contract", () => {
    const farm = "1f373011-45a6-4a1b-9607-1f0ea865bccf";
    const product = "11111111-1111-4111-8111-111111111111";
    const collection = ["admin", "farms", farm, "products"];

    it.each([
      "product_status=active",
      "product_status=draft",
      "product_status=discontinued",
      // Exact query emitted when FarmBulkSupply opens Farm 1.
      "page=1&supply_status=supplying&product_status=active",
      "page=2&supply_status=supplying&search=rau+mu%E1%BB%91ng&product_status=active",
    ])("forwards the complete valid query through the real BFF: %s", async (query) => {
      const payload = { data: [], meta: { page: 1, page_size: 20, total: 0 } };
      const upstream = vi.fn<typeof fetch>(async () => Response.json(payload));
      vi.stubGlobal("fetch", upstream);
      const response = await GET(
        pageRequest(`https://admin.example.test/api/backend/${collection.join("/")}?${query}`),
        { params: Promise.resolve({ path: collection }) },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(payload);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(upstream).toHaveBeenCalledTimes(1);
      const [target, init] = upstream.mock.calls[0];
      expect(String(target)).toBe(
        `https://auth.example.test/api/v1/${collection.join("/")}?${query}`,
      );
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
    });

    it.each([
      ["GET", collection, "product_status=unknown"],
      ["GET", collection, "product_status="],
      ["GET", collection, "product_status=ACTIVE"],
      ["GET", collection, "product_status=active&product_status=draft"],
      ["GET", collection, "product_status=active&product_status=active"],
      ["GET", ["admin", "farms"], "product_status=active"],
      ["GET", ["admin", "farms", farm], "product_status=active"],
      ["GET", ["admin", "farms", farm, "available-products"], "product_status=active"],
      ["GET", [...collection, product], "product_status=active"],
      ["GET", [...collection, product, "batches"], "product_status=active"],
      ["GET", [...collection, product, "batches", product], "product_status=active"],
      ["GET", [...collection, product, "history"], "product_status=active"],
      ["POST", collection, "product_status=active"],
      ["POST", [...collection, product, "remove"], "product_status=active"],
      ["PATCH", ["admin", "farms", farm], "product_status=active"],
      ["DELETE", ["admin", "farms", farm], "product_status=active"],
      ["PUT", collection, "product_status=active"],
    ] as const)("rejects %s %j?%s without upstream access", async (method, path, query) => {
      const upstream = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", upstream);
      const response = await { GET, POST, PATCH, DELETE, PUT }[method](
        pageRequest(`https://admin.example.test/api/backend/${path.join("/")}?${query}`, {
          method,
          headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        }),
        { params: Promise.resolve({ path: [...path] }) },
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "backend_route_not_allowed" });
      expect(upstream).not.toHaveBeenCalled();
    });
  });

  it("forwards Farm stock-batch writes through the same-origin proxy", async () => {
    const farm = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const product = "11111111-1111-4111-8111-111111111111";
    const path = ["admin", "farms", farm, "products", product, "batches"];
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { quantity_units: 10 } }));
    vi.stubGlobal("fetch", upstream);
    const response = await POST(
      pageRequest(`https://admin.example.test/api/backend/${path.join("/")}`, {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        body: JSON.stringify({
          start_date: "2026-10-19",
          end_date: "2026-10-25",
          quantity_units: 10,
          expected_link_id: "22222222-2222-4222-8222-222222222222",
          expected_version: 2,
        }),
      }),
      { params: Promise.resolve({ path }) },
    );
    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/${path.join("/")}`,
    );
    expect((upstream.mock.calls[0][1] as RequestInit).method).toBe("POST");
  });

  it("returns a bounded timeout with no-store caching", async () => {
    const client = new AbortController();
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_target: URL, { signal }: RequestInit) => {
        deadline.abort(new DOMException("timed out", "TimeoutError"));
        client.abort();
        throw signal?.reason;
      }),
    );

    try {
      const response = await GET(
        pageRequest("https://admin.example.test/api/backend/admin/redemptions", {
          signal: client.signal,
        }),
        { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
      );
      expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
      expect(response.status).toBe(504);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ error: "upstream_timeout" });
    } finally {
      timeout.mockRestore();
    }
  });

  it("skips refresh and upstream fetch for an already cancelled read", async () => {
    const session = await readSession();
    if (!session) throw new Error("Test session missing");
    vi.mocked(readSession).mockResolvedValueOnce({ ...session, expiresAt: 0 });
    const client = new AbortController();
    client.abort(new Error("obsolete read"));
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/admin/redemptions", {
        signal: client.signal,
      }),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );

    expect(response.status).toBe(499);
    expect(response.body).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("finishes shared refresh before dropping an obsolete read", async () => {
    const session = await readSession();
    if (!session) throw new Error("Test session missing");
    vi.mocked(readSession).mockResolvedValueOnce({ ...session, expiresAt: 0 });
    const client = new AbortController();
    vi.mocked(refreshAccessToken).mockImplementationOnce(async () => {
      client.abort();
      return session;
    });
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/admin/redemptions", {
        signal: client.signal,
      }),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );

    expect(response.status).toBe(499);
    expect(writeSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(clearSession).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("reports an incoming mutation body failure before starting the upstream deadline", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const request = pageRequest("https://admin.example.test/api/backend/admin/users", {
      method: "POST",
      headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      body: "{}",
    });
    vi.spyOn(request, "arrayBuffer").mockRejectedValueOnce(
      new DOMException("body read failed", "AbortError"),
    );
    const timeout = vi.spyOn(AbortSignal, "timeout");

    try {
      const response = await POST(request, {
        params: Promise.resolve({ path: ["admin", "users"] }),
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ error: "invalid_request_body" });
      expect(timeout).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });

  it.each(["rejected", "buffered"])(
    "does not dispatch an aborted mutation with a %s body read",
    async (outcome) => {
      const client = new AbortController();
      const upstream = vi.fn();
      vi.stubGlobal("fetch", upstream);
      const request = pageRequest("https://admin.example.test/api/backend/admin/users", {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        body: "{}",
        signal: client.signal,
      });
      vi.spyOn(request, "arrayBuffer").mockImplementationOnce(async () => {
        client.abort(new Error("client stopped sending body"));
        if (outcome === "rejected") throw request.signal.reason;
        return new ArrayBuffer(0);
      });
      const response = await POST(request, {
        params: Promise.resolve({ path: ["admin", "users"] }),
      });

      expect(response.status).toBe(499);
      expect(response.body).toBeNull();
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it("preserves an unrelated upstream failure when the deadline aborts concurrently", async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementationOnce(async () => {
        deadline.abort(new DOMException("timed out", "TimeoutError"));
        throw new DOMException("upstream aborted independently", "AbortError");
      }),
    );

    try {
      const response = await GET(
        pageRequest("https://admin.example.test/api/backend/admin/redemptions"),
        { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
      );
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "upstream_unavailable" });
    } finally {
      timeout.mockRestore();
    }
  });

  it.each(["GET", "POST"])("uses fail-closed upstream redirects for %s", async (method) => {
    const upstream = vi.fn().mockRejectedValue(new TypeError("upstream redirect rejected"));
    vi.stubGlobal("fetch", upstream);
    const response = await (method === "GET" ? GET : POST)(
      pageRequest("https://admin.example.test/api/backend/admin/users", {
        method,
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        body: method === "POST" ? "{}" : undefined,
      }),
      { params: Promise.resolve({ path: ["admin", "users"] }) },
    );

    expect(upstream).toHaveBeenCalledExactlyOnceWith(
      new URL("https://auth.example.test/api/v1/admin/users"),
      expect.objectContaining({ method, redirect: "error" }),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toEqual({ error: "upstream_unavailable" });
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("forwards a no-content Workshop delete without creating a response body", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", upstream);
    const path = ["admin", "workshops", membershipId];
    const response = await DELETE(
      pageRequest(`https://admin.example.test/api/backend/${path.join("/")}`, {
        method: "DELETE",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
      }),
      { params: Promise.resolve({ path }) },
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-type")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/${path.join("/")}/`,
    );
  });

  it("does not label an upstream response with no declared media type as JSON", async () => {
    const body = new TextEncoder().encode('{"data":[]}');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/admin/redemptions"),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );
    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.json()).toEqual({ data: [] });
  });

  it("keeps the stream and status when the upstream body fails after headers", async () => {
    const streamError = new Error("synthetic stream interruption");
    const stream = new TransformStream<Uint8Array>();
    const writer = stream.writable.getWriter();
    const upstream = vi.fn().mockResolvedValue(
      new Response(stream.readable, {
        status: 200,
        headers: {
          "content-type": "application/json",
          location: "https://auth.example.test/",
          "set-cookie": "synthetic=blocked",
        },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/admin/redemptions"),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    const content = response.json();
    const rejected = expect(content).rejects.toBe(streamError);
    await writer.write(new TextEncoder().encode('{"data":'));
    await writer.abort(streamError);
    await rejected;
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("propagates an incoming read cancellation without returning an upstream timeout", async () => {
    const client = new AbortController();
    const upstream = vi.fn(
      (_target: URL, { signal }: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    vi.stubGlobal("fetch", upstream);
    const pending = GET(
      pageRequest("https://admin.example.test/api/backend/admin/redemptions", {
        signal: client.signal,
      }),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce());
    client.abort(new Error("client disconnected"));
    const signal = upstream.mock.calls[0][1].signal;
    expect(signal?.reason).toBe(client.signal.reason);
    const response = await pending;
    expect(response.status).toBe(499);
    expect(response.body).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("still reports a real transport failure when the client aborts while the failure settles", async () => {
    const client = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementationOnce(async () => {
        client.abort();
        throw new TypeError("transport failure");
      }),
    );
    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/admin/redemptions", {
        signal: client.signal,
      }),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream_unavailable" });
  });

  it("does not cancel or retry a dispatched mutation when the client disconnects", async () => {
    const client = new AbortController();
    const upstream = vi.fn(async (_target: URL, { signal }: RequestInit) => {
      client.abort();
      expect(signal?.aborted).toBe(false);
      return Response.json({ data: { ok: true } }, { status: 201 });
    });
    vi.stubGlobal("fetch", upstream);
    const response = await POST(
      pageRequest("https://admin.example.test/api/backend/admin/users", {
        method: "POST",
        headers: { origin: "https://admin.example.test", "x-nfv-admin-request": "1" },
        body: "{}",
        signal: client.signal,
      }),
      { params: Promise.resolve({ path: ["admin", "users"] }) },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { ok: true } });
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("forwards exact Testimonial routes and blocks hard delete", async () => {
    const testimonialId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const upstream = vi.fn().mockResolvedValue(Response.json({ data: { id: testimonialId } }));
    vi.stubGlobal("fetch", upstream);
    const mutationHeaders = {
      origin: "https://admin.example.test",
      "x-nfv-admin-request": "1",
    };
    const detailPath = ["admin", "testimonials", testimonialId];

    const patched = await PATCH(
      pageRequest(`https://admin.example.test/api/backend/admin/testimonials/${testimonialId}`, {
        method: "PATCH",
        headers: mutationHeaders,
        body: JSON.stringify({ featured: true }),
      }),
      { params: Promise.resolve({ path: detailPath }) },
    );
    expect(patched.status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toBe(
      `https://auth.example.test/api/v1/admin/testimonials/${testimonialId}/`,
    );

    upstream.mockClear();
    const removed = await DELETE(
      pageRequest(`https://admin.example.test/api/backend/admin/testimonials/${testimonialId}`, {
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
        email_verified: true,
        login_phone_number: null,
        name: "Admin",
        locale: "vi",
        roles: ["website_admin"],
      },
    });
    vi.mocked(refreshAccessToken).mockRejectedValueOnce(new AuthServiceUnavailableError("offline"));

    const response = await GET(
      pageRequest("https://admin.example.test/api/backend/admin/redemptions"),
      { params: Promise.resolve({ path: ["admin", "redemptions"] }) },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream_unavailable" });
    expect(clearSession).not.toHaveBeenCalled();
    expect(writeSession).not.toHaveBeenCalled();
  });
});

it("checks supply request list filters and rejects query on link and decisions", async () => {
  const id = "87703641-2dce-4cac-8fc4-91e55f03e95f";
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ data: [] })));
  vi.stubGlobal("fetch", fetcher);
  const origin = "https://admin.example.test";
  const list = ["admin", "farm-supply-requests"];
  const url = `${origin}/api/backend/${list.join("/")}`;
  const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
  for (const query of [
    "status=all",
    "farm_id=wrong",
    "page=10001",
    "page_size=20",
    "search=a&search=b",
  ]) {
    expect((await GET(pageRequest(`${url}?${query}`), context(list))).status).toBe(404);
  }
  const link = ["admin", "farms", id, "farmer-link"];
  expect(
    (await GET(pageRequest(`${origin}/api/backend/${link.join("/")}?page=1`), context(link)))
      .status,
  ).toBe(404);
  const decision = [...list, id, "approve"];
  expect(
    (
      await POST(
        pageRequest(`${origin}/api/backend/${decision.join("/")}?status=pending`, {
          method: "POST",
          headers: { origin, "x-nfv-admin-request": "1" },
        }),
        context(decision),
      )
    ).status,
  ).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
  const valid = await GET(pageRequest(`${url}?farm_id=${id}&status=pending&page=2`), context(list));
  expect(valid.status).toBe(200);
  expect(String(fetcher.mock.calls[0][0])).toBe(
    `https://auth.example.test/api/v1/admin/farm-supply-requests?farm_id=${id}&status=pending&page=2`,
  );
});
