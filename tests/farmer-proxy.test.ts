import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH, POST } from "@/app/api/farmer/[...path]/route";
import { isAllowedBackendRequest } from "@/lib/backend-target";

vi.mock("@/lib/config", () => ({
  adminOrigin: () => "https://admin.example.test",
  authOrigin: () => "https://auth.example.test",
}));

const token = "A".repeat(43);
const id = "87703641-2dce-4cac-8fc4-91e55f03e95f";
const privateHeaders = {
  "x-farm-token": token,
  authorization: "Bearer admin",
  cookie: "admin-session=private",
  "x-nfv-admin-session": "session-binding",
  "x-forwarded-for": "203.0.113.10",
};

function route(method: string, path: string[], search = "", init?: RequestInit) {
  const request = new NextRequest(
    `https://admin.example.test/api/farmer/${path.join("/")}${search}`,
    {
      method,
      headers: { ...privateHeaders, ...Object.fromEntries(new Headers(init?.headers)) },
      body: init?.body,
      signal: init?.signal ?? undefined,
    },
  );
  const handlers = { GET, POST, PATCH };
  const handler =
    method === "GET" ? handlers.GET : method === "POST" ? handlers.POST : handlers.PATCH;
  return handler(request, { params: Promise.resolve({ path }) });
}

afterEach(() => vi.unstubAllGlobals());

describe("Farmer proxy boundary", () => {
  const origin = { origin: "https://admin.example.test", "content-type": "application/json" };
  it.each([
    [["farm"], ""],
    [["products"], "?search=Tomato&page=2"],
    [["supply-requests"], "?page=2"],
    [["supply-requests", id], ""],
  ])("forwards allowed GET %j without Admin credentials", async (path, query) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetcher);
    const response = await route("GET", path, query);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const [target, options] = fetcher.mock.calls[0];
    expect(String(target)).toBe(
      `https://auth.example.test/api/v1/farmer/${path.join("/")}${query}`,
    );
    expect(Object.fromEntries(new Headers(options.headers))).toEqual({
      accept: "application/json",
      "x-farm-token": token,
    });
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
  });

  it.each([
    ["GET", ["../admin", "farms"], "", 404],
    ["GET", ["supply-requests", "not-a-uuid"], "", 404],
    ["GET", ["supply-requests", id, "approve"], "", 404],
    ["POST", ["products"], "", 404],
    ["PATCH", ["supply-requests", id], "", 404],
    ["GET", ["farm"], "?page=1", 400],
    ["GET", ["products"], "?page=1&page=2", 400],
    ["GET", ["products"], "?page=10001", 400],
    ["GET", ["products"], "?search=" + "x".repeat(201), 400],
    ["GET", ["supply-requests"], "?farm_id=" + id, 400],
    ["GET", ["supply-requests", id], "?edit=1", 400],
    ["POST", ["supply-requests"], "?search=x", 400],
  ])("rejects %s %j %s at the boundary", async (method, path, query, status) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await route(method, path, query)).status).toBe(status);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires valid token, trusted mutation origin and bounded JSON object", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: {} }, { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    const params = ["supply-requests"];
    expect(
      (await route("GET", ["farm"], "", { headers: { "x-farm-token": "invalid" } })).status,
    ).toBe(403);
    expect(
      (
        await route("POST", params, "", {
          headers: { ...origin, origin: "https://different.example.test" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (await route("POST", params, "", { headers: { origin: origin.origin }, body: "{}" })).status,
    ).toBe(415);
    for (const body of ["not-json", "[]", JSON.stringify({ input: "X".repeat(33_000) })]) {
      expect((await route("POST", params, "", { headers: origin, body })).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect((await route("POST", params, "", { headers: origin, body: "{}" })).status).toBe(201);
    expect(fetcher.mock.calls[0][1].body).toBe("{}");
  });

  it("preserves throttling and rejects redirects or non-JSON upstream results", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ detail: "Throttled" }, { status: 429, headers: { "Retry-After": "15" } }),
        )
        .mockResolvedValueOnce(Response.redirect("https://auth.example.test/login", 302))
        .mockResolvedValueOnce(new Response("<html>login</html>")),
    );
    const throttled = await route("GET", ["products"]);
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBe("15");
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await route("GET", ["farm"]);
      expect(result.status).toBe(502);
      expect(result.headers.get("location")).toBeNull();
    }
  });
});

describe("Admin supply endpoints are narrowly allowlisted", () => {
  it.each([
    ["GET", ["admin", "farms", id, "farmer-link"], true],
    ["POST", ["admin", "farms", id, "farmer-link"], true],
    ["POST", ["admin", "farms", id, "farmer-link", "rotate"], true],
    ["GET", ["admin", "farms", id, "farmer-link", "rotate"], false],
    ["POST", ["admin", "farms", id, "farmer-link", "rotate", "extra"], false],
    ["GET", ["admin", "farm-supply-requests"], true],
    ["GET", ["admin", "farm-supply-requests", id], true],
    ["POST", ["admin", "farm-supply-requests", id, "approve"], true],
    ["POST", ["admin", "farm-supply-requests", id, "reject"], true],
    ["POST", ["admin", "farm-supply-requests", id, "edit"], false],
    ["PATCH", ["admin", "farm-supply-requests", id], false],
    ["GET", ["farmer", "farm"], false],
  ])("%s %j", (method, path, allowed) => {
    expect(isAllowedBackendRequest(method, path)).toBe(allowed);
  });
});
