"use client";

import { Button, Group, Select, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { formatAdminDate } from "@/lib/admin-date";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { farmsCopy } from "@/lib/farms-copy";
import { farmBatchQuery, type FarmBatchFilter } from "@/lib/farm-supply-query";
import type { FarmBatchScope, FarmProduct, FarmStockBatch, StockBatchStatus } from "@/lib/types";

type Props = {
  source: FarmProduct;
  locked: boolean;
  onAccessLost?: (cause: unknown) => void;
  onEdit: (batch: FarmStockBatch, filter: FarmBatchFilter) => void;
  onCancel: (batch: FarmStockBatch, filter: FarmBatchFilter) => void;
};

export function FarmStockBatches(props: Props) {
  return (
    <BatchList
      key={`${props.source.id}:${props.source.supply_generation}:${props.source.supply_status}`}
      {...props}
    />
  );
}

function BatchList({ source, locked, onAccessLost, onEdit, onCancel }: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const removed = source.supply_status === "removed";
  const [filter, setFilter] = useState<FarmBatchFilter>({
    scope: removed ? "history" : "current",
    page: 1,
  });
  const result = useQuery(farmBatchQuery(source, filter));
  const denied = isProtectedDataError(result.error);
  const data = result.error ? undefined : result.data;
  const lastPage = data
    ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size))
    : filter.page;

  useEffect(() => {
    if (denied) onAccessLost?.(result.error);
  }, [denied, onAccessLost, result.error]);
  useEffect(() => {
    if (lastPage < filter.page)
      setFilter((current) => ({ ...current, page: Math.min(current.page, lastPage) }));
  }, [lastPage, filter.page]);

  if (denied) return null;
  const statuses: Record<StockBatchStatus, string> = {
    upcoming: c.batchStatusUpcoming,
    active: c.batchStatusActive,
    expired: c.batchStatusExpired,
    cancelled: c.batchStatusCancelled,
  };
  const num = new Intl.NumberFormat(locale);
  const actions = !removed && filter.scope !== "history";
  return (
    <Stack gap="sm" miw={0}>
      <Group justify="space-between" gap="sm" align="end">
        <Title order={3} size="h4">
          {c.stockBatches}
        </Title>
        <Group gap="sm" align="end">
          {!removed && (
            <Select
              label={c.batchScope}
              role="combobox"
              value={filter.scope}
              allowDeselect={false}
              data={[
                { value: "current", label: c.currentBatches },
                { value: "history", label: c.historicalBatches },
                { value: "all", label: c.allBatches },
              ]}
              onChange={(value) => {
                if (value) setFilter({ ...filter, scope: value as FarmBatchScope, page: 1 });
              }}
              disabled={locked}
            />
          )}
          <Select
            label={c.batchStatus}
            role="combobox"
            value={filter.status ?? ""}
            allowDeselect={false}
            data={[
              { value: "", label: c.batchStatusAll },
              ...Object.entries(statuses).map(([value, label]) => ({ value, label })),
            ]}
            onChange={(value) =>
              setFilter({
                ...filter,
                status: (value || undefined) as StockBatchStatus | undefined,
                page: 1,
              })
            }
            disabled={locked}
          />
        </Group>
      </Group>
      {Boolean(data?.data.length) && (
        <Table.ScrollContainer
          type="native"
          minWidth={actions ? 665 : 510}
          role="region"
          aria-label={c.stockBatches}
          tabIndex={0}
        >
          <Table aria-label={c.stockBatches} aria-busy={result.isFetching || undefined}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th scope="col">{c.batchPeriod}</Table.Th>
                <Table.Th scope="col">{c.batchInitial}</Table.Th>
                <Table.Th scope="col">{c.batchBalance}</Table.Th>
                <Table.Th scope="col">{c.status}</Table.Th>
                {actions && <Table.Th scope="col">{c.moreActions}</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.data.map((batch) => {
                const editable =
                  actions &&
                  !batch.is_historical &&
                  (batch.status === "active" || batch.status === "upcoming");
                return (
                  <Table.Tr key={batch.id}>
                    <Table.Td>
                      {formatAdminDate(batch.start_date)} – {formatAdminDate(batch.end_date)}
                    </Table.Td>
                    <Table.Td>{num.format(batch.quantity_units)}</Table.Td>
                    <Table.Td>
                      {num.format(batch.remaining_quantity)}
                      {batch.net_sold_quantity > 0 && (
                        <Text size="xs" c="dimmed">
                          {c.batchSold.replace("{count}", num.format(batch.net_sold_quantity))}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Status
                        domain="farm-stock"
                        status={batch.is_historical ? "inactive" : batch.status}
                        label={batch.is_historical ? c.batchHistoryStatus : statuses[batch.status]}
                      />
                      {batch.is_historical && (
                        <Text size="xs" c="dimmed">
                          {c.batchDateStatus.replace("{status}", statuses[batch.status])}
                        </Text>
                      )}
                    </Table.Td>
                    {actions && (
                      <Table.Td>
                        {editable && (
                          <Group gap={4} wrap="wrap">
                            <Button
                              variant="subtle"
                              disabled={locked || result.isFetching}
                              onClick={() => onEdit(batch, filter)}
                            >
                              {c.editBatch}
                            </Button>
                            <Button
                              color="red"
                              variant="subtle"
                              disabled={locked || result.isFetching}
                              onClick={() => onCancel(batch, filter)}
                            >
                              {c.cancelBatch}
                            </Button>
                          </Group>
                        )}
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <ListState
        embedded
        loading={result.isPending || lastPage < filter.page}
        loadingLabel={c.loadingSupply}
        hasData={Boolean(data)}
        isEmpty={data?.data.length === 0}
        empty={
          filter.scope === "history"
            ? c.noHistoricalBatches
            : filter.scope === "current"
              ? c.noCurrentBatches
              : c.batchEmpty
        }
        error={result.error ? requestErrorMessage(result.error, t) : ""}
        onRetry={() => void result.refetch()}
        retryLabel={t.common.retry}
      />
      {data && data.meta.total > data.meta.page_size && (
        <Pagination
          page={filter.page}
          pageSize={data.meta.page_size}
          total={data.meta.total}
          disabled={locked || result.isFetching || lastPage < filter.page}
          onPage={(page) => setFilter({ ...filter, page })}
          previousLabel={t.common.previous}
          nextLabel={t.common.next}
          summary={t.common.pagination}
          resultCountLabel={t.common.resultCount}
          resultCountSingularLabel={t.common.resultCountSingular}
        />
      )}
    </Stack>
  );
}
