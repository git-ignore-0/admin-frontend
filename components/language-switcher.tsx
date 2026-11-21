"use client";

import { SegmentedControl } from "@mantine/core";
import { useAdminI18n } from "@/components/admin-i18n-provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useAdminI18n();
  return (
    <SegmentedControl
      aria-label={t.common.language}
      size="xs"
      value={locale}
      onChange={(value) => setLocale(value === "en" ? "en" : "vi")}
      data={[
        { value: "vi", label: "VI" },
        { value: "en", label: "EN" },
      ]}
    />
  );
}
