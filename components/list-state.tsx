"use client";

import { Alert, Button, Group, Loader, Paper, Stack, Text } from "@mantine/core";

export function ListState({
  empty,
  embedded = false,
  error,
  hasData,
  isEmpty,
  loading,
  loadingLabel,
  noResults,
  onRetry,
  refreshingLabel = loadingLabel,
  retryLabel,
}: {
  empty: string;
  /** Use inside an existing bordered list container. */
  embedded?: boolean;
  error: string;
  hasData: boolean;
  isEmpty: boolean;
  loading: boolean;
  loadingLabel: string;
  /** Supply when the empty result follows an applied query or filter. */
  noResults?: string;
  onRetry: () => void;
  refreshingLabel?: string;
  retryLabel: string;
}) {
  if (!hasData && loading)
    return (
      <Paper p="md" withBorder={!embedded}>
        <Group role="status" gap="sm">
          <Loader size="sm" />
          <Text size="sm">{loadingLabel}</Text>
        </Group>
      </Paper>
    );
  if (error)
    return (
      <Alert color="red" variant={hasData ? "outline" : "light"} role="alert">
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{error}</Text>
          <Button variant="default" loading={loading} onClick={onRetry} type="button">
            {retryLabel}
          </Button>
        </Stack>
      </Alert>
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
  if (isEmpty)
    return (
      <Paper p="lg" withBorder={!embedded}>
        <Text size="sm" c="dimmed" ta="center">
          {noResults ?? empty}
        </Text>
      </Paper>
    );
  return null;
}
