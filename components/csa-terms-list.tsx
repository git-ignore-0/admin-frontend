"use client";

import {
  Anchor,
  Box,
  Button,
  Divider,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ListState } from "@/components/list-state";
import { ListResultSummary, ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { openRecordFromRow } from "@/components/record-row-navigation";
import { formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { parseCSATermsDocuments, type CSATermsStatus } from "@/lib/csa-terms";

const statuses = ["draft", "published", "archived"] as const;

export function CSATermsList() {
  const { locale, t } = useAdminI18n();
  const copy = t.csaTerms;
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [draftStatus, setDraftStatus] = useState<CSATermsStatus | "">("");
  const [status, setStatus] = useState<CSATermsStatus | "">("");
  const list = useQuery({
    queryKey: ["csa-terms", "list"],
    queryFn: async ({ signal }) =>
      parseCSATermsDocuments(await api<unknown>("admin/csa-terms", { signal })),
  });
  const error = list.error ? requestErrorMessage(list.error, t) : "";
  const initialLoading = list.isPending && !error;
  const query = search.toLowerCase();
  const items = error
    ? undefined
    : list.data?.filter(
        (item) =>
          (!status || item.status === status) &&
          (!query ||
            [item.version, item.titles.vi, item.titles.en].some((value) =>
              value.toLowerCase().includes(query),
            )),
      );
  const labels = [copy.version, copy.status, copy.updatedAt];

  async function refresh() {
    await list.refetch({ cancelRefetch: false });
  }

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={480}
      role="region"
      aria-label={copy.title}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
      style={{ outlineOffset: -2 }}
    >
      <Table aria-label={copy.title} aria-busy={list.isFetching || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            {labels.map((label) => (
              <Table.Th key={label} scope="col">
                {label}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading
            ? Array.from({ length: 5 }, (_, row) => (
                <Table.Tr key={row}>
                  {labels.map((label) => (
                    <Table.Td key={label}>
                      <Skeleton height={16} width="72%" />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            : items?.map((item) => (
                <Table.Tr key={item.id} onClick={openRecordFromRow} style={{ cursor: "pointer" }}>
                  <Table.Td>
                    <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                      <Anchor
                        component={AdminNavigationLink}
                        href={`/csa-terms/${encodeURIComponent(item.id)}`}
                        data-record-link
                        c="inherit"
                        fw={600}
                        underline="never"
                      >
                        {item.version}
                      </Anchor>
                      {item.titles[locale] && (
                        <Text size="sm" c="dimmed">
                          {item.titles[locale]}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Status
                      domain="csa-terms"
                      status={item.status}
                      label={copy.statuses[item.status]}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text component="time" size="sm" dateTime={item.updatedAt}>
                      {formatAdminDateTime(item.updatedAt)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack gap="md" miw={0}>
      <PageHeading title={copy.title} visuallyHiddenTitle bottomSpacing={0} />
      <ListToolbar
        busy={list.isFetching}
        search={{
          label: copy.searchLabel,
          placeholder: copy.searchPlaceholder,
          value: draftSearch,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setDraftSearch,
          onSubmit: (value) => setSearch(value.trim()),
          submitLabel: t.users.search,
          clearLabel: t.common.clearFilters,
          onClear: () => {
            setDraftSearch("");
            setSearch("");
          },
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: Number(Boolean(status)),
          onOpen: () => setDraftStatus(status),
          onDismiss: () => setDraftStatus(status),
          clearLabel: t.common.clearFilters,
          clearDisabled: !status && !draftStatus,
          onClear: () => {
            setStatus("");
            setDraftStatus("");
          },
          apply: {
            label: t.users.applyFilters,
            disabled: draftStatus === status,
            onApply: () => setStatus(draftStatus),
          },
          children: (
            <Select
              label={copy.status}
              placeholder={copy.allStatuses}
              value={draftStatus || null}
              onChange={(value) => setDraftStatus(statuses.find((entry) => entry === value) ?? "")}
              data={statuses.map((value) => ({ value, label: copy.statuses[value] }))}
              comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
              clearable
            />
          ),
        }}
        refresh={{ label: copy.refresh, onRefresh: refresh }}
        primaryAction={
          <Button
            component={AdminNavigationLink}
            href="/csa-terms/new"
            leftSection={<IconPlus size={16} aria-hidden />}
          >
            {copy.create}
          </Button>
        }
      />
      <Paper component="section" miw={0} style={{ overflow: "hidden" }}>
        {Boolean(items?.length) && table}
        <Box p={error ? "md" : undefined}>
          <ListState
            embedded
            empty={copy.empty}
            noResults={search || status ? copy.noMatches : undefined}
            error={error}
            hasData={items !== undefined}
            isEmpty={items?.length === 0}
            loading={initialLoading}
            loadingLabel={copy.loading}
            loadingPlaceholder={table}
            onRetry={refresh}
            retryLabel={t.common.retry}
          />
        </Box>
        {items && (
          <>
            <Divider />
            <Box px="md" py="sm">
              <ListResultSummary
                count={items.length}
                label={t.common.resultCount}
                singularLabel={t.common.resultCountSingular}
              />
            </Box>
          </>
        )}
      </Paper>
    </Stack>
  );
}
