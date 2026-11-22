"use client";

import { Box, Group, Pagination as MantinePagination, Text } from "@mantine/core";
import classes from "./pagination.module.css";

/** Existing callers pass record totals, while Mantine expects a page count. */
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  previousLabel,
  nextLabel,
  summary,
  disabled = false,
  resultCountLabel,
  resultCountSingularLabel,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  summary: string;
  disabled?: boolean;
  resultCountLabel?: string;
  resultCountSingularLabel?: string;
  /** Retained while business modules migrate; both variants now use Mantine. */
  controls?: "default" | "nfv";
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const label = summary.replace("{page}", String(page)).replace("{pages}", String(pages));
  const spacing = "var(--admin-pagination-gap, var(--mantine-spacing-md))";
  const navigation = total > pageSize && (
    <Group
      component="nav"
      aria-busy={disabled}
      aria-label={label}
      justify="flex-end"
      gap="sm"
      miw={0}
      ms={resultCountLabel === undefined ? undefined : "auto"}
      mt={resultCountLabel === undefined ? spacing : undefined}
    >
      {resultCountLabel === undefined && (
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      )}
      <MantinePagination.Root
        total={pages}
        value={page}
        onChange={onPage}
        disabled={disabled}
        size="sm"
        siblings={resultCountLabel === undefined ? 0 : 1}
        boundaries={1}
      >
        <Group gap="xs" wrap={resultCountLabel === undefined ? "wrap" : "nowrap"}>
          <MantinePagination.Previous aria-label={previousLabel} />
          <Box className={classes.numbered}>
            <MantinePagination.Items />
          </Box>
          {resultCountLabel !== undefined && (
            <Text size="sm" c="dimmed" aria-hidden className={classes.compact}>
              {page} / {pages}
            </Text>
          )}
          <MantinePagination.Next aria-label={nextLabel} />
        </Group>
      </MantinePagination.Root>
    </Group>
  );

  if (resultCountLabel === undefined) return navigation || null;
  return (
    <Group justify="space-between" gap="sm" className={classes.footer}>
      <ListResultSummary
        count={total}
        label={resultCountLabel}
        singularLabel={resultCountSingularLabel ?? resultCountLabel}
      />
      {navigation}
    </Group>
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
