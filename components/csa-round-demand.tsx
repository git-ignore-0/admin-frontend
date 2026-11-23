"use client";

import { Table } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataState, Section } from "@/components/nfv-controls";
import { formatCsaQuantity, type RoundParticipants } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundDemand({ demand }: { demand: RoundParticipants["demand"] }) {
  const { locale } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  return (
    <Section title={c.demand}>
      {demand.length ? (
        <Table.ScrollContainer
          minWidth={360}
          type="native"
          role="region"
          aria-label={c.demand}
          tabIndex={0}
        >
          <Table withRowBorders>
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
      ) : (
        <DataState kind="empty" title={c.emptyDemand} />
      )}
    </Section>
  );
}
