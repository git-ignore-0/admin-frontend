"use client";

import { Box, CheckIcon, Divider, Group, Skeleton, Stack, Text, Title } from "@mantine/core";
import { useId } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { FormSelect } from "@/components/nfv-controls";
import { formatAdminDate } from "@/lib/admin-date";
import { formatStoreMoney, type inspectStoreFarmDraft } from "@/lib/store-orders";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import type { StoreOrder, StoreOrderAllocation } from "@/lib/types";
import styles from "./store-order-detail.module.css";

type FarmSelections = ReturnType<typeof inspectStoreFarmDraft>["selections"];
type FarmSelection = NonNullable<ReturnType<FarmSelections["get"]>>;

type StoreOrderProductsProps = {
  order?: StoreOrder;
  farms?: {
    selections: FarmSelections;
    onChange: (lineId: string, farmId: string) => void;
    disabled: boolean;
  };
};

function SourceSnapshot({
  allocations,
  quantityLabel,
}: {
  allocations: StoreOrderAllocation[];
  quantityLabel: string;
}) {
  const byFarm = new Map<string, StoreOrderAllocation[]>();
  for (const row of allocations) {
    const farmId = row.farm_id.toLowerCase();
    const group = byFarm.get(farmId);
    if (group) group.push(row);
    else byFarm.set(farmId, [row]);
  }

  return (
    <Stack gap="xs">
      {Array.from(byFarm, ([farmId, rows]) => (
        <Stack key={farmId} gap={4}>
          <Text size="md" fw={500}>
            {rows[0].farm_name}
          </Text>
          {rows.map((row) => (
            <Group key={row.id} justify="space-between" gap="xs" align="baseline">
              <Text size="sm" c="dimmed" miw={0}>
                {formatAdminDate(row.start_date)} – {formatAdminDate(row.end_date)}
              </Text>
              {allocations.length > 1 && (
                <Text size="sm" c="dimmed" className={styles.numeric}>
                  {quantityLabel.replace("{count}", String(row.quantity))}
                </Text>
              )}
            </Group>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

function SupplyingFarmSelect({
  selection,
  labelledBy,
  disabled,
  onChange,
}: {
  selection: FarmSelection;
  labelledBy: string;
  disabled: boolean;
  onChange: (farmId: string) => void;
}) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const options = new Map(
    selection.line.farms.map((farm) => {
      const value = farm.farm_id.toLowerCase();
      const stock = c.farmStock.replace("{count}", String(farm.available_quantity));
      return [
        value,
        {
          name: farm.farm_name,
          stock,
          data: { value, label: `${farm.farm_name} · ${stock}`, disabled: !farm.eligible },
        },
      ];
    }),
  );
  const selected = selection.value ? options.get(selection.value) : undefined;

  return (
    <FormSelect
      w="100%"
      miw={0}
      aria-labelledby={labelledBy}
      placeholder={
        selection.error === "farmUnavailable" ? c.farmUnavailableOption : c.chooseFarmPlaceholder
      }
      value={selected?.data.value ?? null}
      title={selected?.data.label}
      error={selection.error ? c[selection.error] : undefined}
      disabled={disabled}
      comboboxProps={{ withinPortal: true }}
      data={Array.from(options.values(), (option) => option.data)}
      onChange={(value) => {
        if (value && options.get(value)?.data.disabled === false) onChange(value);
      }}
      renderOption={({ option, checked }) => {
        const farm = options.get(option.value);
        if (!farm) return option.label;
        return (
          <Group gap="xs" w="100%" className={styles.wrapText}>
            {checked && <CheckIcon size="0.75em" aria-hidden />}
            <Text size="sm" flex={1} miw={0}>
              {farm.name}
            </Text>
            <Text size="sm" miw={0}>
              {farm.stock}
            </Text>
          </Group>
        );
      }}
    />
  );
}

function ProductsSkeleton() {
  return (
    <Stack component="ul" aria-hidden gap={0} m={0} p={0} className={styles.productList}>
      {[0, 1, 2].map((index) => (
        <Box component="li" key={index}>
          {index > 0 && <Divider my="xs" />}
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4} w="45%">
                <Skeleton height="var(--mantine-font-size-md)" width="80%" />
                <Skeleton height="var(--mantine-font-size-sm)" width="60%" />
              </Stack>
              <Stack gap={4} w="25%" align="flex-end">
                <Skeleton height="var(--mantine-font-size-md)" width="80%" />
                <Skeleton height="var(--mantine-font-size-sm)" />
              </Stack>
            </Group>
            <Box className={styles.source} ms="xs" ps="sm">
              <Skeleton height="var(--mantine-spacing-xl)" />
            </Box>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

export function StoreOrderProducts({ order, farms }: StoreOrderProductsProps) {
  const { locale, t } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const id = useId();
  const allocationsByLine = new Map<string, StoreOrderAllocation[]>();
  for (const row of order?.allocations ?? []) {
    const lineId = row.line_id.toLowerCase();
    const group = allocationsByLine.get(lineId);
    if (group) group.push(row);
    else allocationsByLine.set(lineId, [row]);
  }

  return (
    <DataListPaper component="section" aria-labelledby={id} p="md">
      <Stack gap="md">
        <Title id={id} order={2} size="md" fw={600}>
          {c.productsTitle}
        </Title>
        {order ? (
          <Stack component="ul" role="list" gap={0} m={0} p={0} className={styles.productList}>
            {order.lines.map((line, index) => {
              const lineId = line.id.toLowerCase();
              const productLabelId = `${id}-${lineId}`;
              const skuLabelId = `${productLabelId}-sku`;
              const farmLabelId = `${productLabelId}-farm`;
              const selection = farms?.selections.get(lineId);
              const allocations = allocationsByLine.get(lineId) ?? [];
              const hasQuota = line.quota_quantity > 0 || line.quota_units > 0;

              return (
                <Box component="li" key={line.id} aria-labelledby={productLabelId} miw={0}>
                  {index > 0 && <Divider my="xs" aria-hidden />}
                  <Stack gap="sm">
                    <Stack gap={4}>
                      <Group justify="space-between" align="flex-start" gap="xs">
                        <Stack className={styles.productIdentity} gap={4} miw={0}>
                          <Text id={productLabelId} size="md" fw={600}>
                            {line.name}
                          </Text>
                          <Text size="sm" c="dimmed">
                            <span id={skuLabelId}>{line.sku}</span> · {line.unit_size}{" "}
                            {line.unit_label}
                          </Text>
                        </Stack>
                        <Stack
                          gap={4}
                          miw={0}
                          maw="100%"
                          ms="auto"
                          ta="end"
                          className={styles.numeric}
                        >
                          <Text size="md" fw={600}>
                            {formatStoreMoney(line.cash_subtotal_vnd, locale)}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {line.quantity} × {formatStoreMoney(line.unit_price_vnd, locale)}
                          </Text>
                          {hasQuota && (
                            <Text size="sm" c="dimmed">
                              {c.cashSubtotal}
                            </Text>
                          )}
                        </Stack>
                      </Group>
                      {hasQuota && (
                        <Group gap="xs">
                          <Text size="sm" c="dimmed">
                            {c.quotaUsage
                              .replace("{quantity}", String(line.quota_quantity))
                              .replace("{units}", String(line.quota_units))}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {c.cashUsage.replace("{quantity}", String(line.cash_quantity))}
                          </Text>
                        </Group>
                      )}
                    </Stack>
                    {((farms && selection) || allocations.length > 0) && (
                      <Box
                        role="group"
                        aria-labelledby={farmLabelId}
                        className={styles.source}
                        ms="xs"
                        ps="sm"
                        miw={0}
                      >
                        <span id={farmLabelId} hidden>
                          {c.supplyingFarm}
                        </span>
                        {farms && selection ? (
                          <SupplyingFarmSelect
                            selection={selection}
                            labelledBy={`${farmLabelId} ${productLabelId} ${skuLabelId}`}
                            disabled={farms.disabled}
                            onChange={(farmId) => farms.onChange(lineId, farmId)}
                          />
                        ) : (
                          <SourceSnapshot
                            allocations={allocations}
                            quantityLabel={c.batchQuantity}
                          />
                        )}
                      </Box>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <ListState
            embedded
            loading
            loadingLabel={c.detailLoading}
            loadingPlaceholder={<ProductsSkeleton />}
            hasData={false}
            isEmpty={false}
            empty=""
            error=""
            onRetry={() => {}}
            retryLabel={t.common.retry}
          />
        )}
      </Stack>
    </DataListPaper>
  );
}
