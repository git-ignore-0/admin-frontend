"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { AdminUserListItem, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function UserDirectory({
  detailBasePath = "/users",
  actionLabel,
}: {
  detailBasePath?: "/users" | "/points";
  actionLabel?: string;
}) {
  const { t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), search });
      return apiEnvelope<AdminUserListItem[], PaginationMeta>(`admin/users?${params}`);
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

  function changeQuery(value: string) {
    setQuery(value);
    if (!value.trim() && search) {
      setPage(1);
      setSearch("");
    }
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
    setPage(1);
  }

  const detailLabel = actionLabel ?? t.users.view;

  return (
    <section aria-busy={loading} className="admin-list-section">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        hasFilters={Boolean(query || search)}
        onClear={clearFilters}
        onQueryChange={changeQuery}
        onSubmit={submit}
        placeholder={t.users.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.users.searchLabel}
        searchSubmitLabel={loading ? t.users.searching : t.users.search}
      />
      <ListState
        empty={t.users.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.users.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <div className="table-wrap admin-list-wrap">
          <table className="table admin-list-table user-directory-table">
            <thead>
              <tr>
                <th>{t.users.name}</th>
                <th>{t.users.phone}</th>
                <th>{t.users.created}</th>
                <th>{t.users.status}</th>
                <th>{t.users.balance}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td data-label={t.users.name}>
                    <Link
                      aria-label={`${detailLabel}: ${user.name}`}
                      className="admin-list-primary-link"
                      href={`${detailBasePath}/${user.id}`}
                    >
                      {user.name}
                    </Link>
                    <small className="table-secondary">{user.email}</small>
                  </td>
                  <td data-label={t.users.phone}>{user.phone || "—"}</td>
                  <td data-label={t.users.created}>{formatAdminDateTime(user.date_joined)}</td>
                  <td data-label={t.users.status}>
                    <span className="badge">
                      {t.users.statuses[user.status as keyof typeof t.users.statuses] ??
                        user.status}
                    </span>
                  </td>
                  <td data-label={t.users.balance}>{user.points_balance}</td>
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
