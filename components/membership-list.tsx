"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { MembershipStatusBadge } from "@/components/membership-status-badge";
import { Pagination } from "@/components/pagination";
import { formatAdminDate } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { AdminMembership, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function MembershipList() {
  const { t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      return apiEnvelope<AdminMembership[], PaginationMeta>(
        `admin/memberships?${params.toString()}`,
      );
    },
    [search],
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
    setPage(1);
  }

  return (
    <section aria-busy={loading} className="csa-list-section">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        hasFilters={Boolean(query || search)}
        onClear={clearFilters}
        onQueryChange={setQuery}
        onSubmit={submit}
        placeholder={t.memberships.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.memberships.searchLabel}
        searchSubmitLabel={loading ? t.memberships.searching : t.memberships.search}
      />
      <ListState
        empty={t.memberships.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.memberships.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <div className="table-wrap csa-list-wrap">
          <table className="table csa-list-table csa-membership-list">
            <thead>
              <tr>
                <th>{t.memberships.customer}</th>
                <th>{t.memberships.package}</th>
                <th>{t.memberships.status}</th>
                <th>{t.memberships.period}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label={t.memberships.customer}>
                    <Link className="csa-list-primary-link" href={`/memberships/${item.id}`}>
                      {item.user.name}
                    </Link>
                    <small className="table-secondary">{item.user.email}</small>
                    <small className="table-secondary">{item.user.phone || "—"}</small>
                  </td>
                  <td data-label={t.memberships.package}>{item.package_name}</td>
                  <td data-label={t.memberships.status}>
                    <MembershipStatusBadge status={item.status} />
                  </td>
                  <td data-label={t.memberships.period}>
                    {formatAdminDate(item.start_date)} <span aria-hidden="true">→</span>{" "}
                    {formatAdminDate(item.end_date)}
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
