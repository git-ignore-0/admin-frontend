"use client";

import { Alert, Button, Stack, Text } from "@mantine/core";

export function RecoveryAlert({
  message,
  retryLabel,
  onRetry,
  loading = false,
  variant = "light",
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  loading?: boolean;
  variant?: "light" | "outline";
}) {
  return (
    <Alert color="red" variant={variant} role="alert">
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{message}</Text>
        <Button variant="default" loading={loading} onClick={onRetry} type="button">
          {retryLabel}
        </Button>
      </Stack>
    </Alert>
  );
}
