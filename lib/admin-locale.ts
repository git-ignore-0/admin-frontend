import "server-only";

import { cookies } from "next/headers";

import { ADMIN_LOCALE_COOKIE, normalizeAdminLocale } from "@/lib/admin-i18n";

export async function getAdminLocale() {
  return normalizeAdminLocale((await cookies()).get(ADMIN_LOCALE_COOKIE)?.value);
}
