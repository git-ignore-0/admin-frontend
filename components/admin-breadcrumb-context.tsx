"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AdminBreadcrumbItem } from "@/lib/admin-navigation";

type Registration = { pathname: string; items: readonly AdminBreadcrumbItem[] };

const CurrentBreadcrumbs = createContext<readonly AdminBreadcrumbItem[] | null>(null);
const BreadcrumbRegistration = createContext<{
  pathname: string;
  register: (entry: Registration) => () => void;
} | null>(null);

/** The protected shell keys this provider by the authenticated session. */
export function AdminBreadcrumbProvider({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const register = useCallback((entry: Registration) => {
    setRegistration(entry);
    return () => {
      setRegistration((current) => (current === entry ? null : current));
    };
  }, []);
  const scope = useMemo(() => ({ pathname, register }), [pathname, register]);
  const items = registration?.pathname === pathname ? registration.items : null;

  return (
    <BreadcrumbRegistration.Provider value={scope}>
      <CurrentBreadcrumbs.Provider value={items}>{children}</CurrentBreadcrumbs.Provider>
    </BreadcrumbRegistration.Provider>
  );
}

export function useAdminBreadcrumbs(fallback: readonly AdminBreadcrumbItem[]) {
  return useContext(CurrentBreadcrumbs) ?? fallback;
}

/** Use the owning route's explicit pathname so old page content cannot register for a new screen. */
export function AdminBreadcrumbForRoute({
  pathname,
  items,
}: {
  pathname: string;
  items?: readonly AdminBreadcrumbItem[];
}) {
  const scope = useContext(BreadcrumbRegistration);
  useLayoutEffect(() => {
    if (pathname && scope?.pathname === pathname && items?.length) {
      return scope.register({ pathname, items });
    }
  }, [scope, pathname, items]);
  return null;
}
