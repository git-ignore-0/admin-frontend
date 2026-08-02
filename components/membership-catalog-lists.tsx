"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListResultSummary, ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import type { MembershipPackage, MembershipProduct, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

type ActiveFilter = "" | "true" | "false";

function Status({ active }: { active: boolean }) {
  const { t } = useAdminI18n();
  return (
    <span className={`badge ${active ? "" : "warm"}`}>
      {active ? t.membershipCatalog.active : t.membershipCatalog.inactive}
    </span>
  );
}

export function MembershipProductList() {
  const { t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ActiveFilter>("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      if (active) params.set("active", active);
      return apiEnvelope<MembershipProduct[], PaginationMeta>(
        `admin/membership-products?${params.toString()}`,
      );
    },
    [active, search],
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
    setActive("");
    setPage(1);
  }

  return (
    <section aria-busy={loading} className="csa-list-section">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <label className="field">
            <span>{t.membershipCatalog.filterStatus}</span>
            <select
              className="input"
              disabled={loading}
              onChange={(event) => {
                setActive(event.target.value as ActiveFilter);
                setPage(1);
              }}
              value={active}
            >
              <option value="">{t.membershipCatalog.allStatuses}</option>
              <option value="true">{t.membershipCatalog.active}</option>
              <option value="false">{t.membershipCatalog.inactive}</option>
            </select>
          </label>
        }
        hasFilters={Boolean(query || search || active)}
        onClear={clearFilters}
        onQueryChange={setQuery}
        onSubmit={submit}
        placeholder={t.membershipCatalog.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.membershipCatalog.searchLabel}
        searchSubmitLabel={loading ? t.membershipCatalog.searching : t.membershipCatalog.search}
      />
      <ListState
        empty={t.membershipCatalog.emptyProducts}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.membershipCatalog.loadingProductList}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <div className="table-wrap csa-list-wrap">
          <table className="table csa-list-table csa-product-list">
            <thead>
              <tr>
                <th>{t.membershipCatalog.product}</th>
                <th>{t.membershipCatalog.unitConversion}</th>
                <th>{t.membershipCatalog.status}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label={t.membershipCatalog.product}>
                    <Link
                      className="csa-list-primary-link"
                      href={`/membership-catalog/products/${item.id}`}
                    >
                      {item.name}
                    </Link>
                    <small className="table-secondary">{item.short_description || "—"}</small>
                  </td>
                  <td data-label={t.membershipCatalog.unitConversion}>
                    {item.unit_size} {item.unit_label_vi} / {item.unit_label_en}
                  </td>
                  <td data-label={t.membershipCatalog.status}>
                    <Status active={item.is_active} />
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

export function MembershipPackageList() {
  const { locale, t } = useAdminI18n();
  const fetchPage = useCallback(
    (page: number) =>
      apiEnvelope<MembershipPackage[], PaginationMeta>(`admin/membership-packages?page=${page}`),
    [],
  );
  const getErrorMessage = useCallback((caught: unknown) => requestErrorMessage(caught, t), [t]);
  const { error, items, loading, meta, reload, setPage } = usePaginatedList({
    fetchPage,
    getErrorMessage,
  });

  return (
    <section aria-busy={loading} className="csa-list-section">
      {meta && (
        <div className="list-toolbar-row list-toolbar-summary-only">
          <ListResultSummary
            count={meta.total}
            label={t.common.resultCount}
            singularLabel={t.common.resultCountSingular}
          />
        </div>
      )}
      <ListState
        empty={t.membershipCatalog.emptyPackages}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.membershipCatalog.loadingPackageList}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <div className="table-wrap csa-list-wrap">
          <table className="table csa-list-table csa-package-list">
            <thead>
              <tr>
                <th>{t.membershipCatalog.package}</th>
                <th>{t.membershipCatalog.upfrontPrice}</th>
                <th>{t.membershipCatalog.duration}</th>
                <th>{t.membershipCatalog.status}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label={t.membershipCatalog.package}>
                    <Link
                      className="csa-list-primary-link"
                      href={`/membership-catalog/packages/${item.id}`}
                    >
                      {item.name}
                    </Link>
                    <small className="table-secondary">
                      {item.items
                        .map((line) => `${line.product_name}: ${line.quota_units}`)
                        .join(" · ") || "—"}
                    </small>
                  </td>
                  <td data-label={t.membershipCatalog.upfrontPrice}>
                    {formatMembershipMoney(item.upfront_price, locale)}
                  </td>
                  <td data-label={t.membershipCatalog.duration}>
                    {t.membershipCatalog.monthCount.replace(
                      "{count}",
                      String(item.duration_months),
                    )}
                  </td>
                  <td data-label={t.membershipCatalog.status}>
                    <Status active={item.is_active} />
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
