"use client";

import { Box, Table } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
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
  return (
    <Section title={c.demand}>
      <DataListPaper>
        {demand && demand.length > 0 && (
          <Table.ScrollContainer
            minWidth={360}
            type="native"
            role="region"
            aria-label={c.demand}
            tabIndex={0}
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
                {demand.map((row) => (
                  <Table.Tr key={row.product_id}>
                    <Table.Td>{row.name}</Table.Td>
                    <Table.Td ta="right">{formatCsaQuantity(row, locale)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <Box p={error ? "md" : undefined}>
          <ListState
            embedded
            empty={c.emptyDemand}
            error={error}
            hasData={demand !== undefined}
            isEmpty={demand?.length === 0}
            loading={loading && demand === undefined}
            loadingLabel={c.loading}
            tableColumns={2}
            onRetry={onRetry}
            retryLabel={t.common.retry}
          />
        </Box>
      </DataListPaper>
    </Section>
  );
}
