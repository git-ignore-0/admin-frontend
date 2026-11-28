"use client";

import { CheckIcon, Group, Stack, Table, Text } from "@mantine/core";
import { Fragment, useId } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { FormSelect } from "@/components/nfv-controls";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { formatAdminDate } from "@/lib/admin-date";
import { formatStoreMoney, type inspectStoreFarmDraft } from "@/lib/store-orders";
import { storeOrdersCopy, storeRestockUnavailableReason } from "@/lib/store-orders-copy";
import type { StoreOrder } from "@/lib/types";
import styles from "./store-order-detail.module.css";

type StoreOrderProductsProps = {
  order?: StoreOrder;
  hideUnallocatedSources?: boolean;
  farms?: {
    selections: ReturnType<typeof inspectStoreFarmDraft>["selections"];
    onChange: (lineId: string, farmId: string) => void;
    disabled: boolean;
  };
};

const numericAlignment = { fontVariantNumeric: "tabular-nums" } as const;
const longText = { overflowWrap: "anywhere" } as const;

function SourceSnapshot({ order, lineId }: { order: StoreOrder; lineId: string }) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const rows = (order.allocations ?? []).filter((row) => row.line_id === lineId);
  if (!rows.length) {
    return (
      <Text size="sm" c="dimmed">
        {c.noAllocatedSources}
      </Text>
    );
  }

  const byFarm = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byFarm.get(row.farm_id);
    if (group) group.push(row);
    else byFarm.set(row.farm_id, [row]);
  }
  return (
    <Stack gap="sm">
      {Array.from(byFarm, ([farmId, allocations]) => (
        <Stack key={farmId} gap="xs">
          <Text fw={600}>{allocations[0].farm_name}</Text>
          {allocations.map((row) => (
            <Group key={row.id} justify="space-between" align="flex-start" gap="sm">
              <Text size="sm" c="dimmed">
                {formatAdminDate(row.start_date)} – {formatAdminDate(row.end_date)}
              </Text>
              <Stack gap={4} miw={0}>
                <Text fw={600}>
                  {c.allocatedQuantity} {row.quantity}
                </Text>
                {order.status === "cancelled" && (
                  <>
                    <Text size="sm" c="dimmed">
                      {c.restockedQuantity.replace("{count}", String(row.restocked_quantity))}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {row.restock_remaining_quantity === 0
                        ? c.fullyRestocked
                        : row.restock_eligible
                          ? c.restockableQuantity.replace(
                              "{count}",
                              String(row.restock_remaining_quantity),
                            )
                          : storeRestockUnavailableReason(row.restock_unavailable_reason, locale)}
                    </Text>
                  </>
                )}
              </Stack>
            </Group>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

export function StoreOrderProducts({
  order,
  farms,
  hideUnallocatedSources,
}: StoreOrderProductsProps) {
  const { locale, t } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const id = useId();
  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={520}
      className={styles.productsScroll}
      role="region"
      aria-label={c.productsTitle}
      aria-hidden={!order || undefined}
      tabIndex={order ? 0 : undefined}
    >
      <Table aria-label={c.productsTitle} styles={{ td: { verticalAlign: "top" } }} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{c.productsTitle}</Table.Th>
            <Table.Th scope="col" ta="right">
              {c.quantity}
            </Table.Th>
            <Table.Th scope="col" ta="right">
              {c.unitPrice}
            </Table.Th>
            <Table.Th scope="col" ta="right">
              {c.lineSubtotal}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {order ? (
            order.lines.map((line) => {
              const lineId = line.id.toLowerCase();
              const productLabelId = `${id}-${lineId}`;
              const skuLabelId = `${productLabelId}-sku`;
              const farmLabelId = `${productLabelId}-farm`;
              const selection = farms?.selections.get(lineId);
              const showSourceRow =
                !hideUnallocatedSources ||
                order.allocations?.some((row) => row.line_id === line.id);
              const options = new Map(
                selection?.line.farms.map((farm) => [farm.farm_id.toLowerCase(), farm]),
              );
              const hasQuota = line.quota_quantity > 0 || line.quota_units > 0;
              return (
                <Fragment key={line.id}>
                  <Table.Tr>
                    <Table.Td style={longText}>
                      <Stack gap={4}>
                        <Text id={productLabelId} fw={600}>
                          {line.name}
                        </Text>
                        <Text id={skuLabelId} size="sm" c="dimmed">
                          {c.productSku}: {line.sku}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {c.sellingUnit}: {line.unit_size} {line.unit_label}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td ta="right" style={numericAlignment}>
                      <Stack gap={4}>
                        <Text>{line.quantity}</Text>
                        {hasQuota && (
                          <>
                            <Text size="sm" c="dimmed">
                              {c.quotaUsage
                                .replace("{quantity}", String(line.quota_quantity))
                                .replace("{units}", String(line.quota_units))}
                            </Text>
                            <Text size="sm" c="dimmed">
                              {c.cashUsage.replace("{quantity}", String(line.cash_quantity))}
                            </Text>
                          </>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td ta="right" style={numericAlignment}>
                      {formatStoreMoney(line.unit_price_vnd, locale)}
                    </Table.Td>
                    <Table.Td ta="right" style={numericAlignment}>
                      <Stack gap={4}>
                        <Text fw={600}>{formatStoreMoney(line.cash_subtotal_vnd, locale)}</Text>
                        {hasQuota && (
                          <Text size="sm" c="dimmed">
                            {c.cashSubtotal}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                  {showSourceRow && (
                    <Table.Tr>
                      <Table.Td colSpan={4} style={longText}>
                        {farms && selection ? (
                          <FormSelect
                            className={styles.farmControl}
                            label={<span id={farmLabelId}>{c.supplyingFarm}</span>}
                            aria-labelledby={`${farmLabelId} ${productLabelId} ${skuLabelId}`}
                            placeholder={
                              selection.error === "farmUnavailable"
                                ? c.farmUnavailableOption
                                : c.chooseFarmPlaceholder
                            }
                            value={
                              selection.value && options.has(selection.value)
                                ? selection.value
                                : null
                            }
                            error={selection.error ? c[selection.error] : undefined}
                            disabled={farms.disabled}
                            comboboxProps={{ withinPortal: true }}
                            data={Array.from(options, ([value, option]) => ({
                              value,
                              label: `${option.farm_name} · ${c.farmStock.replace("{count}", String(option.available_quantity))}`,
                              disabled: !option.eligible,
                            }))}
                            onChange={(value) => {
                              if (value && options.get(value)?.eligible)
                                farms.onChange(lineId, value);
                            }}
                            renderOption={({ option, checked }) => {
                              const farm = options.get(option.value);
                              if (!farm) return option.label;
                              return (
                                <Group wrap="nowrap" gap="xs" w="100%">
                                  {checked && <CheckIcon size="0.75em" aria-hidden />}
                                  <Text size="sm" flex={1} style={longText}>
                                    {farm.farm_name}
                                  </Text>
                                  <Text size="sm">
                                    {c.farmStock.replace(
                                      "{count}",
                                      String(farm.available_quantity),
                                    )}
                                  </Text>
                                </Group>
                              );
                            }}
                          />
                        ) : (
                          <SourceSnapshot order={order} lineId={line.id} />
                        )}
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Fragment>
              );
            })
          ) : (
            <TableSkeletonRows columns={4} alignments={[undefined, "right", "right", "right"]} />
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <DataListPaper>
      <Stack gap={4} p="md">
        <Text component="h2" fw={600} c="var(--heading)">
          {c.productsTitle}
        </Text>
      </Stack>
      {order ? (
        table
      ) : (
        <ListState
          embedded
          loading
          loadingLabel={c.detailLoading}
          loadingPlaceholder={table}
          hasData={false}
          isEmpty={false}
          empty=""
          error=""
          onRetry={() => {}}
          retryLabel={t.common.retry}
        />
      )}
    </DataListPaper>
  );
}
