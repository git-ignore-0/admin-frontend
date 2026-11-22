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

type Registration = { pathname: string; search?: string; items: readonly AdminBreadcrumbItem[] };

const CurrentBreadcrumbs = createContext<readonly AdminBreadcrumbItem[] | null>(null);
const BreadcrumbRegistration = createContext<{
  pathname: string;
  search: string;
  register: (entry: Registration) => () => void;
} | null>(null);

function normalizeSearch(search: string) {
  const params = new URLSearchParams(search);
  params.sort();
  return params.toString();
}

/** The protected shell keys this provider by the authenticated session. */
export function AdminBreadcrumbProvider({
  pathname,
  search = "",
  children,
}: {
  pathname: string;
  search?: string;
  children: ReactNode;
}) {
  const query = normalizeSearch(search);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const register = useCallback((entry: Registration) => {
    setRegistration(entry);
    return () => {
      setRegistration((current) => (current === entry ? null : current));
    };
  }, []);
  const scope = useMemo(() => ({ pathname, search: query, register }), [pathname, query, register]);
  const items =
    registration?.pathname === pathname &&
    (registration.search === undefined || registration.search === query)
      ? registration.items
      : null;

  return (
    <BreadcrumbRegistration.Provider value={scope}>
      <CurrentBreadcrumbs.Provider value={items}>{children}</CurrentBreadcrumbs.Provider>
    </BreadcrumbRegistration.Provider>
  );
}

export function useAdminBreadcrumbs(fallback: readonly AdminBreadcrumbItem[]) {
  return useContext(CurrentBreadcrumbs) ?? fallback;
}

export function useAdminBreadcrumbNavigationKey() {
  const scope = useContext(BreadcrumbRegistration);
  return scope ? `${scope.pathname}?${scope.search}` : undefined;
}

/** Pass the owning pathname and include its query when the trail depends on search params. */
export function AdminBreadcrumbForRoute({
  pathname,
  search,
  items,
}: {
  pathname: string;
  search?: string;
  items?: readonly AdminBreadcrumbItem[];
}) {
  const scope = useContext(BreadcrumbRegistration);
  const register = scope?.register;
  const query = search === undefined ? undefined : normalizeSearch(search);
  const ownsRoute = Boolean(
    pathname && scope?.pathname === pathname && (query === undefined || scope.search === query),
  );
  useLayoutEffect(() => {
    if (ownsRoute && items?.length) {
      return register?.({ pathname, search: query, items });
    }
  }, [ownsRoute, register, pathname, query, items]);
  return null;
}
