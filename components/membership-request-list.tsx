"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { MembershipRequestStatusBadge } from "@/components/membership-status-badge";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { MembershipRequest, MembershipRequestStatus, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

const statuses: MembershipRequestStatus[] = [
  "consultation_requested",
  "contacted",
  "payment_pending",
  "payment_submitted",
  "approved",
  "rejected",
];

export function MembershipRequestList() {
  const { locale, t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MembershipRequestStatus | "">("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), locale });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      return apiEnvelope<MembershipRequest[], PaginationMeta>(
        `admin/membership-requests?${params.toString()}`,
      );
    },
    [locale, search, status],
  );
  const getErrorMessage = useCallback((caught: unknown) => requestErrorMessage(caught, t), [t]);
  const { error, items, loading, meta, page, reload, setPage } = usePaginatedList({
    fetchPage,
    getErrorMessage,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const nextSearch = query.trim();
    setPage(1);
    if (nextSearch === search && page === 1) reload();
    else setSearch(nextSearch);
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
    setStatus("");
    setPage(1);
  }

  return (
    <section aria-busy={loading} className="csa-list-section">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <label className="field">
            <span>{t.membershipRequests.filterStatus}</span>
            <select
              className="input"
              disabled={loading}
              onChange={(event) => {
                setStatus(event.target.value as MembershipRequestStatus | "");
                setPage(1);
              }}
              value={status}
            >
              <option value="">{t.membershipRequests.allStatuses}</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {t.membershipRequests.statuses[value]}
                </option>
              ))}
            </select>
          </label>
        }
        hasFilters={Boolean(query || search || status)}
        onClear={clearFilters}
        onQueryChange={setQuery}
        onSubmit={submit}
        placeholder={t.membershipRequests.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.membershipRequests.searchLabel}
        searchSubmitLabel={loading ? t.membershipRequests.searching : t.membershipRequests.search}
      />
      <ListState
        empty={t.membershipRequests.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.membershipRequests.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <div className="table-wrap csa-list-wrap">
          <table className="table csa-list-table csa-request-list">
            <thead>
              <tr>
                <th>{t.membershipRequests.customer}</th>
                <th>{t.membershipRequests.package}</th>
                <th>{t.membershipRequests.createdAt}</th>
                <th>{t.membershipRequests.status}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label={t.membershipRequests.customer}>
                    <Link
                      className="csa-list-primary-link"
                      href={`/membership-requests/${item.id}`}
                    >
                      {item.user.name}
                    </Link>
                    <small className="table-secondary">{item.user.email}</small>
                    <small className="table-secondary">{item.user.phone || "—"}</small>
                  </td>
                  <td data-label={t.membershipRequests.package}>{item.package.name}</td>
                  <td data-label={t.membershipRequests.createdAt}>
                    {formatAdminDateTime(item.created_at)}
                  </td>
                  <td data-label={t.membershipRequests.status}>
                    <MembershipRequestStatusBadge status={item.status} />
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
