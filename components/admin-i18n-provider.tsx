"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ADMIN_LOCALE_COOKIE, adminDictionaries, type AdminLocale } from "@/lib/admin-i18n";

type AdminI18nContextValue = {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
  t: (typeof adminDictionaries)[AdminLocale];
};

const AdminI18nContext = createContext<AdminI18nContextValue | null>(null);

export function AdminI18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: AdminLocale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<AdminI18nContextValue>(
    () => ({
      locale,
      t: adminDictionaries[locale],
      setLocale(nextLocale) {
        document.cookie = `${ADMIN_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
        setLocaleState(nextLocale);
        router.refresh();
      },
    }),
    [locale, router],
  );

  return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
}

export function useAdminI18n() {
  const value = useContext(AdminI18nContext);
  if (!value) throw new Error("useAdminI18n must be used inside AdminI18nProvider");
  return value;
}
