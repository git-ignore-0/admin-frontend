"use client";
import { Box, Button, Divider, SegmentedControl, Stack, Table, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { FormSelect } from "@/components/nfv-controls";
import { DataListPaper } from "@/components/data-list-paper";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { ListState } from "@/components/list-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StoreOrderStatusBadge } from "@/components/store-order-status";
import { formatAdminDateTime } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
import {
  formatStoreMoney,
  storeOrderHasDeadline,
  formatStoreDeliveryDate,
  storeOrderDisplayStatuses,
  type StoreOrderDisplayStatus,
} from "@/lib/store-orders";
import { formatVietnamPhone } from "@/lib/phone-number";
import { storeOrdersCopy, storeOrderStatusLabel } from "@/lib/store-orders-copy";
import type { StoreOrderSort, StorePaymentStatus } from "@/lib/types";
import { useStoreOrderList } from "@/lib/use-store-order-list";

export function StoreOrderList() {
  const router = useRouter();
  const { ref: contentRef, width: contentWidth } = useElementSize();
  const { locale, t } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StoreOrderDisplayStatus | "">("");
  const [paymentStatus, setPaymentStatus] = useState<StorePaymentStatus | "">("");
  const [sort, setSort] = useState<StoreOrderSort>("created_desc");
  const errorMessage = useCallback((error: unknown) => requestErrorMessage(error, t), [t]);
  const { error, items, loading, meta, page, reload, setPage } = useStoreOrderList({
    search,
    sort,
    status,
    paymentStatus,
    getErrorMessage: errorMessage,
  });

  function submit(value: string) {
    if (loading) return;
    const next = value.trim();
    setPage(1);
    if (next === search && page === 1) reload();
    else setSearch(next);
  }

  function clear() {
    setQuery("");
    setSearch("");
    setStatus("");
    setPaymentStatus("");
    setSort("created_desc");
    setPage(1);
  }

  const filtersApplied = Boolean(search || status || paymentStatus || sort !== "created_desc");
  const initialLoading = loading && items === null;
  const compactStatusFilter = contentWidth < 880;
  const statusOptions = [
    { value: "", label: c.all },
    ...storeOrderDisplayStatuses.map((value) => ({
      value,
      label: storeOrderStatusLabel(value, locale),
    })),
  ];

  function changeStatus(value: string | null) {
    setStatus((value ?? "") as StoreOrderDisplayStatus | "");
    setPage(1);
  }

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={720}
      role="region"
      aria-label={c.title}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
    >
      <Table aria-label={c.title} aria-busy={loading || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{c.reference}</Table.Th>
            <Table.Th scope="col">{c.recipient}</Table.Th>
            <Table.Th scope="col" ta="right">
              {c.total}
            </Table.Th>
            <Table.Th scope="col">{c.orderStatus}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading ? (
            <TableSkeletonRows
              columns={4}
              height={36}
              alignments={[undefined, undefined, "right"]}
            />
          ) : (
            items?.map((item) => (
              <Table.Tr
                style={{ cursor: "pointer" }}
                key={item.id}
                onClick={() => router.push(`/store-orders/${item.id}`)}
              >
                <Table.Td>
                  <Stack gap={4}>
                    <DataListRecordLink
                      component={Link}
                      aria-label={`${item.reference_code}: ${item.shipping_address.recipient_name}`}
                      href={`/store-orders/${item.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {item.reference_code}
                    </DataListRecordLink>
                    <Text size="sm" c="dimmed">
                      {c.createdAt}:{" "}
                      <time dateTime={item.created_at}>{formatAdminDateTime(item.created_at)}</time>
                    </Text>
                    <Text size="sm" c="dimmed">
                      {c.deliveryDate}: {formatStoreDeliveryDate(item)}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Stack gap={4}>
                    <Text fw={600}>{item.shipping_address.recipient_name}</Text>
                    <Text size="sm" c="dimmed">
                      {formatVietnamPhone(item.shipping_address.phone_number) || "—"}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td ta="right" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatStoreMoney(item.total_vnd, locale)}
                </Table.Td>
                <Table.Td>
                  <Stack gap={4} align="flex-start">
                    <StoreOrderStatusBadge order={item} />
                    {storeOrderHasDeadline(item) ? (
                      <Text size="sm" c="dimmed">
                        {c.deadline}:{" "}
                        <time dateTime={item.expires_at ?? undefined}>
                          {formatAdminDateTime(item.expires_at)}
                        </time>
                      </Text>
                    ) : null}
                  </Stack>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack ref={contentRef} component="section" aria-busy={loading} gap="md" miw={0}>
      {!compactStatusFilter && (
        <SegmentedControl
          aria-label={c.orderStatus}
          data={statusOptions}
          value={status}
          onChange={changeStatus}
          w="fit-content"
          maw="100%"
        />
      )}
      <ListToolbar
        busy={loading}
        search={{
          label: c.search,
          placeholder: c.searchPlaceholder,
          value: query,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: (value) => {
            setQuery(value);
            if (!value.trim() && search) {
              setSearch("");
              setPage(1);
            }
          },
          onSubmit: submit,
          submitLabel: loading ? c.searching : c.searchButton,
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount:
            Number(compactStatusFilter && Boolean(status)) +
            Number(Boolean(paymentStatus)) +
            Number(sort !== "created_desc"),
          clearLabel: t.common.clearFilters,
          clearDisabled: !filtersApplied && !query,
          onClear: clear,
          children: (
            <>
              {compactStatusFilter && (
                <FormSelect
                  comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
                  label={c.orderStatus}
                  disabled={loading}
                  value={status}
                  onChange={changeStatus}
                  data={statusOptions}
                />
              )}
              <FormSelect
                comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
                label={c.paymentStatus}
                disabled={loading}
                value={paymentStatus}
                onChange={(value) => {
                  setPaymentStatus((value ?? "") as StorePaymentStatus | "");
                  setPage(1);
                }}
                data={[
                  { value: "", label: c.all },
                  ...Object.entries(c.paymentStatuses).map(([value, label]) => ({ value, label })),
                ]}
              />
              <FormSelect
                comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
                label={c.sort}
                disabled={loading}
                value={sort}
                onChange={(value) => {
                  setSort(value as StoreOrderSort);
                  setPage(1);
                }}
                data={Object.entries(c.sorts).map(([value, label]) => ({ value, label }))}
              />
            </>
          ),
        }}
        refresh={{
          label: c.refreshList,
          onRefresh: reload,
          loading: loading && items !== null,
          disabled: initialLoading,
        }}
      />
      <DataListPaper>
        {items?.length ? table : null}
        <Box p={error && !loading ? "md" : undefined}>
          <ListState
            embedded
            loadingPlaceholder={table}
            empty={c.empty}
            noResults={filtersApplied ? c.empty : undefined}
            action={
              filtersApplied && items?.length === 0 ? (
                <Button variant="default" onClick={clear}>
                  {t.common.clearFilters}
                </Button>
              ) : undefined
            }
            error={loading ? "" : error}
            hasData={items !== null}
            isEmpty={items?.length === 0}
            loading={initialLoading}
            loadingLabel={c.loading}
            onRetry={reload}
            retryLabel={t.common.retry}
          />
        </Box>
        {meta && (
          <>
            <Divider />
            <Box component="footer" px="md" py="sm">
              <Pagination
                disabled={loading}
                nextLabel={t.common.next}
                onPage={setPage}
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
      </DataListPaper>
    </Stack>
  );
}
