"use client";

import { Box, Group, Loader, Paper, Stack, Text, VisuallyHidden } from "@mantine/core";
import { IconInbox, IconSearch } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { RecoveryAlert } from "@/components/recovery-alert";

export function ListState({
  action,
  description,
  empty,
  embedded = false,
  error,
  hasData,
  isEmpty,
  loading,
  loadingLabel,
  loadingPlaceholder,
  noResults,
  onRetry,
  refreshingLabel = loadingLabel,
  retryLabel,
}: {
  /** Recovery or next action supplied by the caller for the current empty state. */
  action?: ReactNode;
  description?: string;
  empty: string;
  /** Use inside an existing bordered list container. */
  embedded?: boolean;
  error: string;
  hasData: boolean;
  isEmpty: boolean;
  loading: boolean;
  loadingLabel: string;
  loadingPlaceholder?: ReactNode;
  /** Supply when the empty result follows an applied query or filter. */
  noResults?: string;
  onRetry: () => void;
  refreshingLabel?: string;
  retryLabel: string;
}) {
  if (!hasData && loading) {
    if (loadingPlaceholder)
      return (
        <>
          <VisuallyHidden role="status">{loadingLabel}</VisuallyHidden>
          {loadingPlaceholder}
        </>
      );
    const indicator = (
      <Group role="status" gap="sm">
        <Loader size="sm" />
        <Text size="sm">{loadingLabel}</Text>
      </Group>
    );
    return embedded ? <Box p="md">{indicator}</Box> : <Paper p="md">{indicator}</Paper>;
  }
  if (error)
    return (
      <RecoveryAlert
        message={error}
        retryLabel={retryLabel}
        onRetry={onRetry}
        loading={loading}
        variant={hasData ? "outline" : "light"}
      />
    );
  if (loading)
    return (
      <Group role="status" aria-live="polite" gap="xs" py="xs">
        <Loader size="xs" />
        <Text size="sm" c="dimmed">
          {refreshingLabel}
        </Text>
      </Group>
    );
  if (isEmpty) {
    const Icon = noResults ? IconSearch : IconInbox;
    const content = (
      <Stack gap="xs" align="center" ta="center">
        <Box c="dimmed">
          <Icon aria-hidden size={20} />
        </Box>
        <Text size="sm" fw={600}>
          {noResults ?? empty}
        </Text>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
        {action}
      </Stack>
    );
    return embedded ? <Box p="lg">{content}</Box> : <Paper p="lg">{content}</Paper>;
  }
  return null;
}
