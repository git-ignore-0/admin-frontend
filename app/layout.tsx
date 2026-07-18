import type { Metadata } from "next";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
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
    <html lang={locale}>
      <body>
        <AdminI18nProvider initialLocale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </AdminI18nProvider>
      </body>
    </html>
  );
}
