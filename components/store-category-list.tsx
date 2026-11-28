"use client";
import { Box, Button, Divider, Stack, Table, Text } from "@mantine/core";
import { FormSelect, Status } from "@/components/nfv-controls";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { ListState } from "@/components/list-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { ListToolbar } from "@/components/list-toolbar";
import { ListResultSummary } from "@/components/pagination";
import { listStoreCategories } from "@/lib/commerce-api";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { categoryName, categoryTreeRows } from "@/lib/store-categories";
import type { StoreCategory } from "@/lib/types";

export function StoreCategoryList() {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [snapshot, setSnapshot] = useState<{ key: string; rows: StoreCategory[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const key = JSON.stringify([search, active]);
  const items = snapshot?.key === key ? snapshot.rows : null;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setError("");
    listStoreCategories({ search, ...(active ? { is_active: active === "true" } : {}) }, signal)
      .then((result) => {
        if (!signal.aborted) setSnapshot({ key, rows: result });
      })
      .catch((caught) => {
        if (signal.aborted) return;
        if (isProtectedDataError(caught)) setSnapshot(null);
        setError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [search, active, key, reloadKey, t]);

  function submit(input: string) {
    const value = input.trim();
    if (value === search) reload();
    else setSearch(value);
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
    setActive("");
  }

  const initialLoading = loading && items === null;
  const rows = categoryTreeRows(items ?? []);
  const filtered = Boolean(search || active);
  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={480}
      role="region"
      aria-label={copy.categories}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
    >
      <Table aria-label={copy.categories} styles={{ td: { overflowWrap: "anywhere" } }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{copy.categoryName}</Table.Th>
            <Table.Th scope="col">{copy.levelHeading}</Table.Th>
            <Table.Th scope="col">{copy.order}</Table.Th>
            <Table.Th scope="col">{copy.status}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading ? (
            <TableSkeletonRows columns={4} height={30} />
          ) : (
            rows.map(({ category, depth }) => (
              <Table.Tr key={category.id}>
                <Table.Td>
                  <Stack gap={4} ms={`${Math.min(depth - 1, 2) * 1.25}rem`}>
                    <DataListRecordLink
                      component={Link}
                      href={`/store-catalog/categories/${category.id}`}
                    >
                      {categoryName(category, locale)}
                    </DataListRecordLink>
                    <Text size="sm" c="dimmed">
                      /{category.slug}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>{copy.level.replace("{level}", String(depth))}</Table.Td>
                <Table.Td>{category.sort_order}</Table.Td>
                <Table.Td>
                  <Status
                    domain="availability"
                    status={category.is_active ? "active" : "inactive"}
                    label={category.is_active ? copy.active : copy.inactive}
                  />
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack component="section" aria-busy={loading} gap="md" miw={0}>
      <ListToolbar
        busy={loading}
        refresh={{
          label: t.common.refreshList,
          onRefresh: reload,
          loading: loading && items !== null,
          disabled: initialLoading,
        }}
        search={{
          label: copy.search,
          placeholder: copy.searchCategory,
          value: query,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setQuery,
          onSubmit: submit,
          clearLabel: t.common.clearFilters,
          onClear: clearFilters,
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: active ? 1 : 0,
          clearLabel: t.common.clearFilters,
          clearDisabled: !filtered && !query,
          onClear: clearFilters,
          children: (
            <FormSelect
              label={copy.status}
              disabled={loading}
              comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
              value={active}
              onChange={(selection) => setActive(selection ?? "")}
              data={[
                { value: "", label: copy.all },
                { value: "true", label: copy.active },
                { value: "false", label: copy.inactive },
              ]}
            />
          ),
        }}
      />
      <DataListPaper>
        {rows.length > 0 && table}
        <Box p={error && !loading ? "md" : undefined}>
          <ListState
            embedded
            loadingPlaceholder={table}
            empty={copy.noCategories}
            noResults={filtered ? copy.noMatchingCategories : undefined}
            action={
              filtered && items?.length === 0 ? (
                <Button variant="default" onClick={clearFilters}>
                  {t.common.clearFilters}
                </Button>
              ) : undefined
            }
            error={loading ? "" : error}
            hasData={items !== null}
            isEmpty={items?.length === 0}
            loading={initialLoading}
            loadingLabel={copy.loading}
            onRetry={reload}
            retryLabel={t.common.retry}
          />
        </Box>
        {items && (
          <>
            <Divider />
            <Box component="footer" px="md" py="sm">
              <ListResultSummary
                count={items.length}
                label={t.common.resultCount}
                singularLabel={t.common.resultCountSingular}
              />
            </Box>
          </>
        )}
      </DataListPaper>
    </Stack>
  );
}
