"use client";

import {
  Anchor,
  Box,
  Button,
  Divider,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { readRoundListContext, roundPageHref } from "@/app/(admin)/csa-rounds/round-navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { openRecordFromRow } from "@/components/record-row-navigation";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
import { csaRoundStatuses, getRounds } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function CSARoundList() {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const params = useSearchParams();
  const { page, status } = readRoundListContext({
    page: params?.get("page") ?? undefined,
    status: params?.get("status") ?? undefined,
  });
  const [draftStatus, setDraftStatus] = useState(status);
  const fetchRoundPage = useCallback(
    async (page: number) => {
      const result = await getRounds(page, 20, status || undefined);
      return { data: result.data, meta: { ...result.meta, status } };
    },
    [status],
  );
  const dictionary = useRef(t);
  dictionary.current = t;
  const getErrorMessage = useCallback(
    (error: unknown) => requestErrorMessage(error, dictionary.current),
    [],
  );
  const { error, items, loading, meta, reload } = usePaginatedList({
    fetchPage: fetchRoundPage,
    getErrorMessage,
    controlledPage: page,
  });
  const currentMeta = !error && meta?.status === status && meta.page === page ? meta : null;
  const current = currentMeta ? items : null;
  const initialLoading = !current && !error;
  const columns = [c.name, c.state, c.selectionWindow, c.delivery];

  const changePage = useCallback(
    (next: number) => {
      window.history.replaceState(null, "", roundPageHref("/csa-rounds", next, status));
    },
    [status],
  );

  useEffect(() => {
    if (loading || !currentMeta) return;
    const lastPage = Math.max(1, Math.ceil(currentMeta.total / currentMeta.page_size));
    if (page > lastPage) changePage(lastPage);
  }, [changePage, currentMeta, loading, page]);

  function applyStatus(next: typeof status) {
    setDraftStatus(next);
    if (next === status) return;
    window.history.replaceState(null, "", roundPageHref("/csa-rounds", 1, next));
  }

  const table = (
    <Table.ScrollContainer
      aria-hidden={initialLoading || undefined}
      aria-label={c.title}
      minWidth={650}
      role="region"
      tabIndex={initialLoading ? undefined : 0}
      type="native"
    >
      <Table aria-label={c.title} withRowBorders>
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
            : current?.map((item) => (
                <Table.Tr key={item.id} onClick={openRecordFromRow} style={{ cursor: "pointer" }}>
                  <Table.Td>
                    <Anchor
                      component={AdminNavigationLink}
                      c="inherit"
                      data-record-link
                      fw={600}
                      href={roundPageHref(
                        `/csa-rounds/${encodeURIComponent(item.id)}`,
                        page,
                        status,
                      )}
                      style={{ overflowWrap: "anywhere" }}
                      underline="never"
                    >
                      {item.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Status
                      domain="csa-round"
                      status={item.status}
                      label={c.statuses[item.status]}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Text component="time" dateTime={item.opens_at} size="sm">
                        {formatAdminDateTime(item.opens_at)}
                      </Text>
                      <Text component="span" c="dimmed" size="sm">
                        →{" "}
                        <time dateTime={item.closes_at}>{formatAdminDateTime(item.closes_at)}</time>
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Text component="time" dateTime={item.delivery_date} size="sm">
                      {formatAdminDate(item.delivery_date)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack component="section" gap="md" miw={0} aria-busy={loading || undefined}>
      <PageHeading title={c.title} visuallyHiddenTitle />
      <ListToolbar
        busy={loading}
        filterPopover={{
          label: t.users.filter,
          activeCount: Number(Boolean(status)),
          onOpen: () => setDraftStatus(status),
          onDismiss: () => setDraftStatus(status),
          clearLabel: t.common.clearFilters,
          clearDisabled: !draftStatus && !status,
          onClear: () => applyStatus(""),
          apply: {
            label: t.users.applyFilters,
            disabled: draftStatus === status,
            onApply: () => applyStatus(draftStatus),
          },
          children: (
            <Select
              label={c.state}
              placeholder={c.allStatuses}
              value={draftStatus || null}
              onChange={(value) =>
                setDraftStatus(csaRoundStatuses.find((option) => option === value) ?? "")
              }
              data={csaRoundStatuses.map((value) => ({ value, label: c.statuses[value] }))}
              comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
              clearable
            />
          ),
        }}
        primaryAction={
          <Button
            component={AdminNavigationLink}
            href={roundPageHref("/csa-rounds/new", page, status)}
            leftSection={<IconPlus size={16} aria-hidden />}
          >
            {c.create}
          </Button>
        }
        refresh={{ label: c.refresh, onRefresh: reload, loading }}
      />
      <Paper withBorder style={{ overflow: "hidden" }}>
        {Boolean(current?.length) && table}
        <ListState
          embedded
          empty={c.empty}
          noResults={status ? t.membershipCatalog.noMatches : undefined}
          error={error}
          hasData={current !== null}
          isEmpty={current?.length === 0}
          loading={initialLoading}
          loadingLabel={c.loading}
          loadingPlaceholder={table}
          onRetry={reload}
          retryLabel={t.common.retry}
        />
        {currentMeta && (
          <>
            <Divider />
            <Box p="sm">
              <Pagination
                page={currentMeta.page}
                pageSize={currentMeta.page_size}
                total={currentMeta.total}
                onPage={changePage}
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
    </Stack>
  );
}
