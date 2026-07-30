import "server-only";

import crypto from "node:crypto";

import { adminOrigin, authOrigin, oauthClientId, oauthClientSecret } from "@/lib/config";
import { type AdminSession } from "@/lib/session";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const refreshes = new Map<string, Promise<AdminSession>>();

export class AdminSessionInvalidError extends Error {}
export class AuthServiceUnavailableError extends Error {}

async function authFetch(input: string, init: RequestInit = {}) {
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AuthServiceUnavailableError("Core Auth is unavailable", {
      cause: error,
    });
  }
}

function parseTokenResponse(payload: unknown): TokenResponse {
  if (!payload || typeof payload !== "object") {
    throw new AuthServiceUnavailableError("Core Auth returned an invalid token response");
  }
  const token = payload as Partial<TokenResponse>;
  if (
    typeof token.access_token !== "string" ||
    !token.access_token ||
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0 ||
    typeof token.token_type !== "string" ||
    !token.token_type ||
    (token.refresh_token !== undefined && typeof token.refresh_token !== "string")
  ) {
    throw new AuthServiceUnavailableError("Core Auth returned an invalid token response");
  }
  return token as TokenResponse;
}

export function randomUrlSafe(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function tokenRequest(parameters: URLSearchParams): Promise<TokenResponse> {
  parameters.set("client_id", oauthClientId());
  parameters.set("client_secret", oauthClientSecret());
  const response = await authFetch(`${authOrigin()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
  });
  if (!response.ok) {
    const ErrorType = [400, 401].includes(response.status)
      ? AdminSessionInvalidError
      : AuthServiceUnavailableError;
    throw new ErrorType(`OAuth token exchange failed (${response.status})`);
  }
  try {
    return parseTokenResponse(await response.json());
  } catch (error) {
    if (error instanceof AuthServiceUnavailableError) throw error;
    throw new AuthServiceUnavailableError("Core Auth returned an invalid token response", {
      cause: error,
    });
  }
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
  const response = await authFetch(`${authOrigin()}/api/v1/admin/session`, {
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
  if (!session.refreshToken) throw new AdminSessionInvalidError("Session cannot be refreshed");
  const fingerprint = crypto.createHash("sha256").update(session.refreshToken).digest("base64url");
  const active = refreshes.get(fingerprint);
  if (active) return active;

  const refresh = tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
      scope: "profile email content:manage",
    }),
  )
    .then((token) => ({
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
    }))
    .finally(() => {
      if (refreshes.get(fingerprint) === refresh) refreshes.delete(fingerprint);
    });
  refreshes.set(fingerprint, refresh);
  return refresh;
}
