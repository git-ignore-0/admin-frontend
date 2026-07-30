import type { AdminLocale } from "@/lib/admin-i18n";

const dateTimeFormatters: Record<AdminLocale, Intl.DateTimeFormat> = {
  vi: new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }),
  en: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }),
};

export function formatAdminDateTime(
  value: string | null,
  locale: AdminLocale,
  fallback = "—",
): string {
  return value ? dateTimeFormatters[locale].format(new Date(value)) : fallback;
}
