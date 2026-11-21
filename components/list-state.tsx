"use client";

import { Alert, Button, Group, Loader, Paper, Stack, Text } from "@mantine/core";

export function ListState({
  empty,
  error,
  hasData,
  isEmpty,
  loading,
  loadingLabel,
  onRetry,
  retryLabel,
}: {
  empty: string;
  error: string;
  hasData: boolean;
  isEmpty: boolean;
  loading: boolean;
  loadingLabel: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  if (!hasData && loading)
    return (
      <Paper p="md" withBorder>
        <Group role="status" gap="sm">
          <Loader size="sm" />
          <Text size="sm">{loadingLabel}</Text>
        </Group>
      </Paper>
    );
  if (error)
    return (
      <Alert color="red" role="alert">
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{error}</Text>
          <Button variant="default" onClick={onRetry} type="button">
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
          {loadingLabel}
        </Text>
      </Group>
    );
  if (isEmpty)
    return (
      <Paper p="lg" withBorder>
        <Text size="sm" c="dimmed" ta="center">
          {empty}
        </Text>
      </Paper>
    );
  return null;
}
