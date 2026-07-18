import { NextRequest, NextResponse } from "next/server";

import { adminOrigin } from "@/lib/config";
import { exchangeCode } from "@/lib/oauth";
import { clearSession, consumeOAuthFlow, writeSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const flow = await consumeOAuthFlow();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  if (!flow || !code || state !== flow.state || error) {
    await clearSession();
    return NextResponse.redirect(`${adminOrigin()}/login?error=oauth`);
  }
  try {
    await writeSession(await exchangeCode(code, flow.verifier));
    return NextResponse.redirect(`${adminOrigin()}${flow.returnTo}`);
  } catch (caught) {
    await clearSession();
    const reason =
      caught instanceof Error && caught.message.includes("administrator") ? "forbidden" : "oauth";
    return NextResponse.redirect(`${adminOrigin()}/login?error=${reason}`);
  }
}
