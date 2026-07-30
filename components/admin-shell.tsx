"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";

type Props = { user: { email: string; name: string }; children: React.ReactNode };

export function AdminShell({ user, children }: Props) {
  const pathname = usePathname();
  const { t } = useAdminI18n();
  const links = [
    ["/dashboard", t.common.dashboard],
    ["/users", t.common.users],
    ["/points", t.common.points],
    ["/rewards", t.common.rewards],
    ["/redemptions", t.common.redemptions],
    ["/settings", t.common.settings],
    ["/workshops", t.common.workshops],
  ] as const;
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link className="brand-mark" href="/dashboard">
          <span className="brand-seed">N</span>
          <span>NFV Admin</span>
        </Link>
        <nav className="nav" aria-label={t.common.navigation}>
          {links.map(([href, label]) => (
            <Link
              className={`nav-link ${pathname.startsWith(href) ? "active" : ""}`}
              href={href}
              key={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
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
