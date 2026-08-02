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
import type { PaginationMeta, RedemptionListItem, RedemptionStatus } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function RedemptionList() {
  const { locale, t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RedemptionStatus | "">("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), search, status });
      return apiEnvelope<RedemptionListItem[], PaginationMeta>(`admin/redemptions?${params}`);
    },
    [search, status],
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
    setStatus("");
    setPage(1);
  }

  const statusLabels: Record<RedemptionStatus, string> = t.redemptions.statuses;

  return (
    <section aria-busy={loading} className="admin-list-section">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <label className="field">
            <span>{t.redemptions.filterStatus}</span>
            <select
              className="input"
              disabled={loading}
              onChange={(event) => {
                setStatus(event.target.value as RedemptionStatus | "");
                setPage(1);
              }}
              value={status}
            >
              <option value="">{t.redemptions.allStatuses}</option>
              {(Object.keys(statusLabels) as RedemptionStatus[]).map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
        }
        hasFilters={Boolean(query || search || status)}
        onClear={clearFilters}
        onQueryChange={changeQuery}
        onSubmit={submit}
        placeholder={t.users.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.redemptions.searchLabel}
        searchSubmitLabel={loading ? t.users.searching : t.users.search}
      />

      <ListState
        empty={t.redemptions.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.redemptions.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <div className="table-wrap admin-list-wrap">
          <table className="table admin-list-table redemption-list-table">
            <thead>
              <tr>
                <th>{t.redemptions.member}</th>
                <th>{t.redemptions.reward}</th>
                <th>{t.redemptions.points}</th>
                <th>{t.redemptions.requestedAt}</th>
                <th>{t.redemptions.status}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label={t.redemptions.member}>
                    <Link
                      aria-label={`${t.redemptions.view}: ${item.user.name}`}
                      className="admin-list-primary-link"
                      href={`/redemptions/${item.id}`}
                    >
                      {item.user.name}
                    </Link>
                    <small className="table-secondary">{item.user.email}</small>
                    <small className="table-secondary">{item.user.phone || "—"}</small>
                  </td>
                  <td data-label={t.redemptions.reward}>
                    {locale === "en" ? item.reward_name_en_snapshot : item.reward_name_vi_snapshot}
                  </td>
                  <td data-label={t.redemptions.points}>{item.point_cost_snapshot}</td>
                  <td data-label={t.redemptions.requestedAt}>
                    {formatAdminDateTime(item.created_at)}
                  </td>
                  <td data-label={t.redemptions.status}>
                    <span className={`badge redemption-status ${item.status}`}>
                      {statusLabels[item.status]}
                    </span>
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
