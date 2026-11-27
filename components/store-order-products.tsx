"use client";

import { Group, Stack, Table, Text } from "@mantine/core";
import { Fragment, useId } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { StoreOrderAllocationEditor } from "@/components/store-order-allocation-editor";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { formatAdminDate } from "@/lib/admin-date";
import {
  formatStoreMoney,
  inspectStoreAllocations,
  parseStoreQuantity,
  type StoreOrderAllocationInput,
} from "@/lib/store-orders";
import { storeOrdersCopy, storeRestockUnavailableReason } from "@/lib/store-orders-copy";
import type { StoreOrder } from "@/lib/types";

type StoreOrderProductsProps =
  | {
      order: StoreOrder;
      allocation?: {
        value: StoreOrderAllocationInput[];
        onChange: (rows: StoreOrderAllocationInput[]) => void;
        disabled: boolean;
      };
    }
  | { order?: undefined; allocation?: never };

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

  return (
    <Stack gap="sm">
      {rows.map((row) => (
        <Group key={row.id} justify="space-between" align="flex-start" gap="sm">
          <Stack gap={4} miw={0}>
            <Text fw={600}>{row.farm_name}</Text>
            <Text size="sm" c="dimmed">
              {formatAdminDate(row.start_date)} – {formatAdminDate(row.end_date)}
            </Text>
          </Stack>
          <Stack gap={4} miw={0}>
            <Text fw={600}>
              {c.allocatedQuantity} {row.quantity}
            </Text>
            <Text size="sm" c="dimmed">
              {c.restockLedger
                .replace("{restocked}", String(row.restocked_quantity))
                .replace("{remaining}", String(row.restock_remaining_quantity))}
            </Text>
            {!row.restock_eligible &&
              (row.restock_unavailable_reason ||
                (order.status === "cancelled" && row.restock_remaining_quantity > 0)) && (
                <Text size="sm" c="dimmed">
                  {storeRestockUnavailableReason(row.restock_unavailable_reason, locale)}
                </Text>
              )}
          </Stack>
        </Group>
      ))}
    </Stack>
  );
}

export function StoreOrderProducts({ order, allocation }: StoreOrderProductsProps) {
  const { locale, t } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const id = useId();
  const allocationReview =
    order && allocation
      ? inspectStoreAllocations(
          order,
          allocation.value.map((row) => ({
            line_id: row.line_id,
            batch_id: row.batch_id,
            quantity: parseStoreQuantity(row.quantity, 1) ?? 0,
          })),
        )
      : null;

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={520}
      role="region"
      aria-label={allocation ? c.allocationTitle : c.productsSources}
      aria-hidden={!order || undefined}
      tabIndex={order ? 0 : undefined}
    >
      <Table
        aria-label={c.productsSources}
        styles={{ td: { verticalAlign: "top" } }}
        withRowBorders
      >
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
              const productLabelId = `${id}-${line.id}`;
              const hasQuota = line.quota_quantity > 0 || line.quota_units > 0;
              return (
                <Fragment key={line.id}>
                  <Table.Tr>
                    <Table.Td style={longText}>
                      <Stack gap={4}>
                        <Text id={productLabelId} fw={600}>
                          {line.name}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {line.sku}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {line.unit_size} {line.unit_label}
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
                  <Table.Tr>
                    <Table.Td colSpan={4} style={longText}>
                      {allocation && allocationReview ? (
                        <StoreOrderAllocationEditor
                          order={order}
                          line={line}
                          productLabelId={productLabelId}
                          {...allocation}
                          review={allocationReview}
                        />
                      ) : (
                        <SourceSnapshot order={order} lineId={line.id} />
                      )}
                    </Table.Td>
                  </Table.Tr>
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
          {c.productsSources}
        </Text>
        {allocation && (
          <Text size="sm" c="dimmed">
            {c.allocationHint}
          </Text>
        )}
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
