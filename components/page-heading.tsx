"use client";

import { Group, Stack, Text, Title, VisuallyHidden, type MantineSpacing } from "@mantine/core";
import { DetailBackLink } from "@/components/detail-back-link";

export function PageHeading({
  title,
  description,
  action,
  backHref,
  backLabel,
  bottomSpacing = "lg",
  visuallyHiddenTitle = false,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  bottomSpacing?: MantineSpacing;
  visuallyHiddenTitle?: boolean;
}) {
  const back = backHref && backLabel && <DetailBackLink href={backHref} label={backLabel} />;
  const heading = visuallyHiddenTitle ? (
    <VisuallyHidden component="h1">{title}</VisuallyHidden>
  ) : (
    <Title order={1} size="h1">
      {title}
    </Title>
  );

  if (visuallyHiddenTitle && !back && !description && !action) return heading;

  return (
    <Stack component="header" gap="sm" mb={bottomSpacing}>
      {back}
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap={4} style={{ minWidth: 0, flex: "1 1 240px" }}>
          {heading}
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
