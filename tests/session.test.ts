import { afterEach, describe, expect, it, vi } from "vitest";

import { adminSessionBinding, readSession, seal, SESSION_COOKIE } from "@/lib/session";

const cookieValues = vi.hoisted(() => new Map<string, { value: string }>());

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieValues.get.bind(cookieValues) }),
}));

afterEach(() => {
  cookieValues.clear();
  vi.unstubAllEnvs();
});

describe("admin session cookies", () => {
  it("reads sessions sealed before identity metadata was added", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-only-admin-session-secret-value");
    const legacySession = {
      accessToken: "existing-access-token",
      refreshToken: "existing-refresh-token",
      expiresAt: 120_000,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Admin",
        locale: "vi",
        roles: ["website_admin"],
        email: "admin@example.com",
      },
    };
    cookieValues.set(SESSION_COOKIE, { value: seal(legacySession) });

    const session = await readSession();
    expect(session).toEqual({
      ...legacySession,
      legacyBinding: expect.any(String),
      user: { ...legacySession.user, email_verified: false, login_phone_number: null },
    });
    expect(adminSessionBinding(session!)).toBe(adminSessionBinding((await readSession())!));
  });
});
