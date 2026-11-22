"use client";

import { Box, Text, Tooltip } from "@mantine/core";
import { IconRosetteDiscountCheck } from "@tabler/icons-react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { recordDetailDrawer } from "@/components/record-detail-drawer";
import type { AdminUserListItem } from "@/lib/types";

export function UserEmail({ user }: { user: Pick<AdminUserListItem, "email" | "email_verified"> }) {
  const { t } = useAdminI18n();
  return (
    <Text {...recordDetailDrawer.metadata} style={{ overflowWrap: "anywhere" }}>
      {user.email || t.users.emailMissing}
      {user.email && user.email_verified && (
        <Tooltip label={t.users.emailVerified}>
          <Box
            component="span"
            role="img"
            aria-label={t.users.emailVerified}
            ms={4}
            c="var(--success)"
            style={{ display: "inline-flex", verticalAlign: "text-bottom" }}
          >
            <IconRosetteDiscountCheck size={14} aria-hidden />
          </Box>
        </Tooltip>
      )}
    </Text>
  );
}
