"use client";

import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  Divider,
  Flex,
  Grid,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { AdminDateInput } from "@/components/admin-date-input";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { ListToolbar } from "@/components/list-toolbar";
import { FormField } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { RecordDetailField } from "@/components/record-detail-fields";
import { adminDateInputToIso, adminTodayIso } from "@/lib/admin-date";
import { adminDictionaries, type AdminLocale } from "@/lib/admin-i18n";
import {
  FARM_SUPPLY_LIMIT,
  farmSupplyProductName,
  farmSupplyProductUnit,
  summarizeFarmSupplyDraft,
  type FarmSupplyDraft,
  type FarmSupplyInput,
  type FarmSupplyProduct,
} from "@/lib/farm-supply-form";
import { farmsCopy } from "@/lib/farms-copy";
import {
  formatDecimalInput,
  numericInputErrorMessage,
  parsePositiveInteger,
} from "@/lib/numeric-input";

import styles from "./farm-bulk-supply-form.module.css";

const NON_ASCII_DIGIT = /[^0-9]/u;

const labels = {
  en: {
    summary: "Supply summary",
    period: "Supply period",
    search: "Search products",
    clearSearch: "Clear search",
    empty: "This farm has no products eligible for additional supply.",
    noResults: "No eligible products match your search.",
    available: "Remaining",
    saleUnit: "Sale unit",
    quantity: "Additional quantity",
    converted: "Converted quantity",
    remove: "Remove {name}",
    count: "{count} products",
    singular: "{count} product",
    total: "Total",
    view: "View details",
    hide: "Hide details",
    review: "Check the products highlighted in the summary.",
    limitExceeded: "Remove products from the summary to keep at most {max}.",
    submit: "Submit",
    refresh: "Refresh products",
    digitsOnly: "Enter digits only.",
  },
  vi: {
    summary: "Tổng hợp nguồn cung",
    period: "Thời gian cung cấp",
    search: "Tìm sản phẩm",
    clearSearch: "Xóa tìm kiếm",
    empty: "Trang trại chưa có sản phẩm đủ điều kiện bổ sung nguồn cung.",
    noResults: "Không tìm thấy sản phẩm đủ điều kiện khớp với tìm kiếm.",
    available: "Còn lại",
    saleUnit: "Đơn vị bán",
    quantity: "Số lượng bổ sung",
    converted: "Quy đổi",
    remove: "Bỏ {name}",
    count: "{count} sản phẩm",
    singular: "{count} sản phẩm",
    total: "Tổng",
    view: "Xem chi tiết",
    hide: "Thu gọn chi tiết",
    review: "Kiểm tra các sản phẩm có lỗi trong phần tổng hợp.",
    limitExceeded: "Bỏ bớt sản phẩm trong phần tổng hợp để còn tối đa {max}.",
    submit: "Xác nhận",
    refresh: "Làm mới danh sách sản phẩm",
    digitsOnly: "Chỉ nhập chữ số.",
  },
};

type Props<P extends FarmSupplyProduct> = {
  locale: AdminLocale;
  draft: FarmSupplyDraft<P>;
  onDraftChange: (draft: FarmSupplyDraft<P>) => void;
  products: P[] | undefined;
  remaining?: (product: P) => number;
  showSaleUnitColumn?: boolean;
  submitLabel?: string;
  quantityLabel?: string;
  quantityMax?: number;
  emptyLabel?: string;
  noResultsLabel?: string;
  loading?: boolean;
  refreshing?: boolean;
  error?: string;
  onRetry?: () => void;
  search: string;
  onSearch: (value: string) => void;
  pagination?: { page: number; pageSize: number; total: number; onChange: (page: number) => void };
  locked?: boolean;
  cancelDisabled?: boolean;
  submitDisabled?: boolean;
  submitting?: boolean;
  errors?: { start_date?: string; end_date?: string; items?: Record<string, string> };
  review?: ReactNode;
  onSubmit: (input: FarmSupplyInput<P>) => void;
  onCancel?: () => void;
};

export function FarmSupplyForm<P extends FarmSupplyProduct>({
  locale,
  draft,
  onDraftChange,
  products,
  remaining,
  showSaleUnitColumn = false,
  submitLabel,
  quantityLabel,
  quantityMax,
  emptyLabel,
  noResultsLabel,
  loading = false,
  refreshing = false,
  error = "",
  onRetry,
  search,
  onSearch,
  pagination,
  locked = false,
  cancelDisabled = false,
  submitDisabled = false,
  submitting = false,
  errors,
  review,
  onSubmit,
  onCancel,
}: Props<P>) {
  const id = useId();
  const datesId = `${id}-dates`;
  const summaryHeadingId = `${id}-summary-heading`;
  const summaryId = `${id}-summary`;
  const formId = `${id}-supply`;
  const [searchText, setSearchText] = useState(search);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const { ref: layoutRef, width: contentWidth } = useElementSize();
  const desktop = contentWidth >= 880;
  const showRemaining = Boolean(remaining);
  const c = labels[locale];
  const f = farmsCopy(locale);
  const t = adminDictionaries[locale];
  const number = new Intl.NumberFormat(locale);
  const today = adminTodayIso();
  const startDate = adminDateInputToIso(draft.start_date);
  const summary = summarizeFarmSupplyDraft(draft, locale, today, quantityMax);
  const quantityTitle = quantityLabel ?? c.quantity;
  const entries = new Map(summary.items.map((item) => [item.product.product_id, item]));
  const productCount = summary.items.filter(({ quantity }) => quantity !== "").length;
  const overLimit = productCount > FARM_SUPPLY_LIMIT;
  const hasProductErrors = summary.items.some(({ product }) => quantityError(product.product_id));
  const fieldsLocked = locked || submitting;
  const hasFieldErrors = Boolean(
    hasProductErrors ||
    errors?.start_date ||
    errors?.end_date ||
    summary.dateErrors.start_date ||
    summary.dateErrors.end_date,
  );
  const blocked = fieldsLocked || submitDisabled || hasFieldErrors;
  const canSubmit = Boolean(summary.input) && !blocked;
  const dockSummary = !desktop && !blocked && !overLimit && !review && !error;
  const dateErrorMessages = {
    required: f.requiredField,
    invalid_date: f.invalidDate,
    date_order: f.invalidDateOrder,
    expired: f.expiredDate,
  };

  useEffect(() => setSearchText(search), [search]);

  function clearSearch() {
    setSearchText("");
    onSearch("");
  }

  function changeQuantity(product: P, quantity: string) {
    if (fieldsLocked || NON_ASCII_DIGIT.test(quantity)) return;
    if (
      quantityMax !== undefined &&
      parsePositiveInteger(quantity, { max: quantityMax }).error === "integer_range"
    ) {
      rejectQuantityEdit(product, "integer_range");
      return;
    }
    const key = product.product_id;
    const items = { ...draft.items };
    const entry = items[key];
    if (quantity === "") delete items[key];
    else items[key] = { product: entry?.quantity ? entry.product : product, quantity };
    onDraftChange({ ...draft, items });
  }

  function rejectQuantityEdit(product: P, reason: true | "integer_range" = true) {
    if (fieldsLocked) return;
    const key = product.product_id;
    const entry = draft.items[key];
    if (entry?.rejectedEdit === reason) return;
    onDraftChange({
      ...draft,
      items: {
        ...draft.items,
        [key]: {
          product: entry?.product ?? product,
          quantity: entry?.quantity ?? "",
          rejectedEdit: reason,
        },
      },
    });
  }

  function saleUnit(product: FarmSupplyProduct) {
    return `${formatDecimalInput(product.unit_size)} ${farmSupplyProductUnit(product, locale)}`;
  }

  function quantityError(productId: string) {
    const rejectedEdit = draft.items[productId]?.rejectedEdit;
    if (rejectedEdit === true) return c.digitsOnly;
    const code = rejectedEdit ?? entries.get(productId)?.quantityError;
    return code
      ? numericInputErrorMessage(code, t.common.numericInput, quantityMax)
      : errors?.items?.[productId];
  }

  const initialLoading = loading && !products;
  const productRows = products?.length
    ? products.map((row) => {
        const key = row.product_id;
        const entry = entries.get(key);
        const product = entry?.product ?? row;
        const name = farmSupplyProductName(product, locale);
        const available = remaining ? number.format(remaining(row)) : undefined;
        const total = entry?.total ?? "—";
        const unit = saleUnit(product);
        const productInfo = (
          <Stack gap={4} miw={0} className={styles.wrap}>
            <Text size="md" fw={600} c="var(--primary)">
              {name}
            </Text>
            <Text size="sm" c="dimmed">
              {!showSaleUnitColumn ? `${product.sku} · ${unit}` : product.sku}
            </Text>
          </Stack>
        );
        const quantityInput = (
          <TextInput
            id={`${id}-quantity-${key}`}
            aria-label={`${quantityTitle} — ${name}`}
            form={formId}
            type="text"
            inputMode="numeric"
            size={showSaleUnitColumn ? "xs" : undefined}
            maw={showSaleUnitColumn ? "6rem" : undefined}
            disabled={fieldsLocked}
            value={entry?.quantity ?? ""}
            error={quantityError(key)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              const data = event.nativeEvent instanceof InputEvent ? event.nativeEvent.data : null;
              if ((data && NON_ASCII_DIGIT.test(data)) || NON_ASCII_DIGIT.test(value)) {
                rejectQuantityEdit(row);
              } else {
                changeQuantity(row, value);
              }
            }}
            onKeyDown={(event) => {
              if (
                entry?.quantity === "" &&
                draft.items[key]?.rejectedEdit &&
                (event.key === "Backspace" || event.key === "Delete")
              ) {
                changeQuantity(row, "");
              }
              if (
                event.key.length === 1 &&
                NON_ASCII_DIGIT.test(event.key) &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
              }
            }}
            onPaste={(event) => {
              // TextInput can strip line breaks before onChange. Check the whole
              // clipboard contents before any native normalization or insertion.
              const pasted = event.clipboardData.getData("text/plain");
              if (NON_ASCII_DIGIT.test(pasted)) {
                event.preventDefault();
                rejectQuantityEdit(row);
              } else if (pasted && draft.items[key]?.rejectedEdit) {
                const { value, selectionStart, selectionEnd } = event.currentTarget;
                if (pasted === value.slice(selectionStart ?? 0, selectionEnd ?? 0)) {
                  changeQuantity(row, value);
                }
              }
            }}
          />
        );

        return (
          <Table.Tr key={key}>
            <Table.Td>{productInfo}</Table.Td>
            {showSaleUnitColumn && <Table.Td>{unit}</Table.Td>}
            {showRemaining && <Table.Td ta="right">{available}</Table.Td>}
            <Table.Td>{quantityInput}</Table.Td>
            <Table.Td ta="right">{total}</Table.Td>
          </Table.Tr>
        );
      })
    : undefined;

  const saveButton = (
    <Button
      key="save"
      type="submit"
      flex={desktop ? undefined : 2}
      miw={0}
      disabled={!canSubmit}
      loading={submitting}
    >
      {submitLabel ?? c.submit}
    </Button>
  );
  const cancelButton = onCancel && (
    <Button
      key="cancel"
      type="button"
      flex={desktop ? undefined : 1}
      miw={0}
      variant="default"
      onClick={onCancel}
      disabled={cancelDisabled || submitting}
    >
      {f.cancel}
    </Button>
  );

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={showSaleUnitColumn ? 560 : showRemaining ? 540 : 460}
      role="region"
      aria-label={f.productColumn}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
    >
      <Table
        aria-label={f.products}
        aria-busy={refreshing || undefined}
        classNames={{ td: styles.wrap, th: styles.wrap }}
        layout="fixed"
        withRowBorders
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{f.productColumn}</Table.Th>
            {showSaleUnitColumn && (
              <Table.Th scope="col" w="clamp(5rem, 16%, 8rem)">
                {c.saleUnit}
              </Table.Th>
            )}
            {showRemaining && (
              <Table.Th scope="col" ta="right" w="5.5rem">
                {c.available}
              </Table.Th>
            )}
            <Table.Th
              scope="col"
              w={showSaleUnitColumn ? "10rem" : "9rem"}
              className={showSaleUnitColumn ? styles.quantityHeading : undefined}
            >
              {quantityTitle}
            </Table.Th>
            <Table.Th
              scope="col"
              ta="right"
              w={showSaleUnitColumn ? "clamp(6.5rem, 18%, 9rem)" : "7rem"}
            >
              {c.converted}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading ? (
            <TableSkeletonRows
              columns={3 + Number(showSaleUnitColumn) + Number(showRemaining)}
              height={36}
              alignments={[
                undefined,
                ...(showSaleUnitColumn ? [undefined] : []),
                ...(showRemaining ? ["right" as const] : []),
                undefined,
                "right",
              ]}
            />
          ) : (
            productRows
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Box ref={layoutRef} miw={0}>
      <Grid columns={10} gutter="md" className={styles.layout}>
        <Grid.Col span={desktop ? 7 : 10} miw={0}>
          <Stack gap="md" className={styles.entry}>
            <Paper component="section" aria-labelledby={datesId} p="md" miw={0}>
              <Stack gap="sm">
                <Text component="h2" id={datesId} size="md" fw={600} c="var(--heading)">
                  {c.period}
                </Text>
                <SimpleGrid type="container" cols={{ base: 1, "19rem": 2 }} spacing="sm">
                  {(["start_date", "end_date"] as const).map((field) => {
                    const start = field === "start_date";
                    const code = summary.dateErrors[field];
                    return (
                      <FormField
                        key={field}
                        label={start ? f.startDate : f.endDate}
                        error={errors?.[field] ?? (code ? dateErrorMessages[code] : undefined)}
                      >
                        <AdminDateInput
                          id={`${datesId}-${field}`}
                          form={formId}
                          value={draft[field]}
                          disabled={fieldsLocked}
                          pickerLabel={start ? f.openStartDatePicker : f.openEndDatePicker}
                          pickerMin={
                            !start
                              ? startDate && startDate > today
                                ? startDate
                                : today
                              : undefined
                          }
                          onValueChange={(value) => onDraftChange({ ...draft, [field]: value })}
                        />
                      </FormField>
                    );
                  })}
                </SimpleGrid>
              </Stack>
            </Paper>
            <ListToolbar
              growSearch
              refresh={
                onRetry && {
                  label: c.refresh,
                  onRefresh: onRetry,
                  loading: refreshing,
                  disabled: loading,
                }
              }
              search={{
                label: c.search,
                submitLabel: f.searchButton,
                placeholder: f.productPlaceholder,
                value: searchText,
                appliedValue: search,
                formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
                onChange: setSearchText,
                onSubmit: onSearch,
                clearLabel: c.clearSearch,
                onClear: clearSearch,
              }}
            />
            <DataListPaper component="section" aria-label={f.products}>
              {productRows && table}
              <Box p={error && !refreshing ? "md" : undefined}>
                <ListState
                  embedded
                  loadingPlaceholder={table}
                  empty={emptyLabel ?? c.empty}
                  noResults={search ? (noResultsLabel ?? c.noResults) : undefined}
                  loading={initialLoading}
                  loadingLabel={f.loadingSupply}
                  hasData={Boolean(products)}
                  isEmpty={products?.length === 0}
                  error={refreshing ? "" : error}
                  onRetry={() => onRetry?.()}
                  retryLabel={t.common.retry}
                  action={
                    search && products?.length === 0 ? (
                      <Button variant="default" onClick={clearSearch}>
                        {c.clearSearch}
                      </Button>
                    ) : undefined
                  }
                />
              </Box>
              {pagination && (
                <>
                  <Divider />
                  <Box component="footer" px="md" py="sm">
                    <Pagination
                      page={pagination.page}
                      pageSize={pagination.pageSize}
                      total={pagination.total}
                      onPage={pagination.onChange}
                      disabled={loading || refreshing}
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
          </Stack>
        </Grid.Col>

        <Grid.Col
          span={desktop ? 3 : 10}
          miw={0}
          className={styles.summaryColumn}
          data-docked={dockSummary || undefined}
        >
          <Paper
            component="section"
            aria-labelledby={summaryHeadingId}
            p="md"
            className={styles.summary}
            data-wide={desktop || undefined}
          >
            <form
              id={formId}
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit && summary.input) onSubmit(summary.input);
              }}
            >
              <Stack gap="sm">
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Title
                    order={2}
                    id={summaryHeadingId}
                    size="md"
                    fw={600}
                    miw={0}
                    className={styles.wrap}
                  >
                    {c.summary}
                  </Title>
                  {!desktop && (
                    <ActionIcon
                      type="button"
                      variant="subtle"
                      aria-label={summaryOpen ? c.hide : c.view}
                      aria-controls={summaryId}
                      aria-expanded={summaryOpen}
                      onClick={() => setSummaryOpen((open) => !open)}
                    >
                      {summaryOpen ? (
                        <IconChevronUp size={16} aria-hidden />
                      ) : (
                        <IconChevronDown size={16} aria-hidden />
                      )}
                    </ActionIcon>
                  )}
                </Group>
                <Flex
                  direction={desktop ? "column" : "row"}
                  justify="space-between"
                  align="baseline"
                  gap={desktop ? 4 : "xs"}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <Text size="md" miw={0} className={styles.wrap}>
                    {(productCount === 1 ? c.singular : c.count).replace(
                      "{count}",
                      number.format(productCount),
                    )}
                  </Text>
                  <Text
                    size="md"
                    fw={600}
                    ta={desktop ? undefined : "right"}
                    miw={0}
                    className={styles.wrap}
                  >
                    {desktop && `${c.total}: `}
                    {summary.totals.join(" · ") || "—"}
                  </Text>
                </Flex>
                <Collapse id={summaryId} in={desktop || summaryOpen}>
                  <Stack gap="sm" className={styles.summaryDetails}>
                    <Divider />
                    <Box component="dl" m={0}>
                      <RecordDetailField label={c.period}>
                        {summary.dates ? `${draft.start_date} – ${draft.end_date}` : null}
                      </RecordDetailField>
                    </Box>
                    {summary.items.length > 0 && (
                      <Stack
                        component="ul"
                        aria-label={c.summary}
                        gap="sm"
                        m={0}
                        p={0}
                        className={styles.summaryList}
                      >
                        {summary.items.map(({ product, quantity, quantityError: code, total }) => {
                          const name = farmSupplyProductName(product, locale);
                          const message = quantityError(product.product_id);
                          return (
                            <Stack component="li" key={product.product_id} gap={4}>
                              <Divider />
                              <Group justify="space-between" wrap="nowrap" gap="xs">
                                <Text size="md" fw={600} miw={0} className={styles.wrap}>
                                  {name}
                                </Text>
                                <ActionIcon
                                  type="button"
                                  variant="subtle"
                                  color="gray"
                                  disabled={fieldsLocked}
                                  aria-label={c.remove.replace("{name}", name)}
                                  onClick={() => changeQuantity(product, "")}
                                >
                                  <IconX size={16} aria-hidden />
                                </ActionIcon>
                              </Group>
                              {quantity && (
                                <Group
                                  gap="xs"
                                  justify="space-between"
                                  align="baseline"
                                  wrap="nowrap"
                                >
                                  <Text size="sm" c="dimmed" miw={0} className={styles.wrap}>
                                    {code ? quantity : number.format(Number(quantity))} ×{" "}
                                    {saleUnit(product)}
                                  </Text>
                                  <Text
                                    size="sm"
                                    fw={600}
                                    ta="right"
                                    miw={0}
                                    className={styles.wrap}
                                  >
                                    {total}
                                  </Text>
                                </Group>
                              )}
                              {message && (
                                <Text size="sm" c="danger" className={styles.wrap}>
                                  {message}
                                </Text>
                              )}
                            </Stack>
                          );
                        })}
                      </Stack>
                    )}
                  </Stack>
                </Collapse>
                {review}
                {hasProductErrors && !desktop && !summaryOpen && (
                  <Text size="sm" c="danger">
                    {c.review}
                  </Text>
                )}
                {overLimit && (
                  <Text size="sm" c="danger" role="alert">
                    {c.limitExceeded.replace("{max}", String(FARM_SUPPLY_LIMIT))}
                  </Text>
                )}
                {(desktop || summaryOpen) && <Divider />}
                <Flex direction={desktop ? "column" : "row"} gap="xs">
                  {desktop ? [saveButton, cancelButton] : [cancelButton, saveButton]}
                </Flex>
              </Stack>
            </form>
          </Paper>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
