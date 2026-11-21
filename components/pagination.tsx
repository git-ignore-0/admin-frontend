"use client";

import { Group, Pagination as MantinePagination, Text } from "@mantine/core";

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
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  summary: string;
  disabled?: boolean;
  /** Retained while business modules migrate; both variants now use Mantine. */
  controls?: "default" | "nfv";
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const label = summary.replace("{page}", String(page)).replace("{pages}", String(pages));
  return (
    <Group
      component="nav"
      aria-busy={disabled}
      aria-label={label}
      justify="flex-end"
      gap="sm"
      mt="var(--admin-pagination-gap, var(--mantine-spacing-md))"
    >
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <MantinePagination
        total={pages}
        value={page}
        onChange={onPage}
        disabled={disabled}
        size="sm"
        siblings={0}
        boundaries={1}
        getControlProps={(control) => ({
          "aria-label":
            control === "previous" ? previousLabel : control === "next" ? nextLabel : control,
        })}
      />
    </Group>
  );
}
