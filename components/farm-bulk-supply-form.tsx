"use client";

import {
  ActionIcon,
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
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { AdminDateInput } from "@/components/admin-date-input";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { FormField } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { adminDictionaries, type AdminLocale } from "@/lib/admin-i18n";
import {
  FARM_BULK_SUPPLY_LIMIT,
  farmBulkProductName,
  farmBulkProductUnit,
  summarizeFarmBulkSupplyDraft,
  type FarmBulkSupplyDraft,
  type FarmBulkSupplyInput,
} from "@/lib/farm-bulk-draft";
import { farmsCopy } from "@/lib/farms-copy";
import { formatDecimalInput, numericInputErrorMessage } from "@/lib/numeric-input";
import type { FarmProduct } from "@/lib/types";

import styles from "./farm-bulk-supply-form.module.css";

const labels = {
  en: {
    entry: "Enter supply",
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
    limit: "Enter quantities for up to {max} products per save.",
    limitExceeded: "Remove products from the summary to save a maximum of {max} at a time.",
    save: "Save supply",
  },
  vi: {
    entry: "Nhập nguồn cung",
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
    limit: "Mỗi lần lưu có thể nhập tối đa {max} sản phẩm.",
    limitExceeded: "Bỏ bớt sản phẩm trong phần tổng hợp để lưu tối đa {max} sản phẩm mỗi lần.",
    save: "Lưu nguồn cung",
  },
};

type Props = {
  locale: AdminLocale;
  draft: FarmBulkSupplyDraft;
  onDraftChange: (draft: FarmBulkSupplyDraft) => void;
  products: FarmProduct[] | undefined;
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
  onSubmit: (input: FarmBulkSupplyInput) => void;
  onCancel: () => void;
};

export function FarmSupplyForm({
  locale,
  draft,
  onDraftChange,
  products,
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
}: Props) {
  const id = useId();
  const datesId = `${id}-dates`;
  const summaryId = `${id}-summary`;
  const formId = `${id}-supply`;
  const [searchText, setSearchText] = useState(search);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const { breakpoints } = useMantineTheme();
  const desktop = useMediaQuery(`(min-width: ${breakpoints.lg})`);
  const c = labels[locale];
  const f = farmsCopy(locale);
  const t = adminDictionaries[locale];
  const number = new Intl.NumberFormat(locale);
  const summary = summarizeFarmBulkSupplyDraft(draft, locale);
  const entries = new Map(summary.items.map((item) => [item.product.product_id, item]));
  const overLimit = summary.items.length > FARM_BULK_SUPPLY_LIMIT;
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

  function changeQuantity(product: FarmProduct, quantity: string) {
    if (fieldsLocked) return;
    const key = product.product_id;
    const items = { ...draft.items };
    if (quantity === "") delete items[key];
    else items[key] = { product: items[key]?.product ?? product, quantity };
    onDraftChange({ ...draft, items });
  }

  function saleUnit(product: FarmProduct) {
    return `${formatDecimalInput(product.unit_size)} ${farmBulkProductUnit(product, locale)}`;
  }

  function quantityError(productId: string) {
    const code = entries.get(productId)?.quantityError;
    return code
      ? numericInputErrorMessage(code, t.common.numericInput)
      : errors?.items?.[productId];
  }

  return (
    <Grid gutter="md" className={styles.layout}>
      <Grid.Col span={{ base: 12, lg: 8 }} miw={0}>
        <Paper p="md" className={styles.entry}>
          <Stack gap="md">
            <Title order={2}>{c.entry}</Title>
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
                      onValueChange={(value) => onDraftChange({ ...draft, [field]: value })}
                    />
                  </FormField>
                );
              })}
            </SimpleGrid>
            <ListToolbar
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
                onClear: () => {
                  setSearchText("");
                  onSearch("");
                },
              }}
            />
            {Boolean(products?.length) && (
              <Table
                aria-label={f.products}
                aria-busy={refreshing || undefined}
                classNames={{
                  thead: styles.tableHeader,
                  tr: styles.tableRow,
                  td: styles.cell,
                }}
                role="table"
              >
                <Table.Thead>
                  <Table.Tr role="row">
                    <Table.Th scope="col">{f.productColumn}</Table.Th>
                    <Table.Th scope="col">{c.available}</Table.Th>
                    <Table.Th scope="col">{c.quantity}</Table.Th>
                    <Table.Th scope="col">{c.converted}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody role="rowgroup">
                  {products?.map((row) => {
                    const entry = entries.get(row.product_id);
                    const product = entry?.product ?? row;
                    const name = farmBulkProductName(product, locale);
                    const remaining = number.format(row.available_quantity);
                    const message = quantityError(product.product_id);
                    return (
                      <Table.Tr key={row.product_id} role="row">
                        <Table.Td role="cell" className={styles.productCell}>
                          <Text fw={600}>{name}</Text>
                          <Text size="sm" c="dimmed">
                            {product.sku} · {saleUnit(product)}
                            <span className={styles.compactStock}>
                              {" "}
                              · {c.available} {remaining}
                            </span>
                          </Text>
                        </Table.Td>
                        <Table.Td role="cell" className={styles.stockCell}>
                          {remaining}
                        </Table.Td>
                        <Table.Td role="cell" className={styles.quantityCell}>
                          <TextInput
                            aria-label={`${c.quantity} — ${name}`}
                            form={formId}
                            type="text"
                            inputMode="numeric"
                            disabled={fieldsLocked}
                            value={entry?.quantity ?? ""}
                            error={message}
                            onChange={(event) => changeQuantity(row, event.currentTarget.value)}
                          />
                        </Table.Td>
                        <Table.Td role="cell" className={styles.convertedCell}>
                          <Text size="sm">{entry?.total ?? "—"}</Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
            <ListState
              embedded
              empty={c.empty}
              noResults={search ? c.noResults : undefined}
              loading={loading || refreshing}
              loadingLabel={f.loadingSupply}
              hasData={Boolean(products)}
              isEmpty={products?.length === 0}
              error={error}
              onRetry={() => onRetry?.()}
              retryLabel={t.common.retry}
            />
            {pagination && (
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
            )}
          </Stack>
        </Paper>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 4 }} miw={0} className={styles.summaryColumn}>
        <Paper p="md" className={styles.summary}>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit && summary.input) onSubmit(summary.input);
            }}
          >
            <Stack gap="md" className={styles.summaryContent}>
              <Title order={2}>{c.summary}</Title>
              <Group justify="space-between" gap="xs" align="flex-start">
                <Stack gap={0}>
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
                <Button
                  hiddenFrom="lg"
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
                      className={styles.summaryItems}
                    >
                      {summary.items.map(({ product, quantity, quantityError: code, total }) => {
                        const name = farmBulkProductName(product, locale);
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
                              <Stack gap={0} miw={0}>
                                <Text size="sm" fw={600} className={styles.wrap}>
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
                  String(FARM_BULK_SUPPLY_LIMIT),
                )}
              </Text>
              <Group className={styles.actions} gap="xs" wrap="nowrap">
                <Button
                  type="button"
                  variant="default"
                  onClick={onCancel}
                  disabled={cancelDisabled || submitting}
                >
                  {f.cancel}
                </Button>
                <Button type="submit" disabled={!canSubmit} loading={submitting}>
                  {c.save}
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Grid.Col>
    </Grid>
  );
}
