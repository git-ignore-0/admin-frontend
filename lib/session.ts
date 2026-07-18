import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import { sessionSecret } from "@/lib/config";

export const SESSION_COOKIE = "nfv_admin_session";
export const OAUTH_FLOW_COOKIE = "nfv_admin_oauth_flow";

export type AdminSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    name: string;
    locale: "vi" | "en";
    roles: string[];
  };
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

const secureCookie = process.env.NODE_ENV === "production";

export async function readSession() {
  const store = await cookies();
  return unseal<AdminSession>(store.get(SESSION_COOKIE)?.value);
}

export async function writeSession(session: AdminSession) {
  const store = await cookies();
  store.set(SESSION_COOKIE, seal(session), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(OAUTH_FLOW_COOKIE);
}

export async function writeOAuthFlow(flow: OAuthFlow) {
  const store = await cookies();
  store.set(OAUTH_FLOW_COOKIE, seal(flow), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export async function consumeOAuthFlow() {
  const store = await cookies();
  const flow = unseal<OAuthFlow>(store.get(OAUTH_FLOW_COOKIE)?.value);
  store.delete(OAUTH_FLOW_COOKIE);
  return flow;
}
