"use client";

import { Table, Badge } from "@mantine/core";
import { FormSelect, Status as UiStatus, FormField } from "@/components/nfv-controls";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import { legacyPackageItemView } from "@/lib/membership-catalog-adapter";
import { formatDecimalInput } from "@/lib/numeric-input";
import {
  hasCompleteCatalogTranslations,
  localizedCatalogTranslation,
} from "@/lib/membership-translations";
import type { MembershipPackage, MembershipProduct, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

type ActiveFilter = "" | "true" | "false";

function Status({ active }: { active: boolean }) {
  const { t } = useAdminI18n();
  return (
    <UiStatus
      domain="availability"
      status={active ? "active" : "inactive"}
      label={active ? t.membershipCatalog.active : t.membershipCatalog.inactive}
    />
  );
}

export function MembershipProductList() {
  const { locale, t } = useAdminI18n();
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
          <FormField label={t.membershipCatalog.filterStatus} className="field">
            <FormSelect
              disabled={loading}
              onChange={(selectedValue) => {
                setActive((selectedValue ?? "") as ActiveFilter);
                setPage(1);
              }}
              value={active}
              data={[
                { value: "", label: t.membershipCatalog.allStatuses },
                { value: "true", label: t.membershipCatalog.active },
                { value: "false", label: t.membershipCatalog.inactive },
              ]}
            />
          </FormField>
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
        <Table.ScrollContainer type="native" minWidth={0} className="table-wrap csa-list-wrap">
          <Table role="table" className="csa-list-table csa-product-list">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{t.membershipCatalog.product}</Table.Th>
                <Table.Th role="columnheader">{t.membershipCatalog.unitConversion}</Table.Th>
                <Table.Th role="columnheader">{t.membershipCatalog.status}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => {
                const translation = localizedCatalogTranslation(item.translations, locale);
                return (
                  <Table.Tr role="row" key={item.id}>
                    <Table.Td role="cell" data-label={t.membershipCatalog.product}>
                      <Link
                        className="csa-list-primary-link"
                        href={`/membership-catalog/products/${item.id}`}
                      >
                        {translation?.name || item.name}
                      </Link>
                      {!hasCompleteCatalogTranslations(item.translations) && (
                        <Badge color="orange" className="catalog-translation-warning">
                          {t.membershipCatalog.translationNeedsReview}
                        </Badge>
                      )}
                      <small className="table-secondary">
                        {translation?.short_description || item.short_description || "—"}
                      </small>
                    </Table.Td>
                    <Table.Td role="cell" data-label={t.membershipCatalog.unitConversion}>
                      {formatDecimalInput(item.unit_size)} {item.unit_label_vi} /{" "}
                      {item.unit_label_en}
                    </Table.Td>
                    <Table.Td role="cell" data-label={t.membershipCatalog.status}>
                      <Status active={item.is_active} />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
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

export function MembershipPackageList() {
  const { locale, t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const fetchPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      return apiEnvelope<MembershipPackage[], PaginationMeta>(
        `admin/membership-packages?${params.toString()}`,
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

  return (
    <section aria-busy={loading} className="csa-list-section">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        hasFilters={Boolean(query || search)}
        onClear={() => {
          setQuery("");
          setSearch("");
          setPage(1);
        }}
        onQueryChange={setQuery}
        onSubmit={submit}
        placeholder={t.membershipCatalog.packageSearchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.membershipCatalog.packageSearchLabel}
        searchSubmitLabel={loading ? t.membershipCatalog.searching : t.membershipCatalog.search}
      />
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
        <Table.ScrollContainer type="native" minWidth={0} className="table-wrap csa-list-wrap">
          <Table role="table" className="csa-list-table csa-package-list">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{t.membershipCatalog.package}</Table.Th>
                <Table.Th role="columnheader">{t.membershipCatalog.priceOptions}</Table.Th>
                <Table.Th role="columnheader">{t.membershipCatalog.status}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => {
                const translation = localizedCatalogTranslation(item.translations, locale);
                return (
                  <Table.Tr role="row" key={item.id}>
                    <Table.Td role="cell" data-label={t.membershipCatalog.package}>
                      <Link
                        className="csa-list-primary-link"
                        href={`/membership-catalog/packages/${item.id}`}
                      >
                        {translation?.name || item.name}
                      </Link>
                      {!hasCompleteCatalogTranslations(item.translations) && (
                        <Badge color="orange" className="catalog-translation-warning">
                          {t.membershipCatalog.translationNeedsReview}
                        </Badge>
                      )}
                      <small className="table-secondary">
                        {item.items
                          .map((raw) => {
                            const line = legacyPackageItemView(raw);
                            return `${localizedCatalogTranslation(line.translations, locale)?.name || line.name}: ${line.quotaUnits}`;
                          })
                          .join(" · ") || "—"}
                      </small>
                    </Table.Td>
                    <Table.Td role="cell" data-label={t.membershipCatalog.priceOptions}>
                      {item.price_options
                        .filter((option) => option.is_active)
                        .map((option) => (
                          <small className="table-secondary" key={option.id}>
                            {t.membershipCatalog.priceOptionSummary
                              .replace("{months}", String(option.duration_months))
                              .replace(
                                "{price}",
                                formatMembershipMoney(option.monthly_price_vnd, locale),
                              )}
                          </small>
                        ))}
                    </Table.Td>
                    <Table.Td role="cell" data-label={t.membershipCatalog.status}>
                      <Status active={item.is_active} />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
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
