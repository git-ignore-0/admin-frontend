"use client";

import { Paper, Skeleton, Stack, VisuallyHidden } from "@mantine/core";
import { useAdminI18n } from "@/components/admin-i18n-provider";

export default function AdminRouteLoading() {
  const { t } = useAdminI18n();
  return (
    <>
      <VisuallyHidden role="status">{t.common.routeLoading}</VisuallyHidden>
      <Stack gap="md" aria-hidden>
        <Skeleton height={24} width="min(12rem, 70%)" animate={false} />
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Skeleton height={14} width="45%" animate={false} />
            <Skeleton height={14} width="75%" animate={false} />
            <Skeleton height={14} width="60%" animate={false} />
          </Stack>
        </Paper>
      </Stack>
    </>
  );
}
