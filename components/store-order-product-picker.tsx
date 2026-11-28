"use client";

import { Box, Button, Checkbox, Divider, Group, Modal, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import type { StoreOrderKind } from "@/lib/admin-store-order-api";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { listStoreProducts } from "@/lib/commerce-api";
import { formatDecimalInput } from "@/lib/numeric-input";
import { storeOrderCreateCopy } from "@/lib/store-order-create-copy";
import {
  isStoreOrderProductSelectable,
  MAX_ORDER_LINES,
  storeOrderProductName,
} from "@/lib/store-order-draft";
import { formatStoreMoney } from "@/lib/store-orders";
import type { StoreProduct } from "@/lib/types";

const pickerCopy = {
  vi: {
    select: "Chọn {name} ({sku})",
    selectPage: "Chọn sản phẩm trên trang này",
    add: "Thêm sản phẩm",
    added: "Đã thêm",
    unit: "Quy cách",
    catalogPrice: "Giá tham chiếu",
    selection: "Đã chọn {count}",
    limit: "Tối đa {limit} dòng sản phẩm mỗi đơn.",
  },
  en: {
    select: "Select {name} ({sku})",
    selectPage: "Select products on this page",
    add: "Add products",
    added: "Already added",
    unit: "Selling unit",
    catalogPrice: "Reference price",
    selection: "{count} selected",
    limit: "Up to {limit} product lines per order.",
  },
} as const;

type PickerProps = {
  opened: boolean;
  kind: StoreOrderKind;
  selected: readonly Pick<StoreProduct, "id">[];
  onClose: () => void;
  onAdd: (products: StoreProduct[]) => void;
};

export function StoreOrderProductPicker({ opened, kind, selected, onClose, onAdd }: PickerProps) {
  const { locale, t } = useAdminI18n();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={pickerCopy[locale].add}
      size="xl"
      closeButtonProps={{ "aria-label": t.common.close }}
    >
      {opened && (
        <ProductSelection
          key={kind}
          kind={kind}
          selected={selected}
          onClose={onClose}
          onAdd={onAdd}
        />
      )}
    </Modal>
  );
}

function ProductSelection({ kind, selected, onClose, onAdd }: Omit<PickerProps, "opened">) {
  const { locale, t } = useAdminI18n();
  const copy = pickerCopy[locale];
  const catalog = t.storeCatalog;
  const currentSession = useIsAdminQueryScopeCurrent();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState(() => new Map<string, StoreProduct>());
  const query = useQuery({
    queryKey: ["store-products", "order-picker", kind, search, page],
    queryFn: ({ signal }) =>
      listStoreProducts({ page, search, status: kind === "new" ? "active" : undefined }, signal),
  });

  const denied = isProtectedDataError(query.error);
  const data = !denied && currentSession() ? query.data : undefined;
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size)) : page;
  const rows = page <= lastPage ? (data?.data ?? []) : [];
  const addable = !query.error && !query.isFetching && !query.isPaused && page <= lastPage;
  const existing = new Set(selected.map(({ id }) => id));
  const remaining = Math.max(0, MAX_ORDER_LINES - existing.size);
  const currentPage = new Map(rows.map((product) => [product.id, product]));
  const isSelectable = (product: StoreProduct) =>
    !existing.has(product.id) && isStoreOrderProductSelectable(product, kind);
  const pending = [...selection.values()]
    .map((product) => currentPage.get(product.id) ?? product)
    .filter(isSelectable);
  const pendingIds = new Set(pending.map(({ id }) => id));
  const selectable = rows.filter(isSelectable);
  const checkedHere = selectable.filter(({ id }) => pendingIds.has(id)).length;
  const allChecked = selectable.length > 0 && checkedHere === selectable.length;
  const pageFits = pending.length + selectable.length - checkedHere <= remaining;
  const showLoading = query.isFetching || page > lastPage;
  const error = query.error
    ? requestErrorMessage(query.error, t)
    : query.isPaused
      ? t.users.offline
      : "";

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [lastPage, page]);

  useEffect(() => {
    if (!data || !addable) return;
    setSelection((previous) => {
      let next = previous;
      for (const product of data.data) {
        const selected = previous.get(product.id);
        if (!selected || selected === product) continue;
        if (next === previous) next = new Map(previous);
        if (isStoreOrderProductSelectable(product, kind)) next.set(product.id, product);
        else next.delete(product.id);
      }
      return next;
    });
  }, [addable, data, kind]);

  function applySearch(value: string) {
    const normalized = value.trim();
    setInput(normalized);
    setSearch(normalized);
    setPage(1);
    if (page === 1 && search === normalized) void query.refetch({ cancelRefetch: false });
  }

  function selectProducts(products: readonly StoreProduct[], checked: boolean) {
    if (!currentSession() || !addable) return;
    setSelection((previous) => {
      const next = new Map(previous);
      for (const product of products) {
        if (!checked) next.delete(product.id);
        else if (isSelectable(product)) next.set(product.id, product);
      }
      return next.size <= remaining ? next : previous;
    });
  }

  const table = (skeleton: boolean) => (
    <Table.ScrollContainer
      type="native"
      minWidth={430}
      role="region"
      aria-label={catalog.products}
      aria-hidden={skeleton || undefined}
      tabIndex={skeleton ? undefined : 0}
    >
      <Table aria-label={catalog.products}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" w={44}>
              <Checkbox
                aria-label={copy.selectPage}
                checked={allChecked}
                indeterminate={checkedHere > 0 && !allChecked}
                disabled={skeleton || !addable || !selectable.length || (!allChecked && !pageFits)}
                onChange={(event) => selectProducts(selectable, event.currentTarget.checked)}
              />
            </Table.Th>
            <Table.Th scope="col">{catalog.productName}</Table.Th>
            <Table.Th scope="col">{copy.unit}</Table.Th>
            <Table.Th scope="col" ta="right">
              {copy.catalogPrice}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {skeleton ? (
            <TableSkeletonRows columns={4} height={36} />
          ) : (
            rows.map((product) => {
              const name = storeOrderProductName(product, locale);
              const alreadyAdded = existing.has(product.id);
              const checked = pendingIds.has(product.id) || alreadyAdded;
              return (
                <Table.Tr key={product.id} data-selected={checked || undefined}>
                  <Table.Td>
                    <Checkbox
                      aria-label={copy.select.replace("{name}", name).replace("{sku}", product.sku)}
                      checked={checked}
                      disabled={
                        !addable ||
                        !isSelectable(product) ||
                        (!checked && pending.length >= remaining)
                      }
                      onChange={(event) => selectProducts([product], event.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                      <Text fw={600}>{name}</Text>
                      <Text c="dimmed" size="sm">
                        {product.sku}
                      </Text>
                      {alreadyAdded && (
                        <Text c="dimmed" size="sm">
                          {copy.added}
                        </Text>
                      )}
                      {product.status === "draft" && (
                        <Text c="dimmed" size="sm">
                          {catalog.productDraft}
                        </Text>
                      )}
                      {product.status !== "draft" &&
                        !isStoreOrderProductSelectable(product, kind) && (
                          <Text c="dimmed" size="sm">
                            {storeOrderCreateCopy(locale).productUnavailable}
                          </Text>
                        )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    {formatDecimalInput(product.unit_size)}{" "}
                    {locale === "vi" ? product.unit_label_vi : product.unit_label_en}
                  </Table.Td>
                  <Table.Td ta="right">
                    {formatStoreMoney(product.retail_price_vnd, locale)}
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack gap="md">
      <ListToolbar
        growSearch
        search={{
          label: catalog.searchProduct,
          value: input,
          onChange: (value) => setInput(value.slice(0, 200)),
          onSubmit: applySearch,
          submitLabel: catalog.search,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          clearLabel: t.common.clearFilters,
          onClear: () => applySearch(""),
        }}
      />
      <DataListPaper>
        {rows.length > 0 && table(false)}
        <ListState
          embedded
          empty={catalog.noProducts}
          noResults={search ? catalog.noMatchingProducts : undefined}
          error={error}
          hasData={Boolean(data) && page <= lastPage}
          isEmpty={Boolean(data) && page <= lastPage && rows.length === 0}
          loading={showLoading}
          loadingPlaceholder={table(true)}
          loadingLabel={catalog.loading}
          retryLabel={t.common.retry}
          onRetry={() => void query.refetch({ cancelRefetch: false })}
        />
        {data && page <= lastPage && (
          <>
            <Divider />
            <Box px="md" py="sm">
              <Pagination
                page={page}
                pageSize={data.meta.page_size}
                total={data.meta.total}
                onPage={setPage}
                disabled={!addable}
                previousLabel={t.common.previous}
                nextLabel={t.common.next}
                summary={t.common.pagination}
                resultCountLabel={t.common.resultCount}
                resultCountSingularLabel={t.common.resultCountSingular}
              />
            </Box>
          </>
        )}
      </DataListPaper>
      {pending.length >= remaining && (
        <Text c="dimmed" size="sm" role="status">
          {copy.limit.replace("{limit}", String(MAX_ORDER_LINES))}
        </Text>
      )}
      <Group justify="space-between">
        <Text size="sm" role="status">
          {copy.selection.replace("{count}", String(pending.length))}
        </Text>
        <Group gap="xs">
          <Button type="button" variant="default" onClick={onClose}>
            {catalog.cancel}
          </Button>
          <Button
            type="button"
            disabled={!addable || !pending.length || pending.length > remaining}
            onClick={() => {
              if (!currentSession() || !addable || !pending.length || pending.length > remaining)
                return;
              onAdd(pending);
              onClose();
            }}
          >
            {copy.add}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
