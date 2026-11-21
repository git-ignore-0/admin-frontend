"use client";

import { Table } from "@mantine/core";
import { FormSelect, Status as UiStatus, FormField } from "@/components/nfv-controls";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { CSAPurchaseRequest, CSAPurchaseRequestStatus, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function CSAPurchaseStatusBadge({ status }: { status: CSAPurchaseRequestStatus }) {
  const { t } = useAdminI18n();
  return <UiStatus domain="csa-purchase" status={status} label={t.csaPurchases.statuses[status]} />;
}

export function CSAPurchaseRequestList() {
  const router = useRouter();
  const { t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CSAPurchaseRequestStatus | "">("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), page_size: "30" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      return apiEnvelope<CSAPurchaseRequest[], PaginationMeta>(
        `admin/csa-purchase-requests?${params}`,
      );
    },
    [search, status],
  );
  const getErrorMessage = useCallback((error: unknown) => requestErrorMessage(error, t), [t]);
  const { error, items, loading, meta, page, reload, setPage } = usePaginatedList({
    fetchPage,
    getErrorMessage,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const value = query.trim();
    setPage(1);
    if (value === search && page === 1) reload();
    else setSearch(value);
  }

  function clear() {
    setQuery("");
    setSearch("");
    setStatus("");
    setPage(1);
  }

  function openDetail(id: string) {
    router.push(`/csa-purchase-requests/${id}`);
  }

  return (
    <section aria-busy={loading} className="admin-list-section csa-purchase-directory">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <FormField label={t.csaPurchases.filterStatus} className="field">
            <FormSelect
              disabled={loading}
              onChange={(selectedValue) => {
                setStatus((selectedValue ?? "") as CSAPurchaseRequestStatus | "");
                setPage(1);
              }}
              value={status}
              data={[
                { value: "", label: t.csaPurchases.allStatuses },
                ...((Object.keys(t.csaPurchases.statuses) as CSAPurchaseRequestStatus[]).map(
                  (value) => ({ value: value, label: t.csaPurchases.statuses[value] }),
                ) ?? []),
              ]}
            />
          </FormField>
        }
        hasFilters={Boolean(query || search || status)}
        onClear={clear}
        onQueryChange={(value) => {
          setQuery(value);
          if (!value.trim() && search) {
            setSearch("");
            setPage(1);
          }
        }}
        onSubmit={submit}
        placeholder={t.csaPurchases.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.csaPurchases.searchLabel}
        searchSubmitLabel={loading ? t.csaPurchases.searching : t.csaPurchases.search}
      />
      <ListState
        empty={t.csaPurchases.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.csaPurchases.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <Table.ScrollContainer type="native" minWidth={0} className="table-wrap admin-list-wrap">
          <Table role="table" className="admin-list-table csa-purchase-list-table">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{t.csaPurchases.requestCode}</Table.Th>
                <Table.Th role="columnheader">{t.csaPurchases.customer}</Table.Th>
                <Table.Th role="columnheader">{t.csaPurchases.phone}</Table.Th>
                <Table.Th role="columnheader">{t.csaPurchases.package}</Table.Th>
                <Table.Th role="columnheader">{t.csaPurchases.status}</Table.Th>
                <Table.Th role="columnheader">{t.csaPurchases.createdAt}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => (
                <Table.Tr
                  aria-label={`${item.request_code}: ${item.name}`}
                  className="admin-list-clickable-row"
                  key={item.id}
                  onClick={() => openDetail(item.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    openDetail(item.id);
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <Table.Td
                    role="cell"
                    className="csa-purchase-request-cell"
                    data-label={t.csaPurchases.requestCode}
                  >
                    <strong className="csa-purchase-request-code">{item.request_code}</strong>
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.csaPurchases.customer}>
                    {item.name}
                  </Table.Td>
                  <Table.Td
                    role="cell"
                    className="csa-purchase-phone-cell"
                    data-label={t.csaPurchases.phone}
                  >
                    {item.phone}
                  </Table.Td>
                  <Table.Td role="cell" data-label={t.csaPurchases.package}>
                    {item.package_snapshot.name}
                    <small className="table-secondary">{item.price_option_snapshot.name}</small>
                    <small className="table-secondary">
                      {item.payment_plan?.payment_type === "installment"
                        ? t.csaPurchases.installments.installment.replace(
                            "{count}",
                            String(item.payment_plan.installment_count),
                          )
                        : t.csaPurchases.installments.full}
                    </small>
                  </Table.Td>
                  <Table.Td
                    role="cell"
                    className="csa-purchase-status-cell"
                    data-label={t.csaPurchases.status}
                  >
                    <CSAPurchaseStatusBadge status={item.status} />
                  </Table.Td>
                  <Table.Td
                    role="cell"
                    className="csa-purchase-created-cell"
                    data-label={t.csaPurchases.createdAt}
                  >
                    {formatAdminDateTime(item.created_at)}
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
