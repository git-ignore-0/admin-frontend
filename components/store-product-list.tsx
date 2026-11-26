"use client";

import {
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Image,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { RecoveryAlert } from "@/components/recovery-alert";
import { formatAdminDate } from "@/lib/admin-date";
import { listStoreCategories, listStoreProducts } from "@/lib/commerce-api";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { categoryPath } from "@/lib/store-categories";
import {
  readStoreProductListContext,
  STORE_PRODUCTS_PATH,
  storeProductHref,
} from "@/lib/store-product-navigation";
import type { StoreCategory, StoreProduct } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

const filterSelectProps = {
  role: "combobox",
  withScrollArea: false,
  comboboxProps: {
    withinPortal: false,
    floatingStrategy: "fixed",
    middlewares: { size: { padding: 8 } },
    styles: { dropdown: { overflowY: "auto" } },
  },
} as const;

function booleanFilter(value: string) {
  return value === "true" ? true : value === "false" ? false : undefined;
}

export function StoreProductList() {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { search, categoryId, status, csa, page } = readStoreProductListContext(searchParams);
  const activeFilterCount = [categoryId, status !== "active", csa].filter(Boolean).length;
  const hasAppliedFilters = Boolean(search || activeFilterCount);
  const [query, setQuery] = useState(search);
  const [categoryRows, setCategories] = useState<StoreCategory[] | null>(null);
  const [categoryError, setCategoryError] = useState<unknown>(null);
  const [categoryRetry, setCategoryRetry] = useState(0);
  const categoryRequest = useRef<AbortController | null>(null);

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
    router.push(`${STORE_PRODUCTS_PATH}${next ? `?${next}` : ""}`, { scroll: false });
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
  const lastPage = meta ? Math.max(1, Math.ceil(meta.total / meta.page_size)) : page;

  useEffect(() => {
    if (loading || page <= lastPage) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(lastPage));
    router.replace(storeProductHref(params), { scroll: false });
  }, [lastPage, loading, page, router, searchParams]);

  function reloadProducts() {
    if (categoryRows === null && categoryRequest.current?.signal.aborted) {
      setCategoryRetry((value) => value + 1);
    }
    reload();
  }

  function submit(value: string) {
    const applied = value.trim();
    if (applied === search && page === 1) reloadProducts();
    else navigate({ search: applied, page: "" });
  }

  function clearFilters() {
    setQuery("");
    navigate({ search: "", category_id: "", status: "", csa_eligible: "", page: "" });
  }

  const categories = categoryRows ?? [];
  const categoryOptions = categories.map((item) => ({
    value: item.id,
    label: categoryPath(item, categories, locale),
  }));
  const labels = new Map(categoryOptions.map(({ value, label }) => [value, label]));
  const initialLoading = items === null && loading;
  const columns = [
    copy.productName,
    copy.category,
    copy.price,
    copy.saleType,
    copy.status,
    copy.updatedAt,
  ];
  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={700}
      role="region"
      aria-label={copy.products}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
      style={{ outlineOffset: -2 }}
    >
      <Table aria-label={copy.products} aria-busy={loading || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            {columns.map((label) => (
              <Table.Th key={label} scope="col">
                {label}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading
            ? Array.from({ length: 5 }, (_, row) => (
                <Table.Tr key={row}>
                  {columns.map((column) => (
                    <Table.Td key={column}>
                      <Skeleton height={column === copy.productName ? 48 : 16} width="72%" />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            : items?.map((item) => {
                const name =
                  item.translations.find((value) => value.locale === locale)?.name ||
                  item.translations[0]?.name ||
                  item.sku;
                return (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap" miw={0}>
                        {item.primary_image && (
                          <Image
                            component={NextImage}
                            alt=""
                            src={mediaUrlForWidth(item.primary_image, 96)}
                            width={48}
                            height={48}
                            w={48}
                            h={48}
                            radius="md"
                            flex="0 0 auto"
                            unoptimized
                          />
                        )}
                        <Stack
                          gap="calc(var(--mantine-spacing-xs) / 2)"
                          miw={0}
                          style={{ overflowWrap: "anywhere" }}
                        >
                          <Anchor
                            component={AdminNavigationLink}
                            href={storeProductHref(searchParams, item.id)}
                            fw={600}
                          >
                            {name}
                          </Anchor>
                          <Text size="sm" c="dimmed">
                            {item.sku}
                          </Text>
                        </Stack>
                      </Group>
                    </Table.Td>
                    <Table.Td style={{ overflowWrap: "anywhere" }}>
                      {labels.get(item.category_id) ?? item.category_slug}
                    </Table.Td>
                    <Table.Td>
                      {new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(
                        BigInt(item.retail_price_vnd),
                      )}{" "}
                      ₫
                    </Table.Td>
                    <Table.Td>
                      {item.csa_quota_group_id ? copy.csaEligible : copy.retailOnly}
                    </Table.Td>
                    <Table.Td>
                      <ProductLifecycleStatus status={item.status} />
                    </Table.Td>
                    <Table.Td>
                      <Text component="time" dateTime={item.updated_at} size="sm" c="dimmed">
                        {formatAdminDate(item.updated_at)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack component="section" aria-busy={loading} gap="md" miw={0}>
      <PageHeading title={copy.products} visuallyHiddenTitle />
      <ListToolbar
        busy={loading}
        primaryAction={
          <Button
            component={AdminNavigationLink}
            href={storeProductHref(searchParams, undefined, "new")}
          >
            {copy.addProduct}
          </Button>
        }
        search={{
          label: copy.search,
          placeholder: copy.searchProduct,
          value: query,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setQuery,
          onSubmit: submit,
          clearLabel: t.common.clearFilters,
          onClear: clearFilters,
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: activeFilterCount,
          clearLabel: t.common.clearFilters,
          clearDisabled: !query && !hasAppliedFilters,
          onClear: clearFilters,
          children: (
            <>
              <Select
                {...filterSelectProps}
                label={copy.category}
                disabled={loading}
                value={categoryId}
                onChange={(selection) => navigate({ category_id: selection ?? "", page: "" })}
                data={[{ value: "", label: copy.all }, ...categoryOptions]}
              />
              <Select
                {...filterSelectProps}
                label={copy.status}
                disabled={loading}
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
              <Select
                {...filterSelectProps}
                label={copy.saleType}
                disabled={loading}
                value={csa}
                onChange={(selection) => navigate({ csa_eligible: selection ?? "", page: "" })}
                data={[
                  { value: "", label: copy.all },
                  { value: "true", label: copy.csaSaleOption },
                  { value: "false", label: copy.retailOnly },
                ]}
              />
            </>
          ),
        }}
      />
      <Paper w="100%" miw={0} style={{ overflow: "hidden" }}>
        {categoryError != null && (
          <Box p="md">
            <RecoveryAlert
              message={requestErrorMessage(categoryError, t)}
              retryLabel={t.common.retry}
              onRetry={() => setCategoryRetry((value) => value + 1)}
            />
          </Box>
        )}
        {Boolean(items?.length) && table}
        <Box p={error || (loading && items !== null) ? "md" : undefined}>
          <ListState
            embedded
            empty={copy.noProducts}
            error={error}
            hasData={items !== null}
            isEmpty={items?.length === 0}
            loading={loading}
            loadingLabel={copy.loading}
            loadingPlaceholder={initialLoading ? table : undefined}
            noResults={hasAppliedFilters ? copy.noMatchingProducts : undefined}
            onRetry={reloadProducts}
            refreshingLabel={copy.refreshing}
            retryLabel={t.common.retry}
          />
        </Box>
        {meta && (
          <>
            <Divider />
            <Box px="md" py="sm">
              <Pagination
                disabled={loading}
                nextLabel={t.common.next}
                onPage={setPage}
                page={meta.page}
                pageSize={meta.page_size}
                previousLabel={t.common.previous}
                resultCountLabel={t.common.resultCount}
                resultCountSingularLabel={t.common.resultCountSingular}
                summary={t.common.pagination}
                total={meta.total}
              />
            </Box>
          </>
        )}
      </Paper>
    </Stack>
  );
}
