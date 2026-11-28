"use client";

import { Box, Divider, Stack, Table, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import {
  CSAParticipantDeadline,
  CSARoundParticipantDrawer,
} from "@/components/csa-round-participant-drawer";
import { DataListPaper } from "@/components/data-list-paper";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { ListState } from "@/components/list-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { ListToolbar } from "@/components/list-toolbar";
import { Section, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { openRecordFromRow } from "@/components/record-row-navigation";
import type { CSARound, CSASelection, RoundParticipants } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundParticipants({
  round,
  result,
  disabled,
  loading,
  error,
  onRetry,
  refreshKey,
  reopenOpen = false,
  onPage,
  onRefresh,
  onReopen,
}: {
  round: CSARound;
  result: RoundParticipants | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  disabled: boolean;
  refreshKey: number;
  reopenOpen?: boolean;
  onPage: (page: number) => void;
  onRefresh: () => void;
  onReopen: (person: CSASelection) => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const initialLoading = loading && result === null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = result?.data.find((person) => person.id === selectedId);

  useEffect(() => {
    if (selected || !trigger.current) return;

    // A refresh can remove the open record. Return to the list if its trigger is gone.
    const frame = window.requestAnimationFrame(() => {
      const button = trigger.current;
      trigger.current = null;
      setSelectedId(null);
      const target = button?.isConnected ? button : list.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  const table = (
    <Table.ScrollContainer
      aria-label={c.participants}
      minWidth="30rem"
      role="region"
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
      type="native"
    >
      <Table aria-label={c.participants} highlightOnHover withRowBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{c.customer}</Table.Th>
            <Table.Th scope="col">{c.state}</Table.Th>
            <Table.Th scope="col" ta="end">
              {c.productLines}
            </Table.Th>
            <Table.Th scope="col">{c.participantOrder}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading ? (
            <TableSkeletonRows
              columns={4}
              height={32}
              alignments={[undefined, undefined, "right"]}
            />
          ) : (
            result?.data.map((person) => (
              <Table.Tr
                key={person.id}
                data-selected={person.id === selectedId || undefined}
                onClick={openRecordFromRow}
                style={{ cursor: "pointer" }}
              >
                <Table.Td>
                  <DataListRecordLink
                    component="button"
                    type="button"
                    ta="start"
                    aria-haspopup="dialog"
                    data-record-link
                    py="xs"
                    style={{ overflowWrap: "anywhere" }}
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      setSelectedId(person.id);
                    }}
                  >
                    {person.customer_name || c.customer}
                  </DataListRecordLink>
                </Table.Td>
                <Table.Td>
                  <Stack gap={4} align="flex-start">
                    <Status
                      domain="csa-selection"
                      status={person.state}
                      label={c.states[person.state]}
                    />
                    <CSAParticipantDeadline person={person} />
                  </Stack>
                </Table.Td>
                <Table.Td ta="end">{person.lines.length}</Table.Td>
                <Table.Td>
                  <Text size="sm" c={person.order_id ? undefined : "dimmed"}>
                    {person.order_id ? c.hasOrder : c.noOrder}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Box ref={list} tabIndex={-1}>
      <Section
        title={c.participants}
        actions={
          <ListToolbar
            refresh={{ label: c.refresh, onRefresh, disabled, loading: loading && result !== null }}
          />
        }
      >
        <DataListPaper>
          {Boolean(result?.data.length) && table}
          <Box p={error ? "md" : undefined}>
            <ListState
              embedded
              empty={c.emptyParticipants}
              error={error}
              hasData={result !== null}
              isEmpty={result?.data.length === 0}
              loading={initialLoading}
              loadingLabel={c.loading}
              loadingPlaceholder={table}
              onRetry={onRetry}
              retryLabel={t.common.retry}
            />
          </Box>
          {result && (
            <>
              <Divider />
              <Box component="footer" px="md" py="sm">
                <Pagination
                  page={result.meta.page}
                  pageSize={result.meta.page_size}
                  total={result.meta.total}
                  onPage={onPage}
                  disabled={disabled}
                  previousLabel={t.common.previous}
                  nextLabel={t.common.next}
                  summary={t.common.pagination}
                  resultCountLabel={t.common.resultCount}
                  resultCountSingularLabel={t.common.resultCountSingular}
                />
              </Box>
            </>
          )}
        </DataListPaper>
      </Section>
      {selected && (
        <CSARoundParticipantDrawer
          key={selected.id}
          person={selected}
          round={round}
          disabled={disabled}
          refreshKey={refreshKey}
          reopenOpen={reopenOpen}
          onClose={() => setSelectedId(null)}
          onReopen={onReopen}
        />
      )}
    </Box>
  );
}
