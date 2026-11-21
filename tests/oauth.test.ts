import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthServiceUnavailableError, exchangeCode, refreshAccessToken } from "@/lib/oauth";
import type { AdminSession } from "@/lib/session";

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/oauth/token")) {
          return Response.json({
            access_token: "next-access-token",
            refresh_token: "next-refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
          });
        }
        expect(url).toBe("https://auth.example.test/api/v1/admin/session");
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
      }),
    );

    const result = await exchangeCode("oauth-code", "pkce-verifier");

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
        return new Response(
          JSON.stringify({
            access_token: "next-access-token",
            refresh_token: "next-refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200 },
        );
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

  it("preserves the session when Core Auth is temporarily unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(refreshAccessToken(session)).rejects.toBeInstanceOf(AuthServiceUnavailableError);
  });
});
