import "server-only";

import crypto from "node:crypto";

import { adminOrigin, authOrigin, oauthClientId, oauthClientSecret } from "@/lib/config";
import { type AdminSession } from "@/lib/session";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: "Bearer";
};

export function randomUrlSafe(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function tokenRequest(parameters: URLSearchParams): Promise<TokenResponse> {
  parameters.set("client_id", oauthClientId());
  parameters.set("client_secret", oauthClientSecret());
  const response = await fetch(`${authOrigin()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OAuth token exchange failed (${response.status})`);
  return response.json() as Promise<TokenResponse>;
}

export async function exchangeCode(code: string, verifier: string): Promise<AdminSession> {
  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: `${adminOrigin()}/api/auth/callback`,
    }),
  );
  const response = await fetch(`${authOrigin()}/api/v1/admin/session`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("This account is not a website administrator");
  const payload = (await response.json()) as { data: AdminSession["user"] };
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? "",
    expiresAt: Date.now() + token.expires_in * 1000,
    user: payload.data,
  };
}

export async function refreshAccessToken(session: AdminSession): Promise<AdminSession> {
  if (!session.refreshToken) throw new Error("Session cannot be refreshed");
  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
      scope: "profile email content:manage",
    }),
  );
  return {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}
