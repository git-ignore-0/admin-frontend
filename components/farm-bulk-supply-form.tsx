"use client";

import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  Divider,
  Grid,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { AdminDateInput } from "@/components/admin-date-input";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { FormField } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
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
import { formatDecimalInput, numericInputErrorMessage } from "@/lib/numeric-input";

import styles from "./farm-bulk-supply-form.module.css";

const labels = {
  en: {
    summary: "Supply summary",
    period: "Supply period",
    search: "Search products",
    clearSearch: "Clear search",
    empty: "This farm has no products eligible for additional supply.",
    noResults: "No eligible products match your search.",
    available: "Remaining",
    quantity: "Additional quantity",
    converted: "Converted quantity",
    remove: "Remove {name}",
    count: "{count} products entered",
    singular: "{count} product entered",
    total: "Total",
    view: "View details",
    hide: "Hide details",
    review: "Check the products highlighted in the summary.",
    limit: "Enter quantities for up to {max} products.",
    limitExceeded: "Remove products from the summary to keep at most {max}.",
    submit: "Submit",
    refresh: "Refresh products",
  },
  vi: {
    summary: "Tổng hợp nguồn cung",
    period: "Thời gian cung cấp",
    search: "Tìm sản phẩm",
    clearSearch: "Xóa tìm kiếm",
    empty: "Trang trại chưa có sản phẩm đủ điều kiện bổ sung nguồn cung.",
    noResults: "Không tìm thấy sản phẩm đủ điều kiện khớp với tìm kiếm.",
    available: "Còn lại",
    quantity: "Số lượng bổ sung",
    converted: "Quy đổi",
    remove: "Bỏ {name}",
    count: "Đã nhập {count} sản phẩm",
    singular: "Đã nhập {count} sản phẩm",
    total: "Tổng",
    view: "Xem chi tiết",
    hide: "Thu gọn chi tiết",
    review: "Kiểm tra các sản phẩm có lỗi trong phần tổng hợp.",
    limit: "Có thể nhập tối đa {max} sản phẩm.",
    limitExceeded: "Bỏ bớt sản phẩm trong phần tổng hợp để còn tối đa {max}.",
    submit: "Xác nhận",
    refresh: "Làm mới danh sách sản phẩm",
  },
};

type Props<P extends FarmSupplyProduct> = {
  locale: AdminLocale;
  draft: FarmSupplyDraft<P>;
  onDraftChange: (draft: FarmSupplyDraft<P>) => void;
  products: P[] | undefined;
  remaining?: (product: P) => number;
  submitLabel?: string;
  quantityLabel?: string;
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
  submitLabel,
  quantityLabel,
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
  // At 880px, the entry table and summary have room to sit side by side.
  const desktop = contentWidth >= 880;
  const c = labels[locale];
  const f = farmsCopy(locale);
  const t = adminDictionaries[locale];
  const number = new Intl.NumberFormat(locale);
  const today = adminTodayIso();
  const startDate = adminDateInputToIso(draft.start_date);
  const summary = summarizeFarmSupplyDraft(draft, locale, today);
  const quantityTitle = quantityLabel ?? c.quantity;
  const entries = new Map(summary.items.map((item) => [item.product.product_id, item]));
  const overLimit = summary.items.length > FARM_SUPPLY_LIMIT;
  const hasProductErrors = summary.items.some(
    ({ product, quantityError }) => quantityError || errors?.items?.[product.product_id],
  );
  const fieldsLocked = locked || submitting;
  const canSubmit =
    Boolean(summary.input) &&
    !fieldsLocked &&
    !submitDisabled &&
    !errors?.start_date &&
    !errors?.end_date &&
    !hasProductErrors;
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
    if (fieldsLocked) return;
    const key = product.product_id;
    const items = { ...draft.items };
    if (quantity === "") delete items[key];
    else items[key] = { product: items[key]?.product ?? product, quantity };
    onDraftChange({ ...draft, items });
  }

  function saleUnit(product: FarmSupplyProduct) {
    return `${formatDecimalInput(product.unit_size)} ${farmSupplyProductUnit(product, locale)}`;
  }

  function quantityError(productId: string) {
    const code = entries.get(productId)?.quantityError;
    return code
      ? numericInputErrorMessage(code, t.common.numericInput)
      : errors?.items?.[productId];
  }

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
            <Paper component="section" aria-label={f.products} miw={0} className={styles.dataList}>
              {Boolean(products?.length) && (
                <Table.ScrollContainer type="native" minWidth={0}>
                  <Table
                    aria-label={f.products}
                    aria-busy={refreshing || undefined}
                    layout="fixed"
                    classNames={{ td: styles.wrap, th: styles.wrap }}
                    withRowBorders
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th scope="col">{f.productColumn}</Table.Th>
                        <Table.Th scope="col" w="36%">
                          {quantityTitle}
                        </Table.Th>
                        <Table.Th scope="col" ta="right" w="23%">
                          {c.converted}
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {products?.map((row) => {
                        const entry = entries.get(row.product_id);
                        const product = entry?.product ?? row;
                        const name = farmSupplyProductName(product, locale);
                        const available = remaining?.(row);
                        const message = quantityError(product.product_id);
                        return (
                          <Table.Tr key={row.product_id}>
                            <Table.Td>
                              <Stack gap={4} miw={0}>
                                <Text size="md" fw={600}>
                                  {name}
                                </Text>
                                <Text size="sm" c="dimmed">
                                  {product.sku} · {saleUnit(product)}
                                  {available !== undefined &&
                                    ` · ${c.available} ${number.format(available)}`}
                                </Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <TextInput
                                aria-label={`${quantityTitle} — ${name}`}
                                form={formId}
                                type="text"
                                inputMode="numeric"
                                disabled={fieldsLocked}
                                value={entry?.quantity ?? ""}
                                error={message}
                                onChange={(event) => changeQuantity(row, event.currentTarget.value)}
                                onPaste={(event) => {
                                  const text = event.clipboardData.getData("text/plain");
                                  if (!/\D/.test(text)) return;
                                  // A text input can silently remove line breaks from a paste.
                                  // Validate the original replacement before the browser changes it.
                                  event.preventDefault();
                                  const { value, selectionStart, selectionEnd } =
                                    event.currentTarget;
                                  changeQuantity(
                                    row,
                                    value.slice(0, selectionStart ?? 0) +
                                      text +
                                      value.slice(selectionEnd ?? value.length),
                                  );
                                }}
                              />
                            </Table.Td>
                            <Table.Td ta="right">{entry?.total ?? "—"}</Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
              <Box p={error || (refreshing && Boolean(products?.length)) ? "md" : undefined}>
                <ListState
                  embedded
                  empty={emptyLabel ?? c.empty}
                  noResults={search ? (noResultsLabel ?? c.noResults) : undefined}
                  loading={loading || refreshing}
                  loadingLabel={f.loadingSupply}
                  hasData={Boolean(products)}
                  isEmpty={products?.length === 0}
                  error={error}
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
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col
          span={desktop ? 3 : 10}
          miw={0}
          className={styles.summaryColumn}
          data-docked={!review || undefined}
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
                <Text component="h2" id={summaryHeadingId} size="md" fw={600} c="var(--heading)">
                  {c.summary}
                </Text>
                <Group justify="space-between" gap="xs" align="flex-start">
                  <Stack gap={4} miw={0}>
                    <Text size="sm" fw={600} aria-live="polite" aria-atomic="true">
                      {(summary.items.length === 1 ? c.singular : c.count).replace(
                        "{count}",
                        number.format(summary.items.length),
                      )}
                    </Text>
                    {summary.totals.length > 0 && (
                      <Text size="sm" fw={600} className={styles.wrap}>
                        {c.total} · {summary.totals.join(" · ")}
                      </Text>
                    )}
                  </Stack>
                  {!desktop && (
                    <Button
                      type="button"
                      size="compact-sm"
                      variant="subtle"
                      aria-controls={summaryId}
                      aria-expanded={summaryOpen}
                      rightSection={
                        summaryOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />
                      }
                      onClick={() => setSummaryOpen((open) => !open)}
                    >
                      {summaryOpen ? c.hide : c.view}
                    </Button>
                  )}
                </Group>
                {hasProductErrors && !desktop && !summaryOpen && (
                  <Text size="sm" c="danger">
                    {c.review}
                  </Text>
                )}
                <Collapse id={summaryId} in={desktop || summaryOpen}>
                  <Stack gap="sm" className={styles.summaryDetails}>
                    <Stack gap={0}>
                      <Text size="sm" c="dimmed">
                        {c.period}
                      </Text>
                      <Text size="sm" fw={600}>
                        {summary.dates ? `${draft.start_date} – ${draft.end_date}` : "—"}
                      </Text>
                    </Stack>
                    {summary.items.length > 0 && (
                      <Stack
                        component="ul"
                        gap="xs"
                        aria-label={c.summary}
                        m={0}
                        p={0}
                        className={styles.summaryItems}
                      >
                        {summary.items.map(({ product, quantity, quantityError: code, total }) => {
                          const name = farmSupplyProductName(product, locale);
                          return (
                            <Stack
                              component="li"
                              key={product.product_id}
                              gap={0}
                              py="xs"
                              className={styles.summaryItem}
                            >
                              <Group
                                justify="space-between"
                                wrap="nowrap"
                                gap="xs"
                                align="flex-start"
                              >
                                <Stack gap={4} miw={0}>
                                  <Text size="md" fw={600} className={styles.wrap}>
                                    {name}
                                  </Text>
                                  <Text size="sm" c="dimmed" className={styles.wrap}>
                                    {code ? quantity : number.format(Number(quantity))} ×{" "}
                                    {saleUnit(product)}
                                  </Text>
                                </Stack>
                                <Group gap={4} justify="flex-end" wrap="nowrap">
                                  <Text size="sm" fw={600} className={styles.wrap}>
                                    {total}
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
                              </Group>
                              {quantityError(product.product_id) && (
                                <Text size="sm" c="danger" className={styles.wrap}>
                                  {quantityError(product.product_id)}
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
                <Divider />
                <Text
                  size="sm"
                  c={overLimit ? "danger" : "dimmed"}
                  role={overLimit ? "alert" : undefined}
                >
                  {(overLimit ? c.limitExceeded : c.limit).replace(
                    "{max}",
                    String(FARM_SUPPLY_LIMIT),
                  )}
                </Text>
                <Group className={styles.actions} gap="xs" wrap="nowrap">
                  {onCancel && (
                    <Button
                      type="button"
                      variant="default"
                      onClick={onCancel}
                      disabled={cancelDisabled || submitting}
                    >
                      {f.cancel}
                    </Button>
                  )}
                  <Button type="submit" disabled={!canSubmit} loading={submitting}>
                    {submitLabel ?? c.submit}
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
