"use client";

import { Anchor, Box, Divider, Paper, Select, Skeleton, Stack, Table, Text } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { openRecordFromRow } from "@/components/record-row-navigation";
import { requireResponseEntity } from "@/lib/api-response";
import { formatAdminDateTime } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject, requestErrorMessage } from "@/lib/client-error";
import {
  csaPurchaseHref,
  csaPurchaseStatuses,
  readCsaPurchaseListContext,
} from "@/lib/csa-purchase-navigation";
import { formatVietnamPhone } from "@/lib/phone-number";
import type { CSAPurchaseRequest, CSAPurchaseRequestStatus, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

const emptyParams = new URLSearchParams();

export function CSAPurchaseStatusBadge({ status }: { status: CSAPurchaseRequestStatus }) {
  const { t } = useAdminI18n();
  return <Status domain="csa-purchase" status={status} label={t.csaPurchases.statuses[status]} />;
}

function validatePurchaseRequestRecord(item: CSAPurchaseRequest) {
  requireResponseEntity(item);
  if (!isApiObject(item.package_snapshot) || !isApiObject(item.price_option_snapshot)) {
    throw invalidApiResponse();
  }
}

export function CSAPurchaseRequestList() {
  const { t } = useAdminI18n();
  const copy = t.csaPurchases;
  const dictionaryRef = useRef(t);
  dictionaryRef.current = t;
  const params = useSearchParams();
  const context = readCsaPurchaseListContext(params ?? emptyParams);
  const { search, status, page } = context;
  const [draftSearch, setDraftSearch] = useState(search);
  const [draftStatus, setDraftStatus] = useState(status);
  const labels = [copy.requestCode, copy.customer, copy.package, copy.status, copy.createdAt];
  const fetchPage = useCallback(
    async (nextPage: number, signal: AbortSignal) => {
      const query = new URLSearchParams({ page: String(nextPage), page_size: "30" });
      if (search) query.set("search", search);
      if (status) query.set("status", status);
      const result = await apiEnvelope<CSAPurchaseRequest[], PaginationMeta>(
        `admin/csa-purchase-requests?${query}`,
        { signal },
      );
      if (!result.meta) throw invalidApiResponse();
      return { data: result.data, meta: { ...result.meta, search, status } };
    },
    [search, status],
  );
  const getErrorMessage = useCallback(
    (error: unknown) => requestErrorMessage(error, dictionaryRef.current),
    [],
  );
  const {
    error,
    items: records,
    loading,
    meta: pageMeta,
    reload,
  } = usePaginatedList({
    controlledPage: page,
    fetchPage,
    validateRecord: validatePurchaseRequestRecord,
    getErrorMessage,
  });
  const meta =
    !error && pageMeta?.page === page && pageMeta.search === search && pageMeta.status === status
      ? pageMeta
      : null;
  const items = meta ? records : null;
  const initialLoading = items === null && !error;

  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    if (!meta || loading) return;
    const lastPage = Math.max(1, Math.ceil(meta.total / meta.page_size));
    if (page > lastPage) {
      window.history.replaceState(null, "", csaPurchaseHref({ search, status, page: lastPage }));
    }
  }, [loading, meta, page, search, status]);

  function navigateList(next: typeof context) {
    const href = csaPurchaseHref(next);
    if (href !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", href);
    }
  }

  function updateStatus(value: typeof status) {
    setDraftStatus(value);
    navigateList({ search, status: value, page: 1 });
  }

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={740}
      aria-label={copy.title}
      aria-hidden={initialLoading || undefined}
      role="region"
      tabIndex={initialLoading ? undefined : 0}
      style={{ outlineOffset: -2 }}
    >
      <Table aria-label={copy.title} aria-busy={loading || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            {labels.map((label) => (
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
                  {labels.map((label) => (
                    <Table.Td key={label}>
                      <Skeleton height={16} width="72%" />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            : items?.map((item) => (
                <Table.Tr key={item.id} onClick={openRecordFromRow} style={{ cursor: "pointer" }}>
                  <Table.Td>
                    <Anchor
                      component={AdminNavigationLink}
                      href={csaPurchaseHref(context, item.id)}
                      data-record-link
                      aria-label={`${item.request_code}: ${item.name}`}
                      c="inherit"
                      fw={600}
                      underline="never"
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {item.request_code}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                      <Text fw={600} size="sm">
                        {item.name}
                      </Text>
                      <Text c="dimmed" size="sm">
                        {formatVietnamPhone(item.phone) || "—"}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                      <Text size="sm">{item.package_snapshot.name}</Text>
                      <Text c="dimmed" size="sm">
                        {item.price_option_snapshot.name}
                      </Text>
                      <Text c="dimmed" size="sm">
                        {item.payment_plan?.payment_type === "installment"
                          ? copy.installments.installment.replace(
                              "{count}",
                              String(item.payment_plan.installment_count),
                            )
                          : copy.installments.full}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <CSAPurchaseStatusBadge status={item.status} />
                  </Table.Td>
                  <Table.Td>
                    <Text component="time" size="sm" dateTime={item.created_at}>
                      {formatAdminDateTime(item.created_at)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack gap="md" miw={0}>
      <PageHeading title={copy.title} visuallyHiddenTitle bottomSpacing={0} />
      <ListToolbar
        busy={loading}
        search={{
          label: copy.searchLabel,
          placeholder: copy.searchPlaceholder,
          value: draftSearch,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setDraftSearch,
          onSubmit: (value) => {
            const applied = value.trim();
            if (applied === search && page === 1) reload();
            else navigateList({ search: applied, status, page: 1 });
          },
          submitLabel: copy.search,
          clearLabel: t.common.clearFilters,
          onClear: () => {
            setDraftSearch("");
            navigateList({ search: "", status, page: 1 });
          },
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: Number(Boolean(status)),
          onOpen: () => setDraftStatus(status),
          onDismiss: () => setDraftStatus(status),
          clearLabel: t.common.clearFilters,
          clearDisabled: !draftStatus && !status,
          onClear: () => updateStatus(""),
          apply: {
            label: t.users.applyFilters,
            disabled: draftStatus === status,
            onApply: () => updateStatus(draftStatus),
          },
          children: (
            <Select
              label={copy.filterStatus}
              placeholder={copy.allStatuses}
              value={draftStatus || null}
              onChange={(value) =>
                setDraftStatus(csaPurchaseStatuses.find((option) => option === value) ?? "")
              }
              data={csaPurchaseStatuses.map((value) => ({ value, label: copy.statuses[value] }))}
              comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
              clearable
            />
          ),
        }}
        refresh={{ label: copy.refresh, onRefresh: reload }}
      />
      <Paper component="section" miw={0} style={{ overflow: "hidden" }}>
        {Boolean(items?.length) && table}
        <Box p={error ? "md" : undefined}>
          <ListState
            embedded
            empty={copy.empty}
            error={error}
            hasData={items !== null}
            isEmpty={items?.length === 0}
            loading={initialLoading}
            loadingLabel={copy.loading}
            loadingPlaceholder={table}
            onRetry={reload}
            retryLabel={t.common.retry}
          />
        </Box>
        {meta && (
          <>
            <Divider />
            <Box px="md" py="sm">
              <Pagination
                disabled={loading}
                nextLabel={t.common.next}
                onPage={(next) => navigateList({ ...context, page: next })}
                page={meta.page}
                pageSize={meta.page_size}
                previousLabel={t.common.previous}
                resultCountLabel={t.common.resultCount}
                resultCountSingularLabel={t.common.resultCountSingular}
                summary={t.common.pagination}
                total={meta.total}
              />
            </Box>
          </>
        )}
      </Paper>
    </Stack>
  );
}
