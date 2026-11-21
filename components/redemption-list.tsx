"use client";

import { FormSelect, Status, FormField } from "@/components/nfv-controls";

import { Table } from "@mantine/core";

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
          <FormField className="field" label={t.redemptions.filterStatus}>
            <FormSelect
              disabled={loading}
              value={status}
              onChange={(value) => {
                setStatus((value ?? "") as RedemptionStatus | "");
                setPage(1);
              }}
              data={[
                { value: "", label: t.redemptions.allStatuses },
                ...(Object.keys(statusLabels) as RedemptionStatus[]).map((value) => ({
                  value,
                  label: statusLabels[value],
                })),
              ]}
            />
          </FormField>
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
        <Table.ScrollContainer type="native" minWidth={0} className="table-wrap admin-list-wrap">
          <Table role="table" className="admin-list-table redemption-list-table">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{t.redemptions.member}</Table.Th>
                <Table.Th role="columnheader">{t.redemptions.reward}</Table.Th>
                <Table.Th role="columnheader">{t.redemptions.points}</Table.Th>
                <Table.Th role="columnheader">{t.redemptions.requestedAt}</Table.Th>
                <Table.Th role="columnheader">{t.redemptions.status}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => (
                <Table.Tr role="row" key={item.id}>
                  <Table.Td role="cell" data-label={t.redemptions.member}>
                    <Link
                      aria-label={`${t.redemptions.view}: ${item.user.name}`}
                      className="admin-list-primary-link"
                      href={`/redemptions/${item.id}`}
                    >
                      {item.user.name}
                    </Link>
                    <small className="table-secondary">{item.user.email}</small>
                    <small className="table-secondary">{item.user.phone || "—"}</small>
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.redemptions.reward}>
                    {locale === "en" ? item.reward_name_en_snapshot : item.reward_name_vi_snapshot}
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.redemptions.points}>
                    {item.point_cost_snapshot}
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.redemptions.requestedAt}>
                    {formatAdminDateTime(item.created_at)}
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.redemptions.status}>
                    <Status
                      domain="redemption"
                      status={item.status}
                      label={statusLabels[item.status]}
                    />
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
