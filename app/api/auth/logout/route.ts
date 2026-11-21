import { NextRequest, NextResponse } from "next/server";

import { adminOrigin } from "@/lib/config";
import { adminSessionBinding, clearSession, readSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const origin = adminOrigin();
  if (request.headers.get("origin") !== origin) {
    return new NextResponse(null, { status: 403 });
  }
  const session = await readSession();
  if (session) {
    const form = await request.formData().catch(() => null);
    if (form?.get("sessionBinding") !== adminSessionBinding(session)) {
      return new NextResponse(
        "Phiên quản trị đã thay đổi. Vui lòng tải lại CMS. The admin session changed. Please reload CMS.",
        {
          status: 409,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    await clearSession(session);
  }
  return NextResponse.redirect(`${origin}/login`, 303);
}
