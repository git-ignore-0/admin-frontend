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
  List,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { AdminDateInput } from "@/components/admin-date-input";
import { ListState } from "@/components/list-state";
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
import { formatDecimalInput, numericInputErrorMessage } from "@/lib/numeric-input";

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
    quantity: "Additional quantity",
    converted: "Converted quantity",
    remove: "Remove {name}",
    count: "{count} products",
    singular: "{count} product",
    compactCount: "{count} products entered",
    compactSingular: "{count} product entered",
    total: "Total",
    view: "View details",
    hide: "Hide details",
    review: "Check the products highlighted in the summary.",
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
    count: "{count} sản phẩm",
    singular: "{count} sản phẩm",
    compactCount: "{count} sản phẩm đã nhập",
    compactSingular: "{count} sản phẩm đã nhập",
    total: "Tổng",
    view: "Xem chi tiết",
    hide: "Thu gọn chi tiết",
    review: "Kiểm tra các sản phẩm có lỗi trong phần tổng hợp.",
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
  const focusedQuantity = useRef<HTMLInputElement>(null);
  const { ref: layoutRef, width: contentWidth } = useElementSize();
  const { ref: dataListRef, width: listWidth } = useElementSize();
  const desktop = contentWidth >= 880;
  // The table gets less room than the form when the summary sits alongside it.
  const compact = listWidth < 544; // 34 rem at the Foundation root size.
  const showRemaining = Boolean(remaining);
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

  useLayoutEffect(() => {
    const previous = focusedQuantity.current;
    if (!previous || previous.isConnected || document.activeElement !== document.body) return;
    focusedQuantity.current = null;
    // Only restore the same field across a Table/List change. Search or pagination
    // can independently remove that product from the screen.
    const next = document.getElementById(previous.id);
    if (next instanceof HTMLInputElement && !next.disabled) {
      next.focus({ preventScroll: true });
      next.setSelectionRange(previous.selectionStart, previous.selectionEnd);
    }
  }, [compact]);

  function clearSearch() {
    setSearchText("");
    onSearch("");
  }

  function changeQuantity(product: P, quantity: string) {
    if (fieldsLocked || NON_ASCII_DIGIT.test(quantity)) return;
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

  const productRows = products?.length
    ? products.map((row) => {
        const key = row.product_id;
        const entry = entries.get(key);
        const product = entry?.product ?? row;
        const name = farmSupplyProductName(product, locale);
        const available = remaining ? number.format(remaining(row)) : undefined;
        const total = entry?.total ?? "—";
        const productInfo = (
          <Stack gap={4} miw={0} className={styles.wrap}>
            <Text size="md" fw={600}>
              {name}
            </Text>
            <Text size="sm" c="dimmed">
              {product.sku} · {saleUnit(product)}
            </Text>
            {compact && available !== undefined && (
              <Text size="sm" c="dimmed">
                {c.available}: {available}
              </Text>
            )}
          </Stack>
        );
        const quantityInput = (
          <TextInput
            id={`${id}-quantity-${key}`}
            aria-label={`${quantityTitle} — ${name}`}
            form={formId}
            type="text"
            inputMode="numeric"
            disabled={fieldsLocked}
            value={entry?.quantity ?? ""}
            error={quantityError(key)}
            onChange={(event) => {
              const data = event.nativeEvent instanceof InputEvent ? event.nativeEvent.data : null;
              if (!data || !NON_ASCII_DIGIT.test(data))
                changeQuantity(row, event.currentTarget.value);
            }}
            onFocus={(event) => {
              focusedQuantity.current = event.currentTarget;
            }}
            onBlur={(event) => {
              if (event.currentTarget.isConnected) focusedQuantity.current = null;
            }}
            onKeyDown={(event) => {
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
              if (NON_ASCII_DIGIT.test(event.clipboardData.getData("text/plain")))
                event.preventDefault();
            }}
          />
        );

        return compact ? (
          <Group
            component="li"
            key={key}
            align="flex-start"
            justify="space-between"
            wrap="nowrap"
            gap="sm"
            px="md"
            py="sm"
            className={styles.compactRow}
          >
            {productInfo}
            <Stack w="40%" miw={0} gap={4} className={styles.compactQuantity}>
              {quantityInput}
              <Text size="sm" ta="right" className={styles.wrap}>
                {total}
              </Text>
            </Stack>
          </Group>
        ) : (
          <Table.Tr key={key}>
            <Table.Td>{productInfo}</Table.Td>
            {showRemaining && <Table.Td ta="right">{available}</Table.Td>}
            <Table.Td>{quantityInput}</Table.Td>
            <Table.Td ta="right">{total}</Table.Td>
          </Table.Tr>
        );
      })
    : undefined;

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
            <Paper
              ref={dataListRef}
              component="section"
              aria-label={f.products}
              miw={0}
              className={styles.dataList}
            >
              {productRows &&
                (compact ? (
                  <Stack
                    component="ul"
                    gap={0}
                    p={0}
                    m={0}
                    aria-label={f.products}
                    aria-busy={refreshing || undefined}
                    className={styles.compactList}
                  >
                    {productRows}
                  </Stack>
                ) : (
                  <Table.ScrollContainer type="native" minWidth={0}>
                    <Table
                      aria-label={f.products}
                      aria-busy={refreshing || undefined}
                      classNames={{ td: styles.wrap, th: styles.wrap }}
                      withRowBorders
                    >
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th scope="col">{f.productColumn}</Table.Th>
                          {showRemaining && (
                            <Table.Th scope="col" ta="right" w="1%" className={styles.columnLabel}>
                              {c.available}
                            </Table.Th>
                          )}
                          <Table.Th scope="col" w="28%">
                            {quantityTitle}
                          </Table.Th>
                          <Table.Th scope="col" ta="right" w="1%" className={styles.columnLabel}>
                            {c.converted}
                          </Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>{productRows}</Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                ))}
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
                {desktop ? (
                  <Title order={2} id={summaryHeadingId} size="md" fw={600}>
                    {c.summary}
                  </Title>
                ) : (
                  <>
                    <VisuallyHidden component="h2" id={summaryHeadingId}>
                      {c.summary}
                    </VisuallyHidden>
                    <Stack gap={4}>
                      <Text size="md" fw={600} aria-live="polite" aria-atomic="true">
                        {(summary.items.length === 1 ? c.compactSingular : c.compactCount).replace(
                          "{count}",
                          number.format(summary.items.length),
                        )}
                      </Text>
                      <Group justify="space-between" gap="xs" align="center" wrap="nowrap">
                        <Text size="md" fw={600} miw={0} className={styles.wrap}>
                          {summary.totals.join(" · ") || "—"}
                        </Text>
                        <Button
                          type="button"
                          size="compact-sm"
                          variant="subtle"
                          aria-controls={summaryId}
                          aria-expanded={summaryOpen}
                          rightSection={
                            summaryOpen ? (
                              <IconChevronUp size={16} />
                            ) : (
                              <IconChevronDown size={16} />
                            )
                          }
                          onClick={() => setSummaryOpen((open) => !open)}
                        >
                          {summaryOpen ? c.hide : c.view}
                        </Button>
                      </Group>
                    </Stack>
                  </>
                )}
                {hasProductErrors && !desktop && !summaryOpen && (
                  <Text size="sm" c="danger">
                    {c.review}
                  </Text>
                )}
                <Collapse id={summaryId} in={desktop || summaryOpen}>
                  <Stack gap="sm" className={styles.summaryDetails}>
                    <Box component="dl" m={0}>
                      <RecordDetailField label={c.period}>
                        {summary.dates ? `${draft.start_date} – ${draft.end_date}` : null}
                      </RecordDetailField>
                    </Box>
                    {summary.items.length > 0 && (
                      <List aria-label={c.summary} listStyleType="none" m={0} p={0}>
                        {summary.items.map(({ product, quantity, quantityError: code, total }) => {
                          const name = farmSupplyProductName(product, locale);
                          return (
                            <List.Item
                              key={product.product_id}
                              styles={{
                                itemWrapper: { width: "100%" },
                                itemLabel: { flex: 1, minWidth: 0 },
                              }}
                            >
                              <Divider />
                              <Stack gap={4} py="xs">
                                <Group justify="space-between" wrap="nowrap" gap="xs">
                                  <Text size="md" fw={600} miw={0} className={styles.wrap}>
                                    {name}
                                  </Text>
                                  <ActionIcon
                                    type="button"
                                    variant="subtle"
                                    color="gray"
                                    size="xs"
                                    disabled={fieldsLocked}
                                    aria-label={c.remove.replace("{name}", name)}
                                    onClick={() => changeQuantity(product, "")}
                                  >
                                    <IconX size={16} aria-hidden />
                                  </ActionIcon>
                                </Group>
                                <Group gap="xs" justify="space-between" align="baseline">
                                  <Text size="sm" c="dimmed" className={styles.wrap}>
                                    {code ? quantity : number.format(Number(quantity))} ×{" "}
                                    {saleUnit(product)}
                                  </Text>
                                  <Text size="sm" fw={600} ta="right" className={styles.wrap}>
                                    {total}
                                  </Text>
                                </Group>
                                {quantityError(product.product_id) && (
                                  <Text size="sm" c="danger" className={styles.wrap}>
                                    {quantityError(product.product_id)}
                                  </Text>
                                )}
                              </Stack>
                            </List.Item>
                          );
                        })}
                      </List>
                    )}
                  </Stack>
                </Collapse>
                {desktop && (
                  <Stack gap={4}>
                    <Text size="md" aria-live="polite" aria-atomic="true">
                      {(summary.items.length === 1 ? c.singular : c.count).replace(
                        "{count}",
                        number.format(summary.items.length),
                      )}
                    </Text>
                    {summary.totals.length > 0 && (
                      <Text size="md" fw={600} className={styles.wrap}>
                        {c.total}: {summary.totals.join(" · ")}
                      </Text>
                    )}
                  </Stack>
                )}
                {review}
                <Divider />
                {overLimit && (
                  <Text size="sm" c="danger" role="alert">
                    {c.limitExceeded.replace("{max}", String(FARM_SUPPLY_LIMIT))}
                  </Text>
                )}
                <Flex direction={desktop ? "column-reverse" : "row"} gap="xs">
                  {onCancel && (
                    <Button
                      type="button"
                      flex={desktop ? undefined : 1}
                      variant="default"
                      onClick={onCancel}
                      disabled={cancelDisabled || submitting}
                    >
                      {f.cancel}
                    </Button>
                  )}
                  <Button
                    type="submit"
                    flex={desktop ? undefined : 1}
                    disabled={!canSubmit}
                    loading={submitting}
                  >
                    {submitLabel ?? c.submit}
                  </Button>
                </Flex>
              </Stack>
            </form>
          </Paper>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
