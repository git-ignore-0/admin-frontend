"use client";

import Link from "next/link";
import { Avatar, Box, Button, Center, Group, Select, Stack, Text, Title } from "@mantine/core";
import { IconMenu2 } from "@tabler/icons-react";
import { useState } from "react";
import { AdminHeaderContent } from "@/components/admin-header";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { sampleNavigationBreadcrumbs, sampleNavigationHref } from "./sample-navigation";
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
  const [width, setWidth] = useState("360");
  const [example, setExample] = useState("root");
  const standard = initialRecords[0];
  const long = initialRecords[3];
  const items =
    example === "root"
      ? [{ label: t.breadcrumb.uiFoundation }]
      : sampleNavigationBreadcrumbs(long, locale, { edit: example === "deep" });

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Title order={2}>Header and navigation</Title>
        <Text size="sm" c="dimmed">
          Use the admin Header above to compare the root, overlay and child-page contexts.
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
          <Button component={Link} variant="default" href={sampleNavigationHref(standard.id)}>
            Open sample child page
          </Button>
          <Button
            component={Link}
            variant="default"
            href={sampleNavigationHref(long.id, { edit: true })}
          >
            Open long example with deeper navigation
          </Button>
        </Group>
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
            data={["320", "360", "390"].map((value) => ({ value, label: `${value} px` }))}
          />
          <Select
            label="Header preview context"
            value={example}
            onChange={(value) => value && setExample(value)}
            data={[
              { value: "root", label: "Root" },
              { value: "child", label: "Child page with a long name" },
              { value: "deep", label: "Deep navigation" },
            ]}
          />
        </Group>
        <Text size="sm" c="dimmed">
          This preview changes the component width. The sidebar and avatar positions are shown for
          layout review. Resize the browser to try the real mobile navigation.
        </Text>
        <Box component="section" aria-label="Header width preview" maw={Number(width)} w="100%">
          <AdminHeaderContent
            items={items}
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
