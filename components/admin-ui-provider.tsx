"use client";

import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import "dayjs/locale/vi";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { adminTheme, adminCssVariablesResolver } from "@/lib/admin-theme";

export function AdminUiProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useAdminI18n();
  return (
    <MantineProvider
      theme={adminTheme}
      cssVariablesResolver={adminCssVariablesResolver}
      forceColorScheme="light"
    >
      <DatesProvider settings={{ locale, firstDayOfWeek: 1 }}>{children}</DatesProvider>
    </MantineProvider>
  );
}
