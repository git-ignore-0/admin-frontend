"use client";

import { Box, Table } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { Section } from "@/components/nfv-controls";
import { formatCsaQuantity, type RoundParticipants } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundDemand({
  demand,
  loading = false,
  error = "",
  onRetry = () => undefined,
}: {
  demand: RoundParticipants["demand"] | undefined;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const initialLoading = loading && demand === undefined;
  const table = (
    <Table.ScrollContainer
      minWidth={360}
      type="native"
      role="region"
      aria-label={c.demand}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
    >
      <Table aria-label={c.demand} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{c.product}</Table.Th>
            <Table.Th scope="col" ta="right">
              {c.quantity}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading ? (
            <TableSkeletonRows columns={2} alignments={[undefined, "right"]} />
          ) : (
            demand?.map((row) => (
              <Table.Tr key={row.product_id}>
                <Table.Td>{row.name}</Table.Td>
                <Table.Td ta="right">{formatCsaQuantity(row, locale)}</Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Section title={c.demand}>
      <DataListPaper>
        {Boolean(demand?.length) && table}
        <Box p={error ? "md" : undefined}>
          <ListState
            embedded
            empty={c.emptyDemand}
            error={error}
            hasData={demand !== undefined}
            isEmpty={demand?.length === 0}
            loading={initialLoading}
            loadingLabel={c.loading}
            loadingPlaceholder={table}
            onRetry={onRetry}
            retryLabel={t.common.retry}
          />
        </Box>
      </DataListPaper>
    </Section>
  );
}
