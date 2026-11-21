"use client";

import { Button, Flex, Group, Stack, Text, TextInput } from "@mantine/core";
import type { FormEvent, ReactNode } from "react";

export function ListToolbar({
  busy,
  clearLabel,
  filter,
  hasFilters,
  onClear,
  onQueryChange,
  onSubmit,
  placeholder,
  query,
  resultCount,
  resultCountLabel,
  resultCountSingularLabel,
  searchLabel,
  searchSubmitLabel,
  actions,
}: {
  busy: boolean;
  clearLabel: string;
  filter?: ReactNode;
  hasFilters: boolean;
  onClear: () => void;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  query: string;
  resultCount?: number;
  resultCountLabel: string;
  resultCountSingularLabel: string;
  searchLabel: string;
  searchSubmitLabel: string;
  controls?: "default" | "nfv";
  actions?: ReactNode;
}) {
  return (
    <Stack gap="xs">
      <form role="search" aria-busy={busy} onSubmit={onSubmit}>
        <Flex gap="sm" wrap="wrap" align="flex-end">
          <TextInput
            label={searchLabel}
            disabled={busy}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder={placeholder}
            type="search"
            value={query}
            flex="1 1 240px"
            miw={0}
          />
          {filter}
          <Group gap="sm">
            <Button disabled={busy} type="submit">
              {searchSubmitLabel}
            </Button>
            {actions}
            {hasFilters && (
              <Button variant="default" disabled={busy} onClick={onClear} type="button">
                {clearLabel}
              </Button>
            )}
          </Group>
        </Flex>
      </form>
      <ListResultSummary
        count={resultCount}
        label={resultCountLabel}
        singularLabel={resultCountSingularLabel}
      />
    </Stack>
  );
}

export function ListResultSummary({
  count,
  label,
  singularLabel,
}: {
  count?: number;
  label: string;
  singularLabel: string;
}) {
  if (count === undefined) return null;
  return (
    <Text size="sm" c="dimmed" aria-atomic="true" aria-live="polite">
      {(count === 1 ? singularLabel : label).replace("{count}", String(count))}
    </Text>
  );
}
