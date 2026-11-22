"use client";

import { Box, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";

import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { MembershipStatusBadge } from "@/components/membership-status-badge";
import { formatAdminDate, membershipLastReceiptDate } from "@/lib/admin-date";
import type { AdminDictionary } from "@/lib/admin-i18n";
import type { AdminMembership } from "@/lib/types";

export function CustomerMembershipCard({ item, t }: { item: AdminMembership; t: AdminDictionary }) {
  const dates = [
    [t.memberships.startDate, item.start_date],
    [t.memberships.lastReceiptDate, membershipLastReceiptDate(item.end_date)],
    ...(item.extension_end_date ? [[t.memberships.extensionEndDate, item.extension_end_date]] : []),
  ];

  return (
    <Paper component="article" withBorder p="sm" miw={0}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Title order={3} size="md" fw={600} style={{ overflowWrap: "anywhere" }}>
            {item.package_name}
          </Title>
          <MembershipStatusBadge
            label={t.csaCustomers.membershipStatuses[item.status]}
            status={item.status}
          />
        </Group>
        <Group component="dl" m={0} gap="md">
          {dates.map(([label, date]) => (
            <Box key={label}>
              <Text component="dt" size="sm" c="dimmed">
                {label}
              </Text>
              <Text component="dd" m={0}>
                {formatAdminDate(date)}
              </Text>
            </Box>
          ))}
        </Group>
        <Button
          component={AdminNavigationLink}
          href={`/memberships/${encodeURIComponent(item.id)}`}
          variant="default"
          w="fit-content"
        >
          {t.memberships.view}
        </Button>
      </Stack>
    </Paper>
  );
}
