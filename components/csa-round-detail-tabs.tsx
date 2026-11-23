"use client";

import { Tabs } from "@mantine/core";
import type { ReactNode } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import type { CSARoundStatus } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundDetailTabs({
  status,
  participants,
  demand,
  settings,
}: {
  status: CSARoundStatus;
  participants: ReactNode;
  demand: ReactNode;
  settings: ReactNode;
}) {
  const { locale } = useAdminI18n();
  const copy = csaRoundsCopy(locale);
  return (
    <Tabs defaultValue={status === "draft" ? "settings" : "participants"} keepMounted>
      <Tabs.List aria-label={copy.detailTabs}>
        <Tabs.Tab value="participants">{copy.membersTab}</Tabs.Tab>
        <Tabs.Tab value="demand">{copy.demandTab}</Tabs.Tab>
        <Tabs.Tab value="settings">{copy.settingsTab}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="participants" pt="md" miw={0}>
        {participants}
      </Tabs.Panel>
      <Tabs.Panel value="demand" pt="md" miw={0}>
        {demand}
      </Tabs.Panel>
      <Tabs.Panel value="settings" pt="md" miw={0}>
        {settings}
      </Tabs.Panel>
    </Tabs>
  );
}
