"use client";

import { useSearchParams } from "next/navigation";
import { Avatar, Box, Button, Center, Group, Select, Stack, Text, Title } from "@mantine/core";
import { IconMenu2 } from "@tabler/icons-react";
import { useState } from "react";
import { AdminHeaderContent } from "@/components/admin-header";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { adminNavigation, resolveAdminBreadcrumbs } from "@/lib/admin-navigation";
import {
  readSampleListContext,
  sampleNavigationBreadcrumbs,
  sampleNavigationHref,
  sampleParentHref,
  type SampleNavigationContext,
} from "./sample-navigation";
import { initialRecords } from "./sample-records";

export function HeaderNavigationExamples({
  onOpenDrawer,
  onOpenModal,
  onReviewList,
  onReviewToolbar,
}: {
  onOpenDrawer?: (trigger: HTMLButtonElement) => void;
  onOpenModal: (trigger: HTMLButtonElement) => void;
  onReviewList: () => void;
  onReviewToolbar: () => void;
}) {
  const { t, locale } = useAdminI18n();
  const search = useSearchParams();
  const context: SampleNavigationContext = {
    ...readSampleListContext((key) => search?.get(key)),
    tab: "navigation",
  };
  const [width, setWidth] = useState("640");
  const [example, setExample] = useState("root");
  const standard = initialRecords[0];
  const long = initialRecords[3];
  const csaPath = "/csa-purchase-requests";
  const csaItem = adminNavigation(t)
    .flatMap(({ items }) => items)
    .find(({ href }) => href === csaPath);
  const items =
    example === "root" || example === "csa"
      ? resolveAdminBreadcrumbs(
          example === "root" ? csaPath : `${csaPath}/example`,
          csaItem,
          t,
        ).map((item) => (item.href ? { ...item, href: sampleParentHref(context) } : item))
      : sampleNavigationBreadcrumbs(long, locale, { edit: example === "deep", context });

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Title order={2}>Header and navigation</Title>
        <Text size="sm" c="dimmed">
          Compare the temporary detail with child pages that use fixed sample records.
        </Text>
        <Group gap="xs">
          <Button
            variant="default"
            disabled={!onOpenDrawer}
            onClick={(event) => onOpenDrawer?.(event.currentTarget)}
          >
            Open sample detail
          </Button>
          <Button variant="default" onClick={(event) => onOpenModal(event.currentTarget)}>
            Open sample modal
          </Button>
          <Button
            component={AdminNavigationLink}
            variant="default"
            href={sampleNavigationHref(standard.id, { context })}
          >
            Open sample child page
          </Button>
          <Button
            component={AdminNavigationLink}
            variant="default"
            href={sampleNavigationHref(long.id, { edit: true, context })}
          >
            Open long example with deeper navigation
          </Button>
        </Group>
      </Stack>

      <Stack gap="sm" align="flex-start">
        <Title order={2}>Route loading and recovery</Title>
        <Text size="sm" c="dimmed">
          This development preview simulates slow page rendering. Watch the Header and content while
          opening it, then use its error action to try the shared retry.
        </Text>
        <Button
          component={AdminNavigationLink}
          href={sampleNavigationHref("route-preview", { context })}
          variant="default"
        >
          Open slow route preview
        </Button>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Preserve the sample list</Title>
        <Text size="sm" c="dimmed">
          Apply a search or filter in List Toolbar. In Data List, open a record as a page and use
          its parent breadcrumb to return to the same results and page.
        </Text>
        <Group gap="xs">
          <Button variant="default" onClick={onReviewToolbar}>
            Review sample search and filters
          </Button>
          <Button variant="default" onClick={onReviewList}>
            Review sample list
          </Button>
        </Group>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Header width preview</Title>
        <Group gap="sm" align="flex-end">
          <Select
            label="Header preview width"
            value={width}
            onChange={(value) => value && setWidth(value)}
            data={["320", "360", "390", "640"].map((value) => ({ value, label: `${value} px` }))}
          />
          <Select
            label="Header preview context"
            value={example}
            onChange={(value) => value && setExample(value)}
            data={[
              { value: "root", label: "Root" },
              { value: "csa", label: "CSA purchase request details" },
              { value: "child", label: "Child page with a long name" },
              { value: "deep", label: "Deep navigation" },
            ]}
          />
        </Group>
        <Text size="sm" c="dimmed">
          On desktop, use 640 px to compare the 16 px root title with the 13 px breadcrumb labels.
          Use 320, 360 or 390 px to review long labels and overflow. Switch to VI to see the
          Vietnamese labels.
        </Text>
        <Box component="section" aria-label="Header width preview" maw={Number(width)} w="100%">
          <AdminHeaderContent
            items={items}
            navigationKey={example}
            navigationControl={
              <Center w={36} h={36} c="dimmed" aria-hidden>
                <IconMenu2 size={20} />
              </Center>
            }
            actions={
              <Group gap="xs" wrap="nowrap">
                <LanguageSwitcher />
                <Avatar color="forest" radius="xl" size={30} aria-hidden>
                  A
                </Avatar>
              </Group>
            }
          />
        </Box>
      </Stack>
    </Stack>
  );
}
