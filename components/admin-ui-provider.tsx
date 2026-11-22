"use client";

import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import "dayjs/locale/vi";
import { useEffect } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { adminTheme, adminCssVariablesResolver } from "@/lib/admin-theme";

export function AdminUiProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useAdminI18n();

  useEffect(() => {
    const root = document.documentElement;
    const pointerFocus = () => root.setAttribute("data-admin-pointer-focus", "");
    const tabFocus = ({ key, altKey, ctrlKey, metaKey }: KeyboardEvent) => {
      if (key === "Tab" && !altKey && !ctrlKey && !metaKey) {
        root.removeAttribute("data-admin-pointer-focus");
      }
    };

    // Editable fields can match :focus-visible after a click. Only keyboard navigation
    // should add a cue to a field whose border stays the same when focused.
    document.addEventListener("pointerdown", pointerFocus, true);
    document.addEventListener("keydown", tabFocus, true);
    return () => {
      document.removeEventListener("pointerdown", pointerFocus, true);
      document.removeEventListener("keydown", tabFocus, true);
      root.removeAttribute("data-admin-pointer-focus");
    };
  }, []);

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
