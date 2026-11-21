import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import { sessionSecret } from "@/lib/config";

export const SESSION_COOKIE = "nfv_admin_session";
export const SESSION_ID_COOKIE = "nfv_admin_session_id";
export const OAUTH_FLOW_COOKIE = "nfv_admin_oauth_flow";
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const oauthStatePattern = /^[A-Za-z0-9_-]{43}$/;
const familyCookie = (id: string) => `${SESSION_COOKIE}_${id}`;
const revokedCookie = (id: string) => `${SESSION_COOKIE}_revoked_${id}`;
const flowCookie = (state: string) => `${OAUTH_FLOW_COOKIE}_${state}`;
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export type AdminSessionUser = {
  id: string;
  name: string;
  locale: string;
  roles: string[];
  email: string | null;
  email_verified: boolean;
  login_phone_number: string | null;
};

export type AdminSession = {
  sessionId?: string;
  legacyBinding?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AdminSessionUser;
};

export type OAuthFlow = {
  state: string;
  verifier: string;
  returnTo: string;
};

function key() {
  return crypto.createHash("sha256").update(sessionSecret()).digest();
}

export function seal(value: object) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function unseal<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    const payload = Buffer.from(value, "base64url");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"),
    );
  } catch {
    return null;
  }
}

export function parseAdminSessionUser(payload: unknown): AdminSessionUser | null {
  if (!payload || typeof payload !== "object") return null;
  const user = payload as Partial<AdminSessionUser>;
  if (
    typeof user.id !== "string" ||
    !user.id ||
    typeof user.name !== "string" ||
    typeof user.locale !== "string" ||
    !Array.isArray(user.roles) ||
    user.roles.some((role) => typeof role !== "string")
  ) {
    return null;
  }

  const email = typeof user.email === "string" && user.email ? user.email : null;
  return {
    id: user.id,
    name: user.name,
    locale: user.locale,
    roles: user.roles,
    email,
    email_verified: email !== null && user.email_verified === true,
    login_phone_number:
      typeof user.login_phone_number === "string" && user.login_phone_number
        ? user.login_phone_number
        : null,
  };
}

/** The page marker binds a rendered admin screen to its login, never authenticates it. */
export function adminSessionBinding(session: AdminSession): string {
  return (
    session.sessionId ??
    session.legacyBinding ??
    crypto
      .createHmac("sha256", key())
      .update("admin-legacy-page-session:")
      .update(session.refreshToken || session.accessToken)
      .digest("base64url")
  );
}

export async function readSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const id = store.get(SESSION_ID_COOKIE)?.value;
  if (id !== undefined && !sessionIdPattern.test(id)) return null;
  if (store.get(revokedCookie(id ?? "legacy"))) return null;

  // Once a family is selected, do not fall back to a legacy cookie written late.
  const session = unseal<Omit<AdminSession, "user"> & { user: unknown }>(
    store.get(id ? familyCookie(id) : SESSION_COOKIE)?.value,
  );
  if (!session || session.sessionId !== id) return null;

  const user = parseAdminSessionUser(session.user);
  if (!user) return null;
  const current = { ...session, user };
  return id ? current : { ...current, legacyBinding: adminSessionBinding(current) };
}

/** OAuth success selects the active family. Refresh writes only its own family. */
export async function startSession(session: AdminSession) {
  const store = await cookies();
  const sessionId = crypto.randomUUID();
  for (const { name } of store.getAll()) {
    if (
      (name.startsWith(`${SESSION_COOKIE}_`) &&
        sessionIdPattern.test(name.slice(SESSION_COOKIE.length + 1))) ||
      (name.startsWith(`${SESSION_COOKIE}_revoked_`) &&
        sessionIdPattern.test(name.slice(`${SESSION_COOKIE}_revoked_`.length)))
    ) {
      store.delete(name);
    }
  }
  store.delete(SESSION_COOKIE);
  store.delete(revokedCookie("legacy"));
  await writeSession({ ...session, sessionId });
  store.set(SESSION_ID_COOKIE, sessionId, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function writeSession(session: AdminSession) {
  const store = await cookies();
  const id = session.sessionId;
  if (id && !sessionIdPattern.test(id)) throw new Error("Invalid admin session family");
  store.set(id ? familyCookie(id) : SESSION_COOKIE, seal(session), {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(session: AdminSession) {
  const store = await cookies();
  const id = session.sessionId;
  if (id && !sessionIdPattern.test(id)) throw new Error("Invalid admin session family");
  store.delete(id ? familyCookie(id) : SESSION_COOKIE);
  // An older refresh can rewrite the data cookie but cannot remove this marker.
  store.set(revokedCookie(id ?? "legacy"), "1", {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function writeOAuthFlow(flow: OAuthFlow) {
  const store = await cookies();
  store.set(flowCookie(flow.state), seal(flow), {
    ...cookieOptions,
    maxAge: 600,
  });
}

export async function consumeOAuthFlow(state: string | null) {
  if (!state || !oauthStatePattern.test(state)) return null;
  const store = await cookies();
  const name = store.get(flowCookie(state)) ? flowCookie(state) : OAUTH_FLOW_COOKIE;
  const flow = unseal<OAuthFlow>(store.get(name)?.value);
  if (flow?.state !== state) return null;
  store.delete(name);
  return flow;
}
