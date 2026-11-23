"use client";

import { Box, Divider, Paper, Select, Skeleton, Table, VisuallyHidden } from "@mantine/core";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { Pagination } from "@/components/pagination";
import { requestErrorMessage } from "@/lib/client-error";
import { csaRoundStatuses, type CSARoundStatus, type RoundPage } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";
import type { PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function useCSARoundPage<T>(
  fetchPage: (page: number, signal: AbortSignal) => Promise<RoundPage<T>>,
  page: number,
  query: string,
  replacePage: (page: number) => void,
  enabled = true,
) {
  const { t } = useAdminI18n();
  const dictionary = useRef(t);
  dictionary.current = t;
  const getErrorMessage = useCallback(
    (error: unknown) => requestErrorMessage(error, dictionary.current),
    [],
  );
  const fetchForQuery = useCallback(
    async (page: number, signal: AbortSignal) => {
      const result = await fetchPage(page, signal);
      return { data: result.data, meta: { ...result.meta, query } };
    },
    [fetchPage, query],
  );
  const result = usePaginatedList({
    fetchPage: fetchForQuery,
    getErrorMessage,
    controlledPage: page,
    enabled,
  });
  const { error, loading, meta } = result;
  const currentMeta = meta?.query === query && meta.page === page ? meta : null;

  useEffect(() => {
    if (!enabled || loading || error || !currentMeta) return;
    const lastPage = Math.max(1, Math.ceil(currentMeta.total / currentMeta.page_size));
    if (page > lastPage) replacePage(lastPage);
  }, [currentMeta, enabled, error, loading, page, replacePage]);

  return { ...result, items: currentMeta ? result.items : null, meta: currentMeta };
}

export function CSARoundStatusSelect({
  value,
  onChange,
}: {
  value: CSARoundStatus | "";
  onChange: (status: CSARoundStatus | "") => void;
}) {
  const { locale } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  return (
    <Select
      label={c.roundStatus}
      placeholder={c.allStatuses}
      value={value || null}
      onChange={(value) => onChange(csaRoundStatuses.find((option) => option === value) ?? "")}
      data={csaRoundStatuses.map((value) => ({ value, label: c.statuses[value] }))}
      comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
      clearable
    />
  );
}

export function CSARoundListResults({
  title,
  columns,
  rows,
  minWidth,
  filtered,
  empty,
  error,
  loading,
  meta,
  onPage,
  onRetry,
}: {
  title: string;
  columns: string[];
  rows: ReactNode[] | null;
  minWidth: number;
  filtered: boolean;
  empty: string;
  error: string;
  loading: boolean;
  meta: PaginationMeta | null;
  onPage: (page: number) => void;
  onRetry: () => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const results = useRef<HTMLDivElement>(null);
  const initialLoading = rows === null && !error;
  const table = (
    <Table.ScrollContainer
      aria-hidden={initialLoading || undefined}
      aria-label={title}
      minWidth={minWidth}
      role="region"
      tabIndex={initialLoading ? undefined : 0}
      type="native"
    >
      <Table aria-label={title} aria-busy={loading || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            {columns.map((label) => (
              <Table.Th key={label} scope="col">
                {label}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading
            ? Array.from({ length: 5 }, (_, row) => (
                <Table.Tr key={row}>
                  {columns.map((label) => (
                    <Table.Td key={label}>
                      <Skeleton height={16} width="75%" />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            : rows}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Paper
      ref={results}
      role="group"
      aria-label={title}
      tabIndex={-1}
      withBorder
      style={{ overflow: "hidden" }}
    >
      {Boolean(rows?.length) && table}
      {rows !== null && loading && <VisuallyHidden role="status">{c.refreshing}</VisuallyHidden>}
      <ListState
        embedded
        empty={empty}
        noResults={filtered ? t.membershipCatalog.noMatches : undefined}
        error={error}
        hasData={rows !== null}
        isEmpty={rows?.length === 0}
        loading={initialLoading}
        loadingLabel={c.loading}
        loadingPlaceholder={table}
        onRetry={onRetry}
        retryLabel={t.common.retry}
      />
      {meta && (
        <>
          <Divider />
          <Box p="sm">
            <Pagination
              page={meta.page}
              pageSize={meta.page_size}
              total={meta.total}
              onPage={(next) => {
                results.current?.focus({ preventScroll: true });
                onPage(next);
              }}
              disabled={loading}
              previousLabel={t.common.previous}
              nextLabel={t.common.next}
              summary={t.common.pagination}
              resultCountLabel={t.common.resultCount}
              resultCountSingularLabel={t.common.resultCountSingular}
            />
          </Box>
        </>
      )}
    </Paper>
  );
}
