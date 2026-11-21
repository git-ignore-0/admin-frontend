"use client";

import { Button, Table } from "@mantine/core";
import { FormSelect, Status as UiStatus, FormField } from "@/components/nfv-controls";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { CSACustomer, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function CustomerStatusBadge({ status }: { status: CSACustomer["status"] }) {
  const { t } = useAdminI18n();
  const labels = {
    active: t.csaCustomers.active,
    scheduled: t.csaCustomers.scheduled,
    history_only: t.csaCustomers.historyOnly,
    new: t.csaCustomers.newStatus,
  };
  return <UiStatus domain="csa-customer" status={status} label={labels[status]} />;
}

export function CSACustomerList() {
  const { t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [linked, setLinked] = useState("all");
  const [status, setStatus] = useState("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), page_size: "30", linked });
      if (search) params.set("search", search);
      if (status) params.set("membership_status", status);
      return apiEnvelope<CSACustomer[], PaginationMeta>(`admin/csa-customers?${params}`);
    },
    [linked, search, status],
  );
  const getErrorMessage = useCallback((error: unknown) => requestErrorMessage(error, t), [t]);
  const { error, items, loading, meta, page, reload, setPage } = usePaginatedList({
    fetchPage,
    getErrorMessage,
  });
  const hasFilters = Boolean(query || search || linked !== "all" || status);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const value = query.trim();
    setPage(1);
    if (value === search && page === 1) reload();
    else setSearch(value);
  }

  function changeQuery(value: string) {
    setQuery(value);
    if (!value.trim() && search) {
      setPage(1);
      setSearch("");
    }
  }

  function clear() {
    setQuery("");
    setSearch("");
    setLinked("all");
    setStatus("");
    setPage(1);
  }

  return (
    <section aria-busy={loading} className="admin-list-section customer-directory">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <div className="list-toolbar-filters">
            <FormField label={t.csaCustomers.linkedFilter} className="field">
              <FormSelect
                disabled={loading}
                value={linked}
                onChange={(selectedValue) => {
                  setLinked(selectedValue ?? "");
                  setPage(1);
                }}
                data={[
                  { value: "all", label: t.csaCustomers.allLinks },
                  { value: "linked", label: t.csaCustomers.linked },
                  { value: "managed", label: t.csaCustomers.managed },
                ]}
              />
            </FormField>
            <FormField label={t.csaCustomers.statusFilter} className="field">
              <FormSelect
                disabled={loading}
                value={status}
                onChange={(selectedValue) => {
                  setStatus(selectedValue ?? "");
                  setPage(1);
                }}
                data={[
                  { value: "", label: t.csaCustomers.allStatuses },
                  { value: "active", label: t.csaCustomers.active },
                  { value: "scheduled", label: t.csaCustomers.scheduled },
                  { value: "ended", label: t.memberships.statuses.ended },
                  { value: "revoked", label: t.memberships.statuses.revoked },
                ]}
              />
            </FormField>
          </div>
        }
        hasFilters={hasFilters}
        onClear={clear}
        onQueryChange={changeQuery}
        onSubmit={submit}
        placeholder={t.csaCustomers.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.csaCustomers.searchLabel}
        searchSubmitLabel={loading ? t.csaCustomers.searching : t.csaCustomers.search}
      />
      <ListState
        empty={t.csaCustomers.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.csaCustomers.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <Table.ScrollContainer type="native" minWidth={0} className="table-wrap admin-list-wrap">
          <Table role="table" className="admin-list-table customer-list-table">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{t.csaCustomers.customer}</Table.Th>
                <Table.Th role="columnheader">{t.csaCustomers.phone}</Table.Th>
                <Table.Th role="columnheader">{t.csaCustomers.websiteAccount}</Table.Th>
                <Table.Th role="columnheader">{t.csaCustomers.status}</Table.Th>
                <Table.Th role="columnheader">{t.csaCustomers.actions}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => (
                <Table.Tr role="row" key={item.id}>
                  <Table.Td role="cell" data-label={t.csaCustomers.customer}>
                    <strong>{item.name}</strong>
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.csaCustomers.phone}>
                    {item.phone || "—"}
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.csaCustomers.websiteAccount}>
                    <UiStatus
                      domain="account-link"
                      status={item.user ? "linked" : "managed"}
                      label={item.user ? t.csaCustomers.linkedAccount : t.csaCustomers.managed}
                    />
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.csaCustomers.status}>
                    <CustomerStatusBadge status={item.status} />
                  </Table.Td>
                  <Table.Td
                    role="cell"
                    className="row-actions customer-list-action"
                    data-label={t.csaCustomers.actions}
                  >
                    <Button component={Link} variant="default" href={`/csa-customers/${item.id}`}>
                      {t.csaCustomers.view}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {meta && (
        <Pagination
          disabled={loading}
          nextLabel={t.common.next}
          onPage={setPage}
          page={meta.page}
          pageSize={meta.page_size}
          previousLabel={t.common.previous}
          summary={t.common.pagination}
          total={meta.total}
        />
      )}
    </section>
  );
}
