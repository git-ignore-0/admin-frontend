import { NextRequest, NextResponse } from "next/server";

import { adminOrigin } from "@/lib/config";
import { exchangeCode } from "@/lib/oauth";
import { consumeOAuthFlow, startSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const flow = await consumeOAuthFlow(state);
  if (!flow || !code || error) {
    return NextResponse.redirect(`${adminOrigin()}/login?error=oauth`);
  }
  try {
    await startSession(await exchangeCode(code, flow.verifier));
    return NextResponse.redirect(`${adminOrigin()}${flow.returnTo}`);
  } catch (caught) {
    const reason =
      caught instanceof Error && caught.message.includes("administrator") ? "forbidden" : "oauth";
    return NextResponse.redirect(`${adminOrigin()}/login?error=${reason}`);
  }
}
