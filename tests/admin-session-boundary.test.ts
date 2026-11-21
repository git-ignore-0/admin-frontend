import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as callback } from "@/app/api/auth/callback/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET, POST } from "@/app/api/backend/[...path]/route";
import {
  adminSessionBinding,
  readSession,
  seal,
  SESSION_COOKIE,
  startSession,
  type AdminSession,
  writeOAuthFlow,
} from "@/lib/session";

type Jar = Map<string, string>;
const currentRequest = new AsyncLocalStorage<ReturnType<typeof cookieRequest>>();

vi.mock("next/headers", () => ({ cookies: async () => currentRequest.getStore() }));

function cookieRequest(browser: Jar) {
  const values = new Map(browser);
  const writes = new Map<string, string | null>();
  return {
    get(name: string) {
      const value = values.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return [...values].map(([name, value]) => ({ name, value }));
    },
    set(name: string, value: string) {
      values.set(name, value);
      writes.set(name, value);
    },
    delete(name: string) {
      values.delete(name);
      writes.set(name, null);
    },
    apply() {
      for (const [name, value] of writes) {
        if (value === null) browser.delete(name);
        else browser.set(name, value);
      }
    },
  };
}

async function request<T>(browser: Jar, handle: () => Promise<T>) {
  const cookies = cookieRequest(browser);
  const response = await currentRequest.run(cookies, handle);
  cookies.apply();
  return response;
}

function session(name: string, expired = false): AdminSession {
  return {
    user: {
      id: name,
      name,
      email: null,
      email_verified: false,
      login_phone_number: null,
      locale: "en",
      roles: ["website_admin"],
    },
    accessToken: `fixture-access-${name}`,
    refreshToken: `fixture-refresh-${name}`,
    expiresAt: Date.now() + (expired ? 0 : 60_000),
  };
}

async function signIn(browser: Jar, name: string, expired = false) {
  await request(browser, () => startSession(session(name, expired)));
  return request(browser, async () => adminSessionBinding((await readSession())!));
}

const base = "https://admin.example.test";
const context = { params: Promise.resolve({ path: ["admin", "users"] }) };
const page = (binding: string) =>
  new NextRequest(`${base}/api/backend/admin/users`, {
    headers: { "x-nfv-admin-session": binding },
  });

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-only-admin-session-secret-value");
  vi.stubEnv("ADMIN_ORIGIN", base);
  vi.stubEnv("AUTH_ORIGIN", "https://auth.example.test");
  vi.stubEnv("ADMIN_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("ADMIN_OAUTH_CLIENT_SECRET", "test-client-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("admin requests scoped to the rendered session", () => {
  it("keeps a legacy page binding when its tokens refresh", async () => {
    const browser = new Map([[SESSION_COOKIE, seal(session("Legacy", true))]]);
    const binding = await request(browser, async () => adminSessionBinding((await readSession())!));
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "rotated-legacy-fixture",
          refresh_token: "rotated-legacy-refresh",
          expires_in: 120,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);
    expect((await request(browser, () => GET(page(binding), context))).status).toBe(200);
    await request(browser, async () => {
      const current = (await readSession())!;
      expect(current.accessToken).toBe("rotated-legacy-fixture");
      expect(adminSessionBinding(current)).toBe(binding);
    });
  });

  it("rejects an outdated page before sending any admin POST upstream", async () => {
    const browser: Jar = new Map();
    const a = await signIn(browser, "A");
    await signIn(browser, "B");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await request(browser, () =>
      POST(
        new NextRequest(`${base}/api/backend/admin/users`, {
          method: "POST",
          headers: {
            origin: base,
            "x-nfv-admin-request": "1",
            "x-nfv-admin-session": a,
          },
          body: "{}",
        }),
        context,
      ),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "session_changed" });
    expect(upstream).not.toHaveBeenCalled();
    expect((await request(browser, readSession))?.user.name).toBe("B");
  });

  it.each([
    [
      "a successful refresh response",
      true,
      () =>
        Response.json({
          access_token: "rotated-fixture-token",
          refresh_token: "rotated-fixture-refresh",
          expires_in: 120,
          token_type: "Bearer",
        }),
      200,
    ],
    ["an upstream 401", false, () => Response.json({}, { status: 401 }), 401],
  ] as const)("keeps the replacement session after %s", async (_, expired, result, status) => {
    const browser: Jar = new Map();
    const a = await signIn(browser, "A", expired);
    let resolveResponse!: (response: Response) => void;
    let requestStarted!: () => void;
    const waiting = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const upstream = vi
      .fn()
      .mockImplementationOnce(() => {
        requestStarted();
        return waiting;
      })
      .mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    const oldRequest = request(browser, () => GET(page(a), context));
    await started;
    const b = await signIn(browser, "B");
    resolveResponse(result());
    expect((await oldRequest).status).toBe(status);
    await request(browser, async () => {
      const current = (await readSession())!;
      expect(adminSessionBinding(current)).toBe(b);
      expect(current.accessToken).toBe("fixture-access-B");
    });
  });

  it("keeps the active session and another pending flow when an old callback fails", async () => {
    const browser: Jar = new Map();
    const oldState = "a".repeat(43);
    const nextState = "b".repeat(43);
    await request(browser, () =>
      writeOAuthFlow({ returnTo: "/dashboard", verifier: "fixture", state: oldState }),
    );
    const b = await signIn(browser, "B");
    await request(browser, () =>
      writeOAuthFlow({ returnTo: "/dashboard", verifier: "fixture", state: nextState }),
    );
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const cookiesBefore = new Map(browser);
    const response = await request(browser, () =>
      callback(new NextRequest(`${base}/api/auth/callback?state=${oldState}&error=access_denied`)),
    );
    expect(response.headers.get("location")).toBe(`${base}/login?error=oauth`);
    expect(upstream).not.toHaveBeenCalled();
    const current = await request(browser, readSession);
    expect(current && adminSessionBinding(current)).toBe(b);
    expect(browser.get(`nfv_admin_oauth_flow_${nextState}`)).toBe(
      cookiesBefore.get(`nfv_admin_oauth_flow_${nextState}`),
    );
    expect(browser.has(`nfv_admin_oauth_flow_${nextState}`)).toBe(true);
  });

  it("requires the login that rendered the sign-out form", async () => {
    const browser: Jar = new Map();
    const a = await signIn(browser, "A");
    const b = await signIn(browser, "B");
    const signOut = (binding: string) =>
      request(browser, () =>
        logout(
          new NextRequest(`${base}/api/auth/logout`, {
            method: "POST",
            headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ sessionBinding: binding }).toString(),
          }),
        ),
      );
    expect((await signOut(a)).status).toBe(409);
    expect((await request(browser, readSession))?.user.name).toBe("B");
    expect((await signOut(b)).status).toBe(303);
    expect(await request(browser, readSession)).toBeNull();
  });
});
