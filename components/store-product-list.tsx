"use client";
import { Stack, Alert, Button, Table } from "@mantine/core";

import { FormField, FormSelect } from "@/components/nfv-controls";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { Pagination } from "@/components/pagination";
import { formatAdminDate } from "@/lib/admin-date";
import { listStoreCategories, listStoreProducts } from "@/lib/commerce-api";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { categoryPath } from "@/lib/store-categories";
import type { StoreCategory, StoreProduct } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

function booleanFilter(value: string) {
  return value === "true" ? true : value === "false" ? false : undefined;
}

export function StoreProductList() {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const categoryId = searchParams.get("category_id") ?? "";
  const requestedStatus = searchParams.get("status");
  const status =
    requestedStatus === "draft" || requestedStatus === "discontinued" || requestedStatus === "all"
      ? requestedStatus
      : "active";
  const csa = searchParams.get("csa_eligible") ?? "";
  const hasAppliedFilters = Boolean(search || categoryId || status !== "active" || csa);
  const [query, setQuery] = useState(search);
  const [categoryRows, setCategories] = useState<StoreCategory[] | null>(null);
  const [categoryError, setCategoryError] = useState<unknown>(null);
  const [categoryRetry, setCategoryRetry] = useState(0);
  const categoryRequest = useRef<AbortController | null>(null);
  const requestedPage = Number(searchParams.get("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  useEffect(() => setQuery(search), [search]);

  function navigate(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("is_active");
    params.delete("is_published");
    const next = params.toString();
    router.push(`/store-catalog/products${next ? `?${next}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    const controller = new AbortController();
    categoryRequest.current = controller;
    listStoreCategories(undefined, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setCategories(items);
          setCategoryError(null);
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setCategories(null);
          setCategoryError(caught);
        }
      });
    return () => controller.abort();
  }, [categoryRetry]);

  const fetchPage = useCallback(
    (page: number, signal: AbortSignal) =>
      listStoreProducts(
        {
          page,
          search,
          category_id: categoryId || undefined,
          status: status === "all" ? undefined : status,
          csa_eligible: booleanFilter(csa),
        },
        signal,
      ),
    [search, categoryId, status, csa],
  );
  const getErrorMessage = useCallback(
    (caught: unknown) => {
      if (isProtectedDataError(caught)) {
        categoryRequest.current?.abort();
        setCategories(null);
      }
      return requestErrorMessage(caught, t);
    },
    [t],
  );
  const { items, meta, loading, error, reload, setPage } = usePaginatedList<StoreProduct>({
    fetchPage,
    getErrorMessage,
    controlledPage: page,
    enabled: !isProtectedDataError(categoryError),
    requestKey: JSON.stringify([search, categoryId, status, csa]),
    onPage: (next) => navigate({ page: next > 1 ? String(next) : "" }),
  });

  function reloadProducts() {
    if (categoryRows === null && categoryRequest.current?.signal.aborted) {
      setCategoryRetry((value) => value + 1);
    }
    reload();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim() === search && page === 1) reloadProducts();
    else navigate({ search: query.trim(), page: "" });
  }
  const categories = categoryRows ?? [];
  const categoryOptions = categories.map((item) => ({
    value: item.id,
    label: categoryPath(item, categories, locale),
  }));
  const labels = new Map(categoryOptions.map(({ value, label }) => [value, label]));
  return (
    <section aria-busy={loading}>
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <>
            <FormField label={copy.category} className="field">
              <FormSelect
                value={categoryId}
                onChange={(selection) => navigate({ category_id: selection ?? "", page: "" })}
                data={[{ value: "", label: copy.all }, ...categoryOptions]}
              />
            </FormField>
            <FormField label={copy.status} className="field">
              <FormSelect
                value={status}
                onChange={(selection) =>
                  navigate({ status: selection === "active" ? "" : (selection ?? ""), page: "" })
                }
                data={[
                  { value: "all", label: copy.all },
                  { value: "draft", label: copy.productDraft },
                  { value: "active", label: copy.selling },
                  { value: "discontinued", label: copy.discontinued },
                ]}
              />
            </FormField>
            <FormField label={copy.saleType} className="field">
              <FormSelect
                value={csa}
                onChange={(selection) => navigate({ csa_eligible: selection ?? "", page: "" })}
                data={[
                  { value: "", label: copy.all },
                  { value: "true", label: copy.csaSaleOption },
                  { value: "false", label: copy.retailOnly },
                ]}
              />
            </FormField>
          </>
        }
        hasFilters={Boolean(query || hasAppliedFilters)}
        onClear={() => {
          setQuery("");
          navigate({
            search: "",
            category_id: "",
            status: "",
            csa_eligible: "",
            page: "",
          });
        }}
        onQueryChange={setQuery}
        onSubmit={submit}
        placeholder={copy.searchProduct}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={copy.search}
        searchSubmitLabel={copy.search}
      />
      {categoryError != null && (
        <Alert color="red" role="alert">
          <Stack gap="sm" align="flex-start">
            {requestErrorMessage(categoryError, t)}{" "}
            <Button variant="default" onClick={() => setCategoryRetry((value) => value + 1)}>
              {t.common.retry}
            </Button>
          </Stack>
        </Alert>
      )}
      <ListState
        empty={copy.noProducts}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={copy.loading}
        noResults={hasAppliedFilters ? copy.noMatchingProducts : undefined}
        onRetry={reloadProducts}
        refreshingLabel={copy.refreshing}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <Table.ScrollContainer type="native" minWidth={0} className="table-wrap">
          <Table role="table" className="store-product-table">
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{copy.productName}</Table.Th>
                <Table.Th role="columnheader">{copy.category}</Table.Th>
                <Table.Th role="columnheader">{copy.price}</Table.Th>
                <Table.Th role="columnheader">{copy.saleType}</Table.Th>
                <Table.Th role="columnheader">{copy.status}</Table.Th>
                <Table.Th role="columnheader">{copy.updatedAt}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => {
                const name =
                  item.translations.find((value) => value.locale === locale)?.name ||
                  item.translations[0]?.name ||
                  item.sku;
                return (
                  <Table.Tr role="row" key={item.id}>
                    <Table.Td role="cell" data-label={copy.productName}>
                      <div className="store-product-identity">
                        {item.primary_image && (
                          <Image
                            alt=""
                            src={mediaUrlForWidth(item.primary_image, 96)}
                            width={48}
                            height={48}
                            unoptimized
                          />
                        )}
                        <div>
                          <Link
                            className="csa-list-primary-link"
                            href={`/store-catalog/products/${item.id}`}
                          >
                            {name}
                          </Link>
                          <small className="table-secondary">{item.sku}</small>
                        </div>
                      </div>
                    </Table.Td>
                    <Table.Td role="cell" data-label={copy.category}>
                      {labels.get(item.category_id) ?? item.category_slug}
                    </Table.Td>
                    <Table.Td role="cell" data-label={copy.price}>
                      {new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(
                        BigInt(item.retail_price_vnd),
                      )}{" "}
                      ₫
                    </Table.Td>
                    <Table.Td role="cell" data-label={copy.saleType}>
                      {item.csa_quota_group_id ? copy.csaEligible : copy.retailOnly}
                    </Table.Td>
                    <Table.Td role="cell" data-label={copy.status}>
                      <ProductLifecycleStatus status={item.status} />
                    </Table.Td>
                    <Table.Td role="cell" data-label={copy.updatedAt}>
                      {formatAdminDate(item.updated_at)}
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
