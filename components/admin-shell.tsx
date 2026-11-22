"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Avatar,
  Box,
  Burger,
  Button,
  Drawer,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconPlant2,
} from "@tabler/icons-react";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminHeaderContent } from "@/components/admin-header";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Icon } from "@/components/nfv-controls";
import { clearAdminNotifications } from "@/components/toast-provider";
import {
  activeAdminSection,
  adminNavigation,
  type AdminNavigationItem,
  type AdminNavigationSection,
  isActiveAdminRoute,
  resolveAdminBreadcrumbs,
} from "@/lib/admin-navigation";
import { ADMIN_SESSION_CHANGED_EVENT, pageSessionBinding } from "@/lib/client-api";
import type { AdminSessionUser } from "@/lib/session";
import classes from "./admin-shell.module.css";

type Props = {
  user: Pick<AdminSessionUser, "name" | "email" | "login_phone_number">;
  sessionBinding: string;
  children: React.ReactNode;
};
const SIDEBAR_PREFERENCE_KEY = "nfv-admin-sidebar-collapsed";

function AdminShellHeaderContent({
  items,
  ...controls
}: React.ComponentProps<typeof AdminHeaderContent>) {
  const breadcrumbs = useAdminBreadcrumbs(items);
  return <AdminHeaderContent items={breadcrumbs} {...controls} />;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Box
      component={Link}
      href="/dashboard"
      aria-label="NFV Admin"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Group gap="xs" wrap="nowrap">
        <ThemeIcon size={34} radius={11} className={classes.brandIcon}>
          <IconPlant2 size={22} stroke={1.7} />
        </ThemeIcon>
        {!compact && (
          <Box>
            <Text
              fw={770}
              size="16px"
              lh={1.1}
              c="var(--nfv-heading-color)"
              style={{ letterSpacing: "-0.04em" }}
            >
              natural
              <Text component="span" inherit c="forest.7">
                farm
              </Text>
              .
            </Text>
            <Text size="10px" c="dimmed" mt={3}>
              NFV Operations Console
            </Text>
          </Box>
        )}
      </Group>
    </Box>
  );
}

export function AdminShell({ user, sessionBinding, children }: Props) {
  const pathname = usePathname();
  const { t } = useAdminI18n();
  const sections = adminNavigation(t);
  const activeSection = activeAdminSection(pathname, sections);
  const activeItem = activeSection?.items.find((item) => isActiveAdminRoute(pathname, item.href));
  const [collapsed, setCollapsed] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  // Do not mount protected children during a partial navigation from another login.
  const stale =
    sessionChanged ||
    (typeof document !== "undefined" &&
      Boolean(
        document.documentElement.dataset.adminPageSession &&
        document.documentElement.dataset.adminPageSession !== sessionBinding,
      ));

  useEffect(() => {
    if (pageSessionBinding(sessionBinding) !== sessionBinding) {
      clearAdminNotifications();
      setSessionChanged(true);
    }
    const onSessionChanged = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === sessionBinding) {
        clearAdminNotifications();
        setMobileOpen(false);
        setSessionChanged(true);
      }
    };
    window.addEventListener(ADMIN_SESSION_CHANGED_EVENT, onSessionChanged);
    return () => window.removeEventListener(ADMIN_SESSION_CHANGED_EVENT, onSessionChanged);
  }, [sessionBinding]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY);
      if (saved === "true" || saved === "false") setCollapsed(saved === "true");
    } catch {
      /* In-memory navigation remains available when storage is restricted. */
    }
    setPreferenceLoaded(true);
  }, []);
  useEffect(() => {
    if (!preferenceLoaded) return;
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(collapsed));
    } catch {
      /* Optional preference. */
    }
  }, [collapsed, preferenceLoaded]);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!mobile) setMobileOpen(false);
  }, [mobile]);

  const userName = user.name.trim();
  const identifier = user.email?.trim() || user.login_phone_number?.trim();
  const userLabel = userName || identifier || "NFV Admin";
  const initial = (userName || identifier || "A").charAt(0).toUpperCase();
  const sidebarToggleLabel = collapsed ? t.common.expandSidebar : t.common.collapseSidebar;
  const closeMobile = () => {
    setMobileOpen(false);
    mobileTrigger.current?.focus();
  };

  function itemLink(item: AdminNavigationItem, onNavigate?: () => void) {
    const active = item === activeItem;
    return (
      <NavLink
        key={item.href}
        component={Link}
        href={item.href}
        label={item.label}
        aria-label={item.label}
        active={active}
        aria-current={active ? "page" : undefined}
        leftSection={item.icon ? <Icon name={item.icon} size={16} /> : undefined}
        onClick={onNavigate}
        c={active ? "forest.8" : "dimmed"}
        fw={active ? 690 : 520}
      />
    );
  }
  function navigation(compact: boolean, onNavigate?: () => void) {
    return (
      <Stack gap={15} component="nav" aria-label={t.common.navigation} px={10} py={16}>
        {sections.map((section: AdminNavigationSection) =>
          compact ? (
            <Menu
              key={`${section.key}:${pathname}`}
              position="right-start"
              offset={12}
              shadow="sm"
              withinPortal
              closeOnItemClick
            >
              <Tooltip label={section.label} position="right">
                <Menu.Target>
                  <ActionIcon
                    size={40}
                    variant={section.key === activeSection?.key ? "light" : "subtle"}
                    color={section.key === activeSection?.key ? "forest" : "gray"}
                    aria-label={section.label}
                  >
                    <Icon name={section.icon} />
                  </ActionIcon>
                </Menu.Target>
              </Tooltip>
              <Menu.Dropdown>
                <Menu.Label>{section.label}</Menu.Label>
                {section.items.map((item) => (
                  <Menu.Item
                    key={item.href}
                    component={Link}
                    href={item.href}
                    aria-current={item === activeItem ? "page" : undefined}
                    color={item === activeItem ? "forest" : undefined}
                    leftSection={item.icon ? <Icon name={item.icon} size={16} /> : undefined}
                  >
                    {item.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          ) : (
            <Box key={section.key}>
              <Text
                size="10px"
                c="var(--nfv-subtle-color)"
                fw={730}
                tt="uppercase"
                px={10}
                pt={8}
                mb={6}
                style={{ letterSpacing: "0.095em" }}
              >
                {section.label}
              </Text>
              <Stack gap={2}>{section.items.map((item) => itemLink(item, onNavigate))}</Stack>
            </Box>
          ),
        )}
      </Stack>
    );
  }
  return (
    <AppShell
      data-admin-session={sessionBinding}
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      data-active-section={activeSection?.key}
      layout="alt"
      header={{ height: { base: 59, sm: 67 } }}
      navbar={{
        width: collapsed ? 64 : 244,
        breakpoint: "sm",
        collapsed: { mobile: true, desktop: stale },
      }}
      padding={{ base: "md", sm: "lg" }}
      transitionDuration={150}
      classNames={{ main: classes.main }}
    >
      <AdminBreadcrumbProvider key={sessionBinding} pathname={stale ? "" : pathname}>
        <AppShell.Header withBorder={stale}>
          {!stale && (
            <AdminShellHeaderContent
              items={resolveAdminBreadcrumbs(pathname, activeItem, t)}
              navigationControl={
                <>
                  <Burger
                    ref={mobileTrigger}
                    hiddenFrom="sm"
                    opened={mobileOpen}
                    onClick={() => setMobileOpen((value) => !value)}
                    aria-label={t.common.openNavigation}
                    aria-expanded={mobileOpen}
                    aria-controls="admin-mobile-navigation"
                    size="sm"
                    w={36}
                    h={36}
                    color="var(--text-muted)"
                  />
                  <Tooltip label={sidebarToggleLabel}>
                    <ActionIcon
                      visibleFrom="sm"
                      aria-label={sidebarToggleLabel}
                      onClick={() => setCollapsed((value) => !value)}
                      size={36}
                      color="gray"
                      c="var(--text-muted)"
                    >
                      {collapsed ? (
                        <IconLayoutSidebarLeftExpand size={20} />
                      ) : (
                        <IconLayoutSidebarLeftCollapse size={20} />
                      )}
                    </ActionIcon>
                  </Tooltip>
                </>
              }
              actions={
                <>
                  <LanguageSwitcher />
                  <Menu position="bottom-end" shadow="sm" withinPortal>
                    <Menu.Target>
                      <UnstyledButton
                        aria-label={t.common.accountMenu}
                        title={userLabel}
                        className={classes.account}
                      >
                        <Avatar color="forest" radius="xl" size={30}>
                          {initial}
                        </Avatar>
                      </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>
                        {userLabel}
                        {identifier && identifier !== userLabel && (
                          <Text size="xs" c="dimmed">
                            {identifier}
                          </Text>
                        )}
                      </Menu.Label>
                      <form action="/api/auth/logout" method="post">
                        <input type="hidden" name="sessionBinding" value={sessionBinding} />
                        <Menu.Item
                          component="button"
                          type="submit"
                          color="red"
                          leftSection={<IconLogout size={16} />}
                        >
                          {t.common.logout}
                        </Menu.Item>
                      </form>
                    </Menu.Dropdown>
                  </Menu>
                </>
              }
            />
          )}
        </AppShell.Header>
        {!stale && (
          <>
            <AppShell.Navbar
              aria-hidden={mobile || undefined}
              inert={mobile || undefined}
              className={classes.navbar}
            >
              <AppShell.Section h={67} px={collapsed ? 15 : 17} className={classes.brandSection}>
                <Brand compact={collapsed} />
              </AppShell.Section>
              <AppShell.Section component={ScrollArea} grow scrollbarSize={4}>
                {navigation(collapsed)}
              </AppShell.Section>
            </AppShell.Navbar>
            <Drawer
              opened={mobileOpen && Boolean(mobile)}
              onClose={closeMobile}
              title={<Brand />}
              closeButtonProps={{ "aria-label": t.common.closeNavigation }}
              position="left"
              size={280}
              returnFocus
              trapFocus
              id="admin-mobile-navigation"
              styles={{
                body: {
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  height: "calc(100% - 76px)",
                },
              }}
            >
              <ScrollArea flex={1} scrollbarSize={4}>
                {navigation(false, closeMobile)}
              </ScrollArea>
            </Drawer>
          </>
        )}
        <AppShell.Main>
          {stale ? (
            <Alert color="orange" role="alert">
              <Group gap="sm">
                <Text size="sm">{t.common.sessionChanged}</Text>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  {t.common.reloadPage}
                </Button>
              </Group>
            </Alert>
          ) : (
            children
          )}
        </AppShell.Main>
      </AdminBreadcrumbProvider>
    </AppShell>
  );
}
