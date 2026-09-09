"use client";

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
  return <span className={`badge customer-status-${status}`}>{labels[status]}</span>;
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
            <label className="field">
              <span>{t.csaCustomers.linkedFilter}</span>
              <select
                className="input"
                disabled={loading}
                value={linked}
                onChange={(event) => {
                  setLinked(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">{t.csaCustomers.allLinks}</option>
                <option value="linked">{t.csaCustomers.linked}</option>
                <option value="managed">{t.csaCustomers.managed}</option>
              </select>
            </label>
            <label className="field">
              <span>{t.csaCustomers.statusFilter}</span>
              <select
                className="input"
                disabled={loading}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t.csaCustomers.allStatuses}</option>
                <option value="active">{t.csaCustomers.active}</option>
                <option value="scheduled">{t.csaCustomers.scheduled}</option>
                <option value="ended">{t.memberships.statuses.ended}</option>
                <option value="revoked">{t.memberships.statuses.revoked}</option>
              </select>
            </label>
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
        <div className="table-wrap admin-list-wrap">
          <table className="table admin-list-table customer-list-table">
            <thead>
              <tr>
                <th>{t.csaCustomers.customer}</th>
                <th>{t.csaCustomers.phone}</th>
                <th>{t.csaCustomers.websiteAccount}</th>
                <th>{t.csaCustomers.status}</th>
                <th>{t.csaCustomers.actions}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label={t.csaCustomers.customer}>
                    <strong>{item.name}</strong>
                  </td>
                  <td data-label={t.csaCustomers.phone}>{item.phone || "—"}</td>
                  <td data-label={t.csaCustomers.websiteAccount}>
                    <span className={`badge ${item.user ? "customer-account-linked" : "warm"}`}>
                      {item.user ? t.csaCustomers.linkedAccount : t.csaCustomers.managed}
                    </span>
                  </td>
                  <td data-label={t.csaCustomers.status}>
                    <CustomerStatusBadge status={item.status} />
                  </td>
                  <td
                    className="row-actions customer-list-action"
                    data-label={t.csaCustomers.actions}
                  >
                    <Link className="button secondary" href={`/csa-customers/${item.id}`}>
                      {t.csaCustomers.view}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
