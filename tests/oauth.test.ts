import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthServiceUnavailableError, exchangeCode, refreshAccessToken } from "@/lib/oauth";
import type { AdminSession } from "@/lib/session";

const token = {
  access_token: "next-access-token",
  refresh_token: "next-refresh-token",
  expires_in: 3600,
  token_type: "Bearer",
};

const session: AdminSession = {
  accessToken: "old-access-token",
  refreshToken: "one-use-refresh-token",
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
};

describe("admin OAuth", () => {
  beforeEach(() => {
    process.env.AUTH_ORIGIN = "https://auth.example.test";
    process.env.ADMIN_ORIGIN = "https://admin.example.test";
    process.env.ADMIN_OAUTH_CLIENT_ID = "admin-client";
    process.env.ADMIN_OAUTH_CLIENT_SECRET = "admin-secret";
  });

  afterEach(() => {
    delete process.env.AUTH_ORIGIN;
    delete process.env.ADMIN_ORIGIN;
    delete process.env.ADMIN_OAUTH_CLIENT_ID;
    delete process.env.ADMIN_OAUTH_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  it("creates a session for an administrator with a login phone and no email", async () => {
    const upstream = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url) => {
      if (url.endsWith("/oauth/token")) return Response.json(token);
      return Response.json({
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Admin",
          locale: "vi",
          roles: ["website_admin"],
          email: null,
          email_verified: false,
          login_phone_number: "+84912345678",
          internal_field: "outside the session contract",
        },
      });
    });
    vi.stubGlobal("fetch", upstream);

    const result = await exchangeCode("oauth-code", "pkce-verifier");

    expect(upstream).toHaveBeenNthCalledWith(
      1,
      "https://auth.example.test/oauth/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "oauth-code",
          code_verifier: "pkce-verifier",
          redirect_uri: "https://admin.example.test/api/auth/callback",
          client_id: "admin-client",
          client_secret: "admin-secret",
        }),
      }),
    );
    expect(upstream).toHaveBeenNthCalledWith(
      2,
      "https://auth.example.test/api/v1/admin/session",
      expect.objectContaining({
        headers: { Authorization: "Bearer next-access-token" },
      }),
    );
    expect(result.user).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Admin",
      locale: "vi",
      roles: ["website_admin"],
      email: null,
      email_verified: false,
      login_phone_number: "+84912345678",
    });
  });

  it("coalesces concurrent rotation of the same refresh token", async () => {
    let releaseRequest: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    let requests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        requests += 1;
        await gate;
        return Response.json(token);
      }),
    );

    const first = refreshAccessToken(session);
    const second = refreshAccessToken(session);
    expect(requests).toBe(1);
    releaseRequest?.();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.refreshToken).toBe("next-refresh-token");
    expect(secondResult).toEqual(firstResult);
    expect(requests).toBe(1);
  });

  it.each([
    ["exchanging an authorization code", ["/oauth/token"], () => exchangeCode("code", "verifier")],
    ["refreshing a token", ["/oauth/token"], () => refreshAccessToken(session)],
    [
      "verifying an admin session",
      ["/oauth/token", "/api/v1/admin/session"],
      () => exchangeCode("code", "verifier"),
    ],
  ] as const)("reports a blocked redirect as unavailable when %s", async (_, paths, operation) => {
    const redirectError = new TypeError("fetch failed due to an unexpected redirect");
    const upstream = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url) => {
      if (url.endsWith(paths[paths.length - 1])) throw redirectError;
      return Response.json(token);
    });
    vi.stubGlobal("fetch", upstream);

    const result = operation();
    await expect(result).rejects.toBeInstanceOf(AuthServiceUnavailableError);
    await expect(result).rejects.toHaveProperty("message", "Core Auth is unavailable");
    expect(upstream.mock.calls.map(([url, init]) => [url, init.redirect])).toEqual(
      paths.map((path) => [`https://auth.example.test${path}`, "error"]),
    );
  });

  it("preserves the session when Core Auth is temporarily unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(refreshAccessToken(session)).rejects.toBeInstanceOf(AuthServiceUnavailableError);
  });
});
