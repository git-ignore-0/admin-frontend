"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import {
  useAdminRecordScope,
  useIsAdminQueryScopeCurrent,
} from "@/components/admin-query-provider";
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
    selectedProducts: "Sản phẩm đã chọn",
    browseProducts: "Quay lại danh sách sản phẩm",
    noSelection: "Chưa chọn sản phẩm nào.",
    removeUnavailable: "Bỏ chọn các sản phẩm không còn khả dụng để tiếp tục.",
    checking: "Đang kiểm tra sản phẩm đã chọn",
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
    selectedProducts: "Selected products",
    browseProducts: "Back to catalog",
    noSelection: "No products selected.",
    removeUnavailable: "Remove unavailable selections to continue.",
    checking: "Checking selected products",
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
  const scope = useAdminRecordScope(kind);
  const tableId = useId();
  const browseButton = useRef<HTMLButtonElement>(null);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState(() => new Map<string, StoreProduct>());
  const [reviewing, setReviewing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verificationError, setVerificationError] = useState<unknown>(null);
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(() => new Set());
  const query = useQuery({
    queryKey: ["store-products", "order-picker", kind, search, page],
    queryFn: ({ signal }) => listStoreProducts({ page, search, order_kind: kind }, signal),
  });

  const denied =
    !currentSession() ||
    isProtectedDataError(query.error) ||
    isProtectedDataError(verificationError);
  const data = denied ? undefined : query.data;
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size)) : page;
  const rows = page <= lastPage ? (data?.data ?? []) : [];
  const addable =
    Boolean(data) &&
    !query.error &&
    !query.isFetching &&
    !query.isPaused &&
    !checking &&
    page <= lastPage;
  const existing = new Set(selected.map(({ id }) => id));
  const remaining = Math.max(0, MAX_ORDER_LINES - existing.size);
  const isSelectable = (product: StoreProduct) =>
    !existing.has(product.id) && isStoreOrderProductSelectable(product, kind);
  const selectable = rows.filter(isSelectable);
  const checkedHere = selectable.filter(({ id }) => selection.has(id)).length;
  const allChecked = selectable.length > 0 && checkedHere === selectable.length;
  const pageFits = selection.size + selectable.length - checkedHere <= remaining;
  const canAdd =
    !denied && !checking && selection.size > 0 && selection.size <= remaining && !unavailable.size;
  const showLoading = query.isFetching || page > lastPage;
  const error = query.error
    ? requestErrorMessage(query.error, t)
    : query.isPaused
      ? t.users.offline
      : "";

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [lastPage, page]);

  function applySearch(value: string) {
    const normalized = value.trim();
    setInput(normalized);
    setSearch(normalized);
    setPage(1);
    if (page === 1 && search === normalized) void query.refetch({ cancelRefetch: false });
  }

  function selectProducts(products: readonly StoreProduct[], checked: boolean) {
    if (!currentSession() || denied || checking || (checked && !addable)) return;
    setSelection((previous) => {
      const next = new Map(previous);
      for (const product of products) {
        if (!checked) next.delete(product.id);
        else if (isSelectable(product)) next.set(product.id, product);
      }
      return !checked || next.size <= remaining ? next : previous;
    });
    if (!checked) {
      setUnavailable((previous) => {
        const next = new Set(previous);
        for (const { id } of products) next.delete(id);
        return next.size === previous.size ? previous : next;
      });
    }
  }

  async function verifySelection() {
    if (!currentSession() || !canAdd) return;
    const read = scope.beginRead();
    const pending = [...selection.values()];
    const ids = pending.map(({ id }) => id);
    setChecking(true);
    setVerificationError(null);
    try {
      const { data: products } = await listStoreProducts(
        { order_kind: kind, product_ids: ids },
        read.signal,
      );
      if (!read.current()) return;
      const verified = new Map(
        products.filter(isSelectable).map((product) => [product.id, product]),
      );
      const invalid = ids.filter((id) => !verified.has(id));
      const latest = pending.map((product) => verified.get(product.id) ?? product);
      if (invalid.length) {
        setSelection(new Map(latest.map((product) => [product.id, product])));
        setUnavailable(new Set(invalid));
        setReviewing(true);
        return;
      }
      onAdd(latest);
      onClose();
    } catch (caught) {
      if (read.current()) setVerificationError(caught);
    } finally {
      if (read.current()) setChecking(false);
    }
  }

  const tableLabel = reviewing ? copy.selectedProducts : catalog.products;
  const table = (skeleton: boolean) => (
    <Table.ScrollContainer
      type="native"
      minWidth={430}
      role="region"
      aria-label={tableLabel}
      aria-hidden={skeleton || undefined}
      tabIndex={skeleton ? undefined : 0}
    >
      <Table aria-label={tableLabel}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" w={44}>
              {!reviewing && (
                <Checkbox
                  aria-label={copy.selectPage}
                  checked={allChecked}
                  indeterminate={checkedHere > 0 && !allChecked}
                  disabled={
                    skeleton || !addable || !selectable.length || (!allChecked && !pageFits)
                  }
                  onChange={(event) => selectProducts(selectable, event.currentTarget.checked)}
                />
              )}
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
            (reviewing ? [...selection.values()] : rows).map((product) => {
              const name = storeOrderProductName(product, locale);
              const alreadyAdded = existing.has(product.id);
              const checked = selection.has(product.id) || alreadyAdded;
              const invalid = unavailable.has(product.id);
              const issueId = invalid ? `${tableId}-${product.id}` : undefined;
              return (
                <Table.Tr key={product.id} data-selected={checked || undefined}>
                  <Table.Td>
                    <Checkbox
                      aria-label={
                        reviewing
                          ? storeOrderCreateCopy(locale).removeProduct.replace(
                              "{product}",
                              `${name} (${product.sku})`,
                            )
                          : copy.select.replace("{name}", name).replace("{sku}", product.sku)
                      }
                      aria-invalid={invalid || undefined}
                      aria-describedby={issueId}
                      checked={checked}
                      disabled={
                        reviewing
                          ? checking
                          : !addable ||
                            !isSelectable(product) ||
                            (!checked && selection.size >= remaining)
                      }
                      onChange={(event) => {
                        const checkbox = event.currentTarget;
                        if (reviewing && !checkbox.checked) {
                          const row = checkbox.closest("tr");
                          const adjacent = row?.nextElementSibling ?? row?.previousElementSibling;
                          const target =
                            adjacent?.querySelector<HTMLInputElement>('input[type="checkbox"]') ??
                            browseButton.current;
                          target?.focus();
                        }
                        selectProducts([product], checkbox.checked);
                      }}
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
                      {(invalid ||
                        (product.status !== "draft" &&
                          !isStoreOrderProductSelectable(product, kind))) && (
                        <Text id={issueId} c={invalid ? "danger" : "dimmed"} size="sm">
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
      {verificationError != null && (
        <Alert color="danger" role="alert">
          {requestErrorMessage(verificationError, t)}
        </Alert>
      )}
      {unavailable.size > 0 && !denied && (
        <Alert color="danger" role="alert">
          {copy.removeUnavailable}
        </Alert>
      )}
      {reviewing && !denied ? (
        <Box>
          <Button
            ref={browseButton}
            variant="default"
            type="button"
            onClick={() => setReviewing(false)}
          >
            {copy.browseProducts}
          </Button>
        </Box>
      ) : (
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
      )}
      <DataListPaper id={tableId}>
        {!denied && (reviewing ? selection.size > 0 : rows.length > 0) && table(false)}
        <ListState
          embedded
          empty={reviewing ? copy.noSelection : catalog.noProducts}
          noResults={!reviewing && search ? catalog.noMatchingProducts : undefined}
          error={reviewing && !denied ? "" : error}
          hasData={(reviewing && !denied) || (Boolean(data) && page <= lastPage)}
          isEmpty={
            reviewing && !denied
              ? !selection.size
              : Boolean(data) && page <= lastPage && rows.length === 0
          }
          loading={!reviewing && showLoading}
          loadingPlaceholder={table(true)}
          loadingLabel={catalog.loading}
          retryLabel={t.common.retry}
          onRetry={() => void query.refetch({ cancelRefetch: false })}
        />
        {!reviewing && data && page <= lastPage && (
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
      {selection.size >= remaining && (
        <Text c="dimmed" size="sm" role="status">
          {copy.limit.replace("{limit}", String(MAX_ORDER_LINES))}
        </Text>
      )}
      <Group justify="space-between">
        <Box role="status">
          {selection.size && !denied ? (
            <Button
              type="button"
              variant="subtle"
              size="compact-sm"
              aria-pressed={reviewing}
              aria-controls={tableId}
              onClick={() => setReviewing(!reviewing)}
            >
              {copy.selection.replace("{count}", String(selection.size))}
            </Button>
          ) : (
            <Text size="sm">{copy.selection.replace("{count}", "0")}</Text>
          )}
        </Box>
        <Group gap="xs">
          <Button type="button" variant="default" onClick={onClose}>
            {catalog.cancel}
          </Button>
          <Button
            type="button"
            loading={checking}
            aria-label={checking ? copy.checking : undefined}
            disabled={!canAdd}
            onClick={() => void verifySelection()}
          >
            {copy.add}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
