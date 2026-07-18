import { NextRequest, NextResponse } from "next/server";

import { adminOrigin, authOrigin, oauthClientId } from "@/lib/config";
import { pkceChallenge, randomUrlSafe } from "@/lib/oauth";
import { writeOAuthFlow } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const state = randomUrlSafe();
  const verifier = randomUrlSafe(48);
  const requestedReturnTo = request.nextUrl.searchParams.get("returnTo") || "/dashboard";
  const returnTo = requestedReturnTo.startsWith("/") ? requestedReturnTo : "/dashboard";
  await writeOAuthFlow({ state, verifier, returnTo });
  const authorize = new URL(`${authOrigin()}/oauth/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: oauthClientId(),
    redirect_uri: `${adminOrigin()}/api/auth/callback`,
    scope: "profile email content:manage",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return NextResponse.redirect(authorize);
}
