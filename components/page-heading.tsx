"use client";

import { Group, Stack, Text, Title, type MantineSpacing } from "@mantine/core";
import { DetailBackLink } from "@/components/detail-back-link";

export function PageHeading({
  title,
  description,
  action,
  backHref,
  backLabel,
  bottomSpacing = "lg",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  bottomSpacing?: MantineSpacing;
}) {
  return (
    <Stack component="header" gap="sm" mb={bottomSpacing}>
      {backHref && backLabel && <DetailBackLink href={backHref} label={backLabel} />}
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap={4} style={{ minWidth: 0, flex: "1 1 240px" }}>
          <Title order={1} size="h1">
            {title}
          </Title>
          {description && (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          )}
        </Stack>
        {action && <Group gap="sm">{action}</Group>}
      </Group>
    </Stack>
  );
}
