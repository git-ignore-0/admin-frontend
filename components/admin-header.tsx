"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ActionIcon, Anchor, Box, Breadcrumbs, Flex, Menu, Text } from "@mantine/core";
import { IconChevronRight, IconDots } from "@tabler/icons-react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { isInternalAdminHref, type AdminBreadcrumbItem } from "@/lib/admin-navigation";
import classes from "./admin-shell.module.css";

type Props = {
  items: readonly AdminBreadcrumbItem[];
  navigationKey?: string;
  navigationControl?: ReactNode;
  actions?: ReactNode;
};

function BreadcrumbOverflowMenu({
  ancestors,
  firstLink,
}: {
  ancestors: readonly Required<AdminBreadcrumbItem>[];
  firstLink: RefObject<HTMLAnchorElement | null>;
}) {
  const { t } = useAdminI18n();
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = trigger.current;
    if (!opened || !target) return;

    // A wider breadcrumb column can hide the trigger while its Menu is open.
    const observer = new ResizeObserver(() => {
      if (target.getClientRects().length > 0) return;
      setOpened(false);
      const focused = document.activeElement;
      if (focused === document.body || focused === target || dropdown.current?.contains(focused)) {
        firstLink.current?.focus({ preventScroll: true });
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [firstLink, opened]);

  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="sm"
      withinPortal={false}
    >
      <Menu.Target>
        <ActionIcon
          ref={trigger}
          size={30}
          color="gray"
          c="var(--text-muted)"
          aria-label={t.common.breadcrumbOverflow}
        >
          <IconDots size={18} aria-hidden />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown ref={dropdown} className={classes.breadcrumbMenu}>
        {ancestors.map(({ href, label }) => (
          <Menu.Item key={href} component={Link} href={href}>
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export function AdminHeaderContent({ items, navigationKey, navigationControl, actions }: Props) {
  const { t } = useAdminI18n();
  const firstLink = useRef<HTMLAnchorElement>(null);
  const current = items.at(-1);
  const ancestors = items
    .slice(0, -1)
    .flatMap(({ href, label }) => (href && isInternalAdminHref(href) ? [{ href, label }] : []));
  const links = ancestors.map(({ href, label }, index) => (
    <Anchor
      key={href}
      ref={index === 0 ? firstLink : undefined}
      component={Link}
      href={href}
      title={label}
      className={[
        classes.breadcrumbLink,
        index > 0 ? classes.breadcrumbIntermediate : classes.breadcrumbFirst,
      ].join(" ")}
    >
      {label}
    </Anchor>
  ));

  return (
    <Box className={classes.headerFrame}>
      <Flex align="center" gap="xs" px="md" className={classes.headerRow}>
        {navigationControl && <Box className={classes.headerControls}>{navigationControl}</Box>}
        {current ? (
          <Box
            component="nav"
            aria-label={t.common.breadcrumbs}
            className={classes.breadcrumbColumn}
          >
            <Breadcrumbs
              separator={<IconChevronRight size={14} />}
              separatorMargin="xs"
              classNames={{ root: classes.breadcrumbs, separator: classes.breadcrumbSeparator }}
              attributes={{ separator: { "aria-hidden": true } }}
            >
              {links[0]}
              {ancestors.length > 0 && (
                <Box
                  className={classes.breadcrumbOverflow}
                  data-deep={ancestors.length > 1 || undefined}
                >
                  <BreadcrumbOverflowMenu
                    key={navigationKey}
                    ancestors={ancestors}
                    firstLink={firstLink}
                  />
                </Box>
              )}
              {links.slice(1)}
              <Text
                component="span"
                aria-current="page"
                title={current.label}
                className={
                  items.length === 1
                    ? `${classes.breadcrumbCurrent} ${classes.breadcrumbRoot}`
                    : classes.breadcrumbCurrent
                }
              >
                {current.label}
              </Text>
            </Breadcrumbs>
          </Box>
        ) : null}
        {actions && (
          <Flex align="center" gap="xs" className={classes.headerActions}>
            {actions}
          </Flex>
        )}
      </Flex>
    </Box>
  );
}
