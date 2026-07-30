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

import { GET } from "@/app/api/backend/[...path]/route";
import { AuthServiceUnavailableError, refreshAccessToken } from "@/lib/oauth";
import { clearSession, readSession, writeSession } from "@/lib/session";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("admin backend proxy", () => {
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
