"use client";

import { Anchor, Button, Select, Stack, Table } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import {
  csaRoundListPath,
  readRoundNavigationContext,
  roundConfigurationHref,
  roundNavigationHref,
} from "@/app/(admin)/csa-rounds/round-navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { CSARoundBreadcrumbs } from "@/components/csa-round-breadcrumbs";
import { CSARoundListResults, useCSARoundPage } from "@/components/csa-round-list-results";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { openRecordFromRow } from "@/components/record-row-navigation";
import { formatAdminDate } from "@/lib/admin-date";
import { csaConfigurationStatuses, getRoundConfigurations } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundList() {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const navigation = readRoundNavigationContext(useSearchParams());
  const { page, status, type } = navigation;
  const context = { page, status, type };
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftType, setDraftType] = useState(type);
  const fetchPage = useCallback(
    (requestedPage: number, signal: AbortSignal) =>
      getRoundConfigurations(requestedPage, 20, type || undefined, status || undefined, signal),
    [status, type],
  );
  const pageHref = useCallback(
    (next: number) => roundNavigationHref(csaRoundListPath, { page: next, status, type }),
    [status, type],
  );
  const replacePage = useCallback(
    (next: number) => window.history.replaceState(null, "", pageHref(next)),
    [pageHref],
  );
  const { error, items, loading, meta, reload } = useCSARoundPage(
    fetchPage,
    page,
    `${type}/${status}`,
    replacePage,
  );

  const filters = Number(Boolean(status)) + Number(Boolean(type));
  function resetDraftFilters() {
    setDraftStatus(status);
    setDraftType(type);
  }
  function applyFilters(nextType: typeof type, nextStatus: typeof status) {
    if (nextType === type && nextStatus === status) return;
    window.history.pushState(
      null,
      "",
      roundNavigationHref(csaRoundListPath, { type: nextType, status: nextStatus }),
    );
  }
  const columns = [
    c.configurationName,
    c.configurationTypeTitle,
    c.configurationStatus,
    c.createdAt,
  ];
  const rows = items?.map((item) => {
    return (
      <Table.Tr key={item.id} onClick={openRecordFromRow} style={{ cursor: "pointer" }}>
        <Table.Td>
          <Anchor
            component={AdminNavigationLink}
            c="inherit"
            data-record-link
            fw={600}
            href={roundConfigurationHref(context, item.id)}
            style={{ overflowWrap: "anywhere" }}
            underline="never"
          >
            {item.name}
          </Anchor>
        </Table.Td>
        <Table.Td>{item.type === "weekly" ? c.recurrence.weekly : c.standalone}</Table.Td>
        <Table.Td>
          <Status
            status={item.status}
            label={c.configurationStatuses[item.status]}
            color={
              item.status === "published"
                ? "green"
                : item.status === "cancelled"
                  ? "red"
                  : undefined
            }
          />
        </Table.Td>
        <Table.Td>
          <time dateTime={item.created_at}>{formatAdminDate(item.created_at)}</time>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Stack component="section" gap="md" miw={0}>
      <CSARoundBreadcrumbs listContext={navigation} />
      <PageHeading title={c.configurations} visuallyHiddenTitle />
      <ListToolbar
        busy={loading}
        filterPopover={{
          label: t.users.filter,
          activeCount: filters,
          onOpen: resetDraftFilters,
          onDismiss: resetDraftFilters,
          clearLabel: t.common.clearFilters,
          clearDisabled: !draftStatus && !draftType && !filters,
          onClear: () => {
            setDraftStatus("");
            setDraftType("");
            applyFilters("", "");
          },
          apply: {
            label: t.users.applyFilters,
            disabled: draftStatus === status && draftType === type,
            onApply: () => applyFilters(draftType, draftStatus),
          },
          children: (
            <Stack gap="sm">
              <Select
                label={c.configurationType}
                placeholder={c.recurrence.allTypes}
                value={draftType || null}
                onChange={(value) =>
                  setDraftType(value === "standalone" || value === "weekly" ? value : "")
                }
                data={[
                  { value: "standalone", label: c.standalone },
                  { value: "weekly", label: c.recurrence.weekly },
                ]}
                comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
                clearable
              />
              <Select
                label={c.configurationStatus}
                placeholder={c.allStatuses}
                value={draftStatus || null}
                onChange={(value) =>
                  setDraftStatus(csaConfigurationStatuses.find((status) => status === value) ?? "")
                }
                data={csaConfigurationStatuses.map((value) => ({
                  value,
                  label: c.configurationStatuses[value],
                }))}
                comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
                clearable
              />
            </Stack>
          ),
        }}
        primaryAction={
          <Button
            component={AdminNavigationLink}
            href={roundNavigationHref(`${csaRoundListPath}/new`, context)}
            leftSection={<IconPlus size={16} aria-hidden />}
          >
            {c.createConfiguration}
          </Button>
        }
        refresh={{ label: c.refresh, onRefresh: reload, loading }}
      />
      <CSARoundListResults
        title={c.configurations}
        columns={columns}
        rows={rows ?? null}
        minWidth={520}
        filtered={filters > 0}
        empty={c.emptyConfigurations}
        error={error}
        loading={loading}
        meta={meta}
        onPage={(next) => window.history.pushState(null, "", pageHref(next))}
        onRetry={reload}
      />
    </Stack>
  );
}
