import { NextResponse } from "next/server";

import { adminOrigin } from "@/lib/config";
import { clearSession } from "@/lib/session";

export async function POST() {
  await clearSession();
  return NextResponse.redirect(`${adminOrigin()}/login`, 303);
}
