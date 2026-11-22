"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ActionIcon, Anchor, Box, Breadcrumbs, Flex, Menu, Text } from "@mantine/core";
import { IconChevronRight, IconDots } from "@tabler/icons-react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { isInternalAdminHref, type AdminBreadcrumbItem } from "@/lib/admin-navigation";
import classes from "./admin-shell.module.css";

type Props = {
  items: readonly AdminBreadcrumbItem[];
  navigationControl?: ReactNode;
  actions?: ReactNode;
};

export function AdminHeaderContent({ items, navigationControl, actions }: Props) {
  const { t } = useAdminI18n();
  const current = items.at(-1);
  const ancestors = items
    .slice(0, -1)
    .flatMap(({ href, label }) => (href && isInternalAdminHref(href) ? [{ href, label }] : []));
  const hasOverflow = ancestors.length > 1;
  const links = ancestors.map(({ href, label }, index) => (
    <Anchor
      key={href}
      component={Link}
      href={href}
      title={label}
      className={[
        classes.breadcrumbLink,
        index > 0 ? classes.breadcrumbIntermediate : hasOverflow ? classes.breadcrumbFirst : "",
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
              {hasOverflow && (
                <Box className={classes.breadcrumbOverflow}>
                  <Menu position="bottom-start" shadow="sm" withinPortal={false}>
                    <Menu.Target>
                      <ActionIcon
                        size={30}
                        color="gray"
                        c="var(--text-muted)"
                        aria-label={t.common.breadcrumbOverflow}
                      >
                        <IconDots size={18} aria-hidden />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown className={classes.breadcrumbMenu}>
                      {ancestors.map(({ href, label }) => (
                        <Menu.Item key={href} component={Link} href={href}>
                          {label}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                </Box>
              )}
              {links.slice(1)}
              <Text
                component="span"
                aria-current="page"
                title={current.label}
                className={classes.breadcrumbCurrent}
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
