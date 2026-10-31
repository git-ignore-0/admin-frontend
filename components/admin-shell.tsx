"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Icon } from "@/components/nfv-controls";
import {
  activeAdminSection,
  adminNavigation,
  type AdminNavigationItem,
  type AdminNavigationSection,
  type AdminNavigationSectionKey,
  isActiveAdminRoute,
} from "@/lib/admin-navigation";

type Props = { user: { email: string; name: string }; children: React.ReactNode };

const SIDEBAR_PREFERENCE_KEY = "nfv-admin-sidebar-collapsed";
const MOBILE_NAVIGATION_QUERY = "(max-width: 820px)";
const FOCUSABLE_SELECTOR =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";

function NavigationLink({
  item,
  pathname,
  collapsed = false,
  onNavigate,
}: {
  item: AdminNavigationItem;
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const active = isActiveAdminRoute(pathname, item.href);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={`nav-link ${active ? "active" : ""}`.trim()}
      data-tooltip={collapsed ? item.label : undefined}
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
    >
      {item.icon ? <Icon name={item.icon} /> : <span aria-hidden="true" className="nav-item-dot" />}
      <span aria-hidden="true" className="nav-label">
        {item.label}
      </span>
    </Link>
  );
}

function ExpandedSection({
  section,
  pathname,
  onNavigate,
}: {
  section: AdminNavigationSection;
  pathname: string;
  onNavigate?: () => void;
}) {
  if (section.key === "main") {
    return section.items.map((item) => (
      <NavigationLink item={item} key={item.href} onNavigate={onNavigate} pathname={pathname} />
    ));
  }

  return (
    <section className="nav-section">
      <div className="nav-section-label">
        <Icon name={section.icon} />
        <span>{section.label}</span>
      </div>
      <div className="nav-section-items">
        {section.items.map((item) => (
          <NavigationLink item={item} key={item.href} onNavigate={onNavigate} pathname={pathname} />
        ))}
      </div>
    </section>
  );
}

function CollapsedSection({
  section,
  pathname,
  open,
  onToggle,
  flyoutTop,
}: {
  section: AdminNavigationSection;
  pathname: string;
  open: boolean;
  onToggle: (top: number) => void;
  flyoutTop: number;
}) {
  const label = section.label ?? "";
  const active = section.items.some((item) => isActiveAdminRoute(pathname, item.href));
  const panelId = `admin-nav-${section.key}`;

  return (
    <div className="nav-group">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={label}
        className={`nav-group-toggle ${active ? "has-active-item" : ""}`.trim()}
        data-tooltip={label}
        onClick={(event) => onToggle(event.currentTarget.getBoundingClientRect().top)}
        title={label}
        type="button"
      >
        <Icon name={section.icon} />
      </button>
      {open ? (
        <div className="nav-flyout" id={panelId} style={{ top: flyoutTop }}>
          <div className="nav-flyout-heading">{label}</div>
          {section.items.map((item) => (
            <NavigationLink item={item} key={item.href} pathname={pathname} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ user, children }: Props) {
  const pathname = usePathname();
  const { t } = useAdminI18n();
  const sections = adminNavigation(t);
  const activeSection = activeAdminSection(pathname, sections);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [openFlyout, setOpenFlyout] = useState<AdminNavigationSectionKey | null>(null);
  const [flyoutTop, setFlyoutTop] = useState(8);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY);
      if (stored === "true" || stored === "false") setCollapsed(stored === "true");
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    } finally {
      setPreferenceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!preferenceLoaded) return;
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(collapsed));
    } catch {
      // The in-memory preference remains usable when persistence is unavailable.
    }
  }, [collapsed, preferenceLoaded]);

  useEffect(() => {
    setOpenFlyout(null);
  }, [pathname, collapsed]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(MOBILE_NAVIGATION_QUERY);
    const updateViewport = () => {
      setMobileViewport(query.matches);
      if (!query.matches) setMobileOpen(false);
    };
    updateViewport();
    query.addEventListener("change", updateViewport);
    return () => query.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (mobileOpen) mobileCloseRef.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileTriggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      );
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  useEffect(() => {
    if (!openFlyout) return;
    const closeOnOutsideInteraction = (event: MouseEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node)) setOpenFlyout(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFlyout(null);
    };
    document.addEventListener("mousedown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openFlyout]);

  const userLabel = user.name && user.name !== user.email ? user.name : user.email;
  const userInitial = userLabel.trim().charAt(0).toUpperCase() || "A";
  const closeMobileDrawer = () => {
    setMobileOpen(false);
    mobileTriggerRef.current?.focus();
  };
  const renderCollapsedNavigation = collapsed && !mobileOpen;

  return (
    <div
      className="admin-shell"
      data-active-section={activeSection?.key}
      data-sidebar={collapsed ? "collapsed" : "expanded"}
    >
      <header className="mobile-admin-bar">
        <Link aria-label="NFV Admin" className="brand-mark" href="/dashboard">
          <span className="brand-seed">N</span>
          <span>NFV Admin</span>
        </Link>
        <button
          aria-controls="admin-sidebar"
          aria-expanded={mobileOpen}
          aria-label={t.common.openNavigation}
          className="mobile-menu-button"
          onClick={() => setMobileOpen(true)}
          ref={mobileTriggerRef}
          type="button"
        >
          <Icon name="menu" />
        </button>
      </header>
      {mobileOpen ? (
        <button
          aria-label={t.common.dismissNavigation}
          className="sidebar-backdrop"
          data-testid="sidebar-backdrop"
          onClick={closeMobileDrawer}
          type="button"
        />
      ) : null}
      <aside
        aria-hidden={mobileViewport && !mobileOpen ? true : undefined}
        className="sidebar"
        data-mobile-open={mobileOpen}
        id="admin-sidebar"
        inert={mobileViewport && !mobileOpen}
        ref={sidebarRef}
      >
        <div className="sidebar-header">
          <Link aria-label="NFV Admin" className="brand-mark" href="/dashboard">
            <span className="brand-seed">N</span>
            <span aria-hidden="true" className="sidebar-brand-label">
              NFV Admin
            </span>
          </Link>
          <button
            aria-label={collapsed ? t.common.expandSidebar : t.common.collapseSidebar}
            className="sidebar-collapse-button"
            onClick={() => setCollapsed((current) => !current)}
            title={collapsed ? t.common.expandSidebar : t.common.collapseSidebar}
            type="button"
          >
            <Icon name="panelLeft" />
          </button>
          {mobileOpen ? (
            <button
              aria-label={t.common.closeNavigation}
              className="mobile-drawer-close"
              onClick={closeMobileDrawer}
              ref={mobileCloseRef}
              type="button"
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>
        <nav className="nav nav-scroll" aria-label={t.common.navigation}>
          {renderCollapsedNavigation
            ? sections.map((section) =>
                section.key === "main" ? (
                  section.items.map((item) => (
                    <NavigationLink collapsed item={item} key={item.href} pathname={pathname} />
                  ))
                ) : (
                  <CollapsedSection
                    flyoutTop={flyoutTop}
                    key={section.key}
                    onToggle={(top) => {
                      setFlyoutTop(Math.max(8, Math.min(top, window.innerHeight - 260)));
                      setOpenFlyout((current) => (current === section.key ? null : section.key));
                    }}
                    open={openFlyout === section.key}
                    pathname={pathname}
                    section={section}
                  />
                ),
              )
            : sections.map((section) => (
                <ExpandedSection
                  key={section.key}
                  onNavigate={mobileOpen ? closeMobileDrawer : undefined}
                  pathname={pathname}
                  section={section}
                />
              ))}
        </nav>
        <div className="sidebar-footer">
          <LanguageSwitcher />
          <div className="sidebar-account" title={collapsed ? userLabel : undefined}>
            <span aria-hidden="true" className="sidebar-avatar">
              {userInitial}
            </span>
            <span className="sidebar-user">
              {user.name && user.name !== user.email ? <strong>{user.name}</strong> : null}
              <span>{user.email}</span>
            </span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button aria-label={t.common.logout} className="logout-button" title={t.common.logout}>
              <Icon name="logout" />
              <span aria-hidden="true" className="nav-label">
                {t.common.logout}
              </span>
            </button>
          </form>
        </div>
      </aside>
      <main className="main">
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
