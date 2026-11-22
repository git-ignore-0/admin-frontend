import "@fontsource-variable/inter";
import "@fontsource-variable/inter/wght-italic.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";

import type { Metadata } from "next";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminUiProvider } from "@/components/admin-ui-provider";
import { ToastProvider } from "@/components/toast-provider";
import { getAdminLocale } from "@/lib/admin-locale";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NFV Admin", template: "%s · NFV Admin" },
  description: "Natural Farming Vietnam content administration",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getAdminLocale();
  return (
    <html lang={locale} {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body>
        <AdminI18nProvider initialLocale={locale}>
          <AdminUiProvider>
            <ToastProvider>{children}</ToastProvider>
          </AdminUiProvider>
        </AdminI18nProvider>
      </body>
    </html>
  );
}
