"use client";

import { Anchor, Button, Divider, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { SupplyRequestProducts } from "@/components/supply-request-products";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import type { AdminLocale } from "@/lib/admin-i18n";
import { requestErrorMessage } from "@/lib/client-error";
import { farmerRequest, farmerRequests, type SupplyRequest } from "@/lib/farm-supply-request-api";
import { farmerSupplyCopy } from "@/lib/farmer-supply-copy";

type Props = {
  active: boolean;
  token: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onScopeError: (cause: unknown) => void;
};

const statusColor = { pending: "pending", approved: "success", rejected: "danger" } as const;

function RequestStatus({
  status,
  locale,
}: {
  status: SupplyRequest["status"];
  locale: AdminLocale;
}) {
  return (
    <Status
      status={status}
      label={farmerSupplyCopy[locale].statuses[status]}
      color={statusColor[status]}
    />
  );
}

function supplyPeriod(entry: SupplyRequest) {
  return `${formatAdminDate(entry.start_date)} – ${formatAdminDate(entry.end_date)}`;
}

export function FarmerSupplyHistory({ active, token, selected, onSelect, onScopeError }: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmerSupplyCopy[locale];
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ["requests", "list", page],
    queryFn: ({ signal }) =>
      farmerRequests(token, { page }, signal).catch((cause: unknown) => {
        onScopeError(cause);
        throw cause;
      }),
    enabled: active && !selected,
  });
  const detail = useQuery({
    queryKey: ["requests", "detail", selected],
    queryFn: selected
      ? ({ signal }) =>
          farmerRequest(token, selected, signal).catch((cause: unknown) => {
            onScopeError(cause);
            throw cause;
          })
      : skipToken,
    enabled: active && Boolean(selected),
  });
  const meta = history.data?.meta;
  useEffect(() => {
    if (meta) {
      const last = Math.max(1, Math.ceil(meta.total / meta.page_size));
      if (page > last) setPage(last);
    }
  }, [meta, page]);

  function loadState(query: typeof history | typeof detail, empty = "") {
    return (
      <ListState
        embedded
        empty={empty}
        error={query.error ? requestErrorMessage(query.error, t) : ""}
        hasData={Boolean(query.data)}
        isEmpty={Boolean(empty && history.data?.data.length === 0)}
        loading={query.isFetching}
        loadingLabel={c.loadingRequests}
        onRetry={() => void query.refetch()}
        retryLabel={t.common.retry}
      />
    );
  }

  if (selected) {
    const entry = detail.data;
    return (
      <Stack gap="md" aria-label={c.requestDetail}>
        <Group>
          <Button
            type="button"
            onClick={() => onSelect(null)}
            leftSection={<IconArrowLeft size={16} aria-hidden />}
            variant="default"
          >
            {c.backToHistory}
          </Button>
        </Group>
        {loadState(detail)}
        {entry && (
          <>
            <Paper withBorder p="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={2} size="md" fw={600}>
                    {entry.code}
                  </Title>
                  <RequestStatus status={entry.status} locale={locale} />
                </Group>
                <RecordDetailFields>
                  <RecordDetailField label={c.period}>{supplyPeriod(entry)}</RecordDetailField>
                  <RecordDetailField label={c.submittedAt}>
                    {formatAdminDateTime(entry.submitted_at)}
                  </RecordDetailField>
                  {entry.processed_at && (
                    <RecordDetailField label={c.processedAt}>
                      {formatAdminDateTime(entry.processed_at)}
                    </RecordDetailField>
                  )}
                  {entry.rejection_reason && (
                    <RecordDetailField label={c.rejectionReason}>
                      <Text style={{ whiteSpace: "pre-wrap" }}>{entry.rejection_reason}</Text>
                    </RecordDetailField>
                  )}
                </RecordDetailFields>
              </Stack>
            </Paper>
            <Paper withBorder p="md">
              <Stack gap="sm">
                <Title order={3} size="md" fw={600}>
                  {c.products}
                </Title>
                <SupplyRequestProducts items={entry.items} locale={locale} />
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    );
  }

  return (
    <Paper withBorder style={{ overflow: "hidden" }}>
      {loadState(history, c.noHistory)}
      {!!history.data?.data.length && (
        <Table.ScrollContainer minWidth={520}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th scope="col">{c.code}</Table.Th>
                <Table.Th scope="col">{c.period}</Table.Th>
                <Table.Th scope="col">{c.count}</Table.Th>
                <Table.Th scope="col">{c.status}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history.data.data.map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>
                    <Stack gap={4} align="flex-start">
                      <Anchor
                        component="button"
                        type="button"
                        onClick={() => onSelect(entry.id)}
                        fw={600}
                      >
                        {entry.code}
                      </Anchor>
                      <Text size="sm" c="dimmed">
                        {formatAdminDateTime(entry.submitted_at)}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>{supplyPeriod(entry)}</Table.Td>
                  <Table.Td>{entry.items.length}</Table.Td>
                  <Table.Td>
                    <RequestStatus status={entry.status} locale={locale} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {meta && (
        <>
          <Divider />
          <Stack p="md">
            <Pagination
              page={page}
              pageSize={meta.page_size}
              total={meta.total}
              onPage={setPage}
              previousLabel={t.common.previous}
              nextLabel={t.common.next}
              summary={t.common.pagination}
              resultCountLabel={t.common.resultCount}
              resultCountSingularLabel={t.common.resultCountSingular}
            />
          </Stack>
        </>
      )}
    </Paper>
  );
}
