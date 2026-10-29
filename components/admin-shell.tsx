"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";

type Props = { user: { email: string; name: string }; children: React.ReactNode };

type NavigationGroup = "pointsRewards" | "csa" | "store" | "farms" | "website";

const groupRoutes: Record<NavigationGroup, readonly string[]> = {
  pointsRewards: ["/points", "/rewards", "/redemptions"],
  csa: [
    "/csa-customers",
    "/csa-purchase-requests",
    "/csa-coupons",
    "/memberships",
    "/membership-catalog",
  ],
  store: ["/store-catalog", "/shipping-settings"],
  farms: ["/farms", "/tracker-farms"],
  website: ["/settings", "/membership-payment-settings", "/workshops", "/testimonials"],
};

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeGroupForPath(pathname: string): NavigationGroup | undefined {
  return (Object.entries(groupRoutes) as [NavigationGroup, readonly string[]][]).find(
    ([, routes]) => routes.some((href) => isActiveRoute(pathname, href)),
  )?.[0];
}

export function AdminShell({ user, children }: Props) {
  const pathname = usePathname();
  const { t } = useAdminI18n();
  const directLinks = [
    ["/dashboard", t.common.dashboard],
    ["/users", t.common.users],
  ] as const;
  const groups = [
    {
      key: "pointsRewards",
      label: t.common.pointsAndRewards,
      links: [
        ["/points", t.common.managePoints],
        ["/rewards", t.common.rewards],
        ["/redemptions", t.common.redemptions],
      ],
    },
    {
      key: "csa",
      label: t.common.csa,
      links: [
        ["/csa-customers", t.common.csaCustomers],
        ["/csa-purchase-requests", t.common.csaPurchaseRequests],
        ["/csa-coupons", t.common.csaCoupons],
        ["/membership-catalog", t.common.membershipCatalog],
      ],
    },
    {
      key: "store",
      label: t.common.storeCatalog,
      links: [
        ["/store-catalog", t.storeCatalog.title],
        ["/shipping-settings", t.common.shippingSettings],
      ],
    },
    {
      key: "farms",
      label: t.common.farms,
      links: [
        ["/farms", t.common.farmList],
        ["/tracker-farms", t.common.trackerFarms],
      ],
    },
    {
      key: "website",
      label: t.common.website,
      links: [
        ["/settings", t.common.settings],
        ["/membership-payment-settings", t.common.membershipPaymentSettings],
        ["/workshops", t.common.workshops],
        ["/testimonials", t.common.testimonials],
      ],
    },
  ] as const satisfies readonly {
    key: NavigationGroup;
    label: string;
    links: readonly (readonly [string, string])[];
  }[];
  const activeGroup = activeGroupForPath(pathname);
  const [openGroups, setOpenGroups] = useState<Record<NavigationGroup, boolean>>(() => ({
    pointsRewards: activeGroup === "pointsRewards",
    csa: activeGroup === "csa",
    store: activeGroup === "store",
    farms: activeGroup === "farms",
    website: activeGroup === "website",
  }));

  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((current) => ({ ...current, [activeGroup]: true }));
  }, [activeGroup, pathname]);

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link className="brand-mark" href="/dashboard">
          <span className="brand-seed">N</span>
          <span>NFV Admin</span>
        </Link>
        <nav className="nav" aria-label={t.common.navigation}>
          {directLinks.map(([href, label]) => (
            <Link
              className={`nav-link ${isActiveRoute(pathname, href) ? "active" : ""}`}
              href={href}
              key={href}
              aria-current={isActiveRoute(pathname, href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
          {groups.map((group) => {
            const expanded = openGroups[group.key];
            const panelId = `admin-nav-${group.key}`;
            return (
              <div className="nav-group" key={group.key}>
                <button
                  aria-controls={panelId}
                  aria-expanded={expanded}
                  className={`nav-group-toggle ${activeGroup === group.key ? "has-active-item" : ""}`}
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [group.key]: !current[group.key],
                    }))
                  }
                  type="button"
                >
                  <span>{group.label}</span>
                  <span aria-hidden="true" className="nav-group-chevron" />
                </button>
                <div className="nav-submenu" hidden={!expanded} id={panelId}>
                  {group.links.map(([href, label]) => {
                    const active = isActiveRoute(pathname, href);
                    return (
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={`nav-link nav-submenu-link ${active ? "active" : ""}`}
                        href={href}
                        key={href}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <LanguageSwitcher />
          <div className="sidebar-user">
            {user.name && user.name !== user.email && (
              <>
                {user.name}
                <br />
              </>
            )}
            {user.email}
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="logout-button">{t.common.logout}</button>
          </form>
        </div>
      </aside>
      <main className="main">
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
