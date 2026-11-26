"use client";
import { Stack, Alert, Button, Table } from "@mantine/core";

import { FormField, FormSelect } from "@/components/nfv-controls";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { Pagination } from "@/components/pagination";
import { requireResponseEntity, requireResponseList } from "@/lib/api-response";
import { formatAdminDate } from "@/lib/admin-date";
import { listStoreCategories, listStoreProducts } from "@/lib/commerce-api";
import { invalidApiResponse, isApiObject, requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { categoryPath } from "@/lib/store-categories";
import type { StoreCategory, StoreProduct } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

function booleanFilter(value: string) {
  return value === "true" ? true : value === "false" ? false : undefined;
}

function validateProductRecord(product: StoreProduct) {
  requireResponseEntity(product);
  if (!["draft", "active", "discontinued"].includes(product.status)) throw invalidApiResponse();
  requireResponseList(product.translations, (translation) => {
    if (!isApiObject(translation) || typeof translation.name !== "string") {
      throw invalidApiResponse();
    }
  });
  if (typeof product.retail_price_vnd !== "string" || !/^\d+$/u.test(product.retail_price_vnd)) {
    throw invalidApiResponse();
  }
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
  const [query, setQuery] = useState(search);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

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
    let cancelled = false;
    listStoreCategories()
      .then((items) => {
        if (!cancelled) {
          setCategories(items);
          setCategoryError("");
        }
      })
      .catch((caught) => {
        if (!cancelled) setCategoryError(requestErrorMessage(caught, t));
      });
    return () => {
      cancelled = true;
    };
  }, [categoryRetry, t]);

  const fetchPage = useCallback(
    (page: number) =>
      listStoreProducts({
        page,
        search,
        category_id: categoryId || undefined,
        status: status === "all" ? undefined : status,
        csa_eligible: booleanFilter(csa),
      }),
    [search, categoryId, status, csa],
  );
  const getErrorMessage = useCallback((caught: unknown) => requestErrorMessage(caught, t), [t]);
  const { items, meta, loading, error, reload, setPage } = usePaginatedList<StoreProduct>({
    fetchPage,
    validateRecord: validateProductRecord,
    getErrorMessage,
    controlledPage: page,
    onPage: (next) => navigate({ page: next > 1 ? String(next) : "" }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim() === search && page === 1) reload();
    else navigate({ search: query.trim(), page: "" });
  }
  const labels = new Map(
    categories.map((item) => [item.id, categoryPath(item, categories, locale)]),
  );
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
                data={[
                  { value: "", label: copy.all },
                  ...categories.map((item) => ({
                    value: item.id,
                    label: categoryPath(item, categories, locale),
                  })),
                ]}
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
        hasFilters={Boolean(query || search || categoryId || status !== "active" || csa)}
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
      {categoryError && (
        <Alert color="red" role="alert">
          <Stack gap="sm" align="flex-start">
            {categoryError}{" "}
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
        onRetry={reload}
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
