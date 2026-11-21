"use client";
import { Table } from "@mantine/core";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Button, DataState, FormField, FormSelect, Tabs } from "@/components/nfv-controls";
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
import { storeOrdersCopy, storeOrderStatusLabel } from "@/lib/store-orders-copy";
import type { StoreOrderSort, StorePaymentStatus } from "@/lib/types";
import { useStoreOrderList } from "@/lib/use-store-order-list";

export function StoreOrderList() {
  const router = useRouter();
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const next = query.trim();
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

  return (
    <section aria-busy={loading} className="admin-list-section store-order-directory">
      <div className="store-order-status-filters">
        <Tabs
          label={c.orderStatus}
          items={[
            { value: "", label: c.all },
            ...storeOrderDisplayStatuses.map((value) => ({
              value,
              label: storeOrderStatusLabel(value, locale),
            })),
          ]}
          value={status}
          onChange={(value) => {
            setStatus(value as StoreOrderDisplayStatus | "");
            setPage(1);
          }}
        />
      </div>
      <ListToolbar
        controls="nfv"
        actions={
          <Button type="button" variant="outline" disabled={loading} onClick={reload}>
            {c.refreshList}
          </Button>
        }
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <div className="list-toolbar-filters store-order-filters">
            <FormField label={c.paymentStatus}>
              <FormSelect
                aria-label={c.paymentStatus}
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
            </FormField>
            <FormField label={c.sort}>
              <FormSelect
                aria-label={c.sort}
                disabled={loading}
                value={sort}
                onChange={(value) => {
                  setSort(value as StoreOrderSort);
                  setPage(1);
                }}
                data={Object.entries(c.sorts).map(([value, label]) => ({ value, label }))}
              />
            </FormField>
          </div>
        }
        hasFilters={Boolean(search || status || paymentStatus || sort !== "created_desc")}
        onClear={clear}
        onQueryChange={(value) => {
          setQuery(value);
          if (!value.trim() && search) {
            setSearch("");
            setPage(1);
          }
        }}
        onSubmit={submit}
        placeholder={c.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={c.search}
        searchSubmitLabel={loading ? c.searching : c.searchButton}
      />
      {error ? (
        <DataState kind="error" title={error} action={{ label: t.common.retry, onClick: reload }} />
      ) : loading ? (
        <DataState kind="loading" title={c.loading} />
      ) : items?.length === 0 ? (
        <DataState kind="empty" title={c.empty} />
      ) : null}
      {items?.length ? (
        <div className="table-wrap admin-list-wrap">
          <Table className="admin-list-table store-order-list-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th scope="col">{c.reference}</Table.Th>
                <Table.Th scope="col">{c.recipient}</Table.Th>
                <Table.Th scope="col">{c.total}</Table.Th>
                <Table.Th scope="col">{c.orderStatus}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr
                  className="admin-list-clickable-row"
                  key={item.id}
                  onClick={() => router.push(`/store-orders/${item.id}`)}
                >
                  <Table.Td data-label={c.reference}>
                    <Link
                      aria-label={`${item.reference_code}: ${item.shipping_address.recipient_name}`}
                      className="store-order-reference"
                      href={`/store-orders/${item.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <strong>{item.reference_code}</strong>
                    </Link>
                    <small className="table-secondary store-order-created">
                      {c.createdAt}:{" "}
                      <time dateTime={item.created_at}>{formatAdminDateTime(item.created_at)}</time>
                    </small>
                    <small className="table-secondary">
                      {c.deliveryDate}: {formatStoreDeliveryDate(item)}
                    </small>
                  </Table.Td>
                  <Table.Td data-label={c.recipient}>
                    {item.shipping_address.recipient_name}
                    <small className="table-secondary store-order-contact">
                      {item.shipping_address.phone_number}
                    </small>
                  </Table.Td>
                  <Table.Td data-label={c.total}>
                    {formatStoreMoney(item.total_vnd, locale)}
                  </Table.Td>
                  <Table.Td data-label={c.orderStatus}>
                    <StoreOrderStatusBadge order={item} />
                    {storeOrderHasDeadline(item) ? (
                      <small className="table-secondary store-order-deadline-meta">
                        {c.deadline}:{" "}
                        <time dateTime={item.expires_at ?? undefined}>
                          {formatAdminDateTime(item.expires_at)}
                        </time>
                      </small>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      ) : null}
      {meta ? (
        <Pagination
          controls="nfv"
          disabled={loading}
          nextLabel={t.common.next}
          onPage={setPage}
          page={meta.page}
          pageSize={meta.page_size}
          previousLabel={t.common.previous}
          summary={t.common.pagination}
          total={meta.total}
        />
      ) : null}
    </section>
  );
}
