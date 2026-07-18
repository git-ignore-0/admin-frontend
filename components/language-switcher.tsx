"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useAdminI18n();
  return (
    <div className="language-switcher" role="group" aria-label={t.common.language}>
      <button
        type="button"
        className={locale === "vi" ? "active" : ""}
        aria-pressed={locale === "vi"}
        onClick={() => setLocale("vi")}
      >
        VI
      </button>
      <button
        type="button"
        className={locale === "en" ? "active" : ""}
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
    </div>
  );
}
