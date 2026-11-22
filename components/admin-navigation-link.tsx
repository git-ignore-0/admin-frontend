"use client";

import Link from "next/link";
import { createContext, useContext, type ComponentProps } from "react";
import { isInternalAdminHref } from "@/lib/admin-navigation";

export type AdminNavigate = (
  href: string,
  options: { replace?: boolean; scroll?: boolean },
) => void;
const AdminNavigationContext = createContext<AdminNavigate | null>(null);
export const AdminNavigationProvider = AdminNavigationContext.Provider;

type Props = Omit<ComponentProps<typeof Link>, "href" | "as" | "legacyBehavior"> & {
  href: string;
};

/** Keep Next Link's prefetch and click eligibility. The persistent shell can own the transition. */
export function AdminNavigationLink({ href, onNavigate, replace, scroll, ...props }: Props) {
  const navigate = useContext(AdminNavigationContext);
  return (
    <Link
      {...props}
      href={href}
      replace={replace}
      scroll={scroll}
      onNavigate={(event) => {
        let canceled = false;
        onNavigate?.({
          preventDefault() {
            canceled = true;
            event.preventDefault();
          },
        });
        if (!navigate || canceled || !isInternalAdminHref(href)) return;

        const current = window.location;
        const destination = new URL(href, current.href);
        // Link owns hash scrolling and can supersede a pending request by reopening the current route.
        if (destination.pathname === current.pathname && destination.search === current.search) {
          return;
        }

        event.preventDefault();
        navigate(href, { replace, scroll });
      }}
    />
  );
}
