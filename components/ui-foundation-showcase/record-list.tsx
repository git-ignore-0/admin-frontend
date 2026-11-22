"use client";

import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconFlag, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { ListToolbar } from "@/components/list-toolbar";
import { ListState } from "@/components/list-state";
import { Pagination } from "@/components/pagination";
import {
  findSampleNavigationRecord,
  isSampleRecordSet,
  readSampleNavigationContext,
  sampleEmptyFilters,
  sampleNavigationHref,
  sampleParentHref,
  type SampleFilters,
  type SampleNavigationContext,
} from "./sample-navigation";
import { type SampleRecord, recordCategories, recordHref, recordStatuses } from "./sample-records";

const pageSize = 5;
const sampleColumns = ["Record", "Category", "Status", "Location", "Flag"];
const listModes = [
  { value: "ready", label: "Records" },
  { value: "loading", label: "Initial loading" },
  { value: "refreshing", label: "Refreshing" },
  { value: "empty", label: "Empty list" },
  { value: "no-results", label: "No results" },
  { value: "error", label: "Load error" },
  { value: "refresh-error", label: "Refresh error" },
];
const toolbarOptions = [
  { value: "all", label: "All controls" },
  { value: "search", label: "Search only" },
  { value: "actions", label: "Actions only" },
  { value: "without-filters", label: "Without filters" },
  { value: "vietnamese", label: "Vietnamese labels" },
];
const filterBehaviors = [
  { value: "deferred", label: "Deferred" },
  { value: "immediate", label: "Immediate" },
];
const previewWidths = [
  { value: "available", label: "Available width" },
  { value: "320", label: "320 px" },
  { value: "360", label: "360 px" },
  { value: "390", label: "390 px" },
];
const previewControl = { flex: "1 1 150px", miw: 0, maw: 198 };
const previewDescription =
  "This preview changes the content width. Resize the browser to test the viewport.";
const refreshingLabel = "Refreshing sample records…";

const statusOptions = Object.entries(recordStatuses).map(([value, label]) => ({ value, label }));
const nestedFilterSelect = { withinPortal: false, floatingStrategy: "fixed" } as const;

function searchable(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

function isUnmodifiedClick(event: MouseEvent) {
  return event.button === 0 && !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
}

function openFromRow(event: MouseEvent<HTMLTableRowElement>) {
  if (event.defaultPrevented || !isUnmodifiedClick(event) || !(event.target instanceof Element))
    return;
  if (
    event.target.closest(
      "a, button, input, select, textarea, label, summary, [role=button], [role=checkbox], [contenteditable]",
    )
  )
    return;
  if (window.getSelection()?.type === "Range") return;
  event.currentTarget.querySelector<HTMLAnchorElement>("[data-record-link]")?.click();
}

function SampleRecordRow({
  record,
  flagged,
  selected,
  onFlag,
  onOpen,
}: {
  record: SampleRecord;
  flagged: boolean;
  selected: boolean;
  onFlag: () => void;
  onOpen: (id: string, link: HTMLAnchorElement) => void;
}) {
  const flagLabel = `Flag ${record.id}`;
  return (
    <Table.Tr
      data-selected={selected || undefined}
      onClick={openFromRow}
      style={{ cursor: "pointer" }}
    >
      <Table.Td>
        <Stack gap="calc(var(--mantine-spacing-xs) / 2)" style={{ overflowWrap: "anywhere" }}>
          <Anchor
            href={recordHref(record.id)}
            data-record-link
            aria-current={selected || undefined}
            fw={600}
            onClick={(event) => {
              if (!event.defaultPrevented && isUnmodifiedClick(event)) {
                event.preventDefault();
                onOpen(record.id, event.currentTarget);
              }
            }}
          >
            {record.name}
          </Anchor>
          <Text size="sm" c="dimmed">
            {record.id}
          </Text>
        </Stack>
      </Table.Td>
      <Table.Td>{record.category}</Table.Td>
      <Table.Td>
        <Badge color={record.status}>{recordStatuses[record.status]}</Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
          {record.location}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Tooltip label={flagged ? "Remove flag" : "Flag record"}>
          <ActionIcon
            type="button"
            aria-label={flagLabel}
            aria-pressed={flagged}
            variant={flagged ? "light" : "subtle"}
            onClick={onFlag}
          >
            <IconFlag size={16} aria-hidden />
          </ActionIcon>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  );
}

export function SampleRecordList({
  records,
  selectedId,
  onOpen,
  onCreate,
  navigationContext,
}: {
  records: SampleRecord[];
  selectedId: string | null;
  onOpen: (id: string, link: HTMLAnchorElement) => void;
  onCreate: (trigger: HTMLButtonElement) => void;
  navigationContext?: SampleNavigationContext;
}) {
  const [mode, setMode] = useState("ready");
  const [recordSet, setRecordSet] = useState(navigationContext?.recordSet ?? "standard");
  const [toolbar, setToolbar] = useState("all");
  const [toolbarBusy, setToolbarBusy] = useState(false);
  const [toolbarRefreshPreview, setToolbarRefreshPreview] = useState(false);
  const [filterBehavior, setFilterBehavior] = useState("deferred");
  const [toolbarWidth, setToolbarWidth] = useState("available");
  const [listWidth, setListWidth] = useState("available");
  const [draftQuery, setDraftQuery] = useState(navigationContext?.query ?? "");
  const [query, setQuery] = useState(navigationContext?.query ?? "");
  const [appliedFilters, setAppliedFilters] = useState(
    navigationContext?.filters ?? sampleEmptyFilters,
  );
  const [draftFilters, setDraftFilters] = useState(
    navigationContext?.filters ?? sampleEmptyFilters,
  );
  const [page, setPage] = useState(navigationContext?.page ?? 1);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [refreshState, setRefreshState] = useState<"idle" | "pending" | "complete">("idle");
  const refreshTimeout = useRef<number | null>(null);

  useEffect(() => {
    // Browser Back may restore the original RSC payload alongside the updated history URL.
    const params = new URLSearchParams(window.location.search);
    const context = readSampleNavigationContext((key) => params.get(key));
    if (context?.tab !== "list") return;

    setRecordSet(context.recordSet);
    setDraftQuery(context.query);
    setQuery(context.query);
    setAppliedFilters(context.filters);
    setDraftFilters(context.filters);
    setPage(context.page);
  }, []);

  useEffect(
    () => () => {
      if (refreshTimeout.current !== null) window.clearTimeout(refreshTimeout.current);
    },
    [],
  );

  const refresh = () => {
    if (refreshTimeout.current !== null) return;
    setRefreshState("pending");
    refreshTimeout.current = window.setTimeout(() => {
      refreshTimeout.current = null;
      setMode("ready");
      setRefreshState("complete");
    }, 650);
  };

  const { category, status } = appliedFilters;
  const filterCount = Number(Boolean(category)) + Number(Boolean(status));
  const filtersChanged = draftFilters.category !== category || draftFilters.status !== status;
  const standardRecords = records.filter((record) => !record.extended);
  const availableRecords =
    recordSet === "many"
      ? records
      : recordSet === "single"
        ? standardRecords.slice(0, pageSize)
        : standardRecords;
  const searchTerm = searchable(query);
  const matches = availableRecords.filter(
    (record) =>
      (!category || record.category === category) &&
      (!status || record.status === status) &&
      searchable(`${record.name} ${record.id} ${record.location}`).includes(searchTerm),
  );
  const showRefreshExample = mode === "refreshing" || mode === "refresh-error";
  const listRecords = showRefreshExample && matches.length === 0 ? availableRecords : matches;
  const total = listRecords.length;
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const visible = listRecords.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const showData = mode === "ready" || showRefreshExample;
  const hasRows = showData && total > 0;
  const linkedRecord =
    mode === "ready" ? visible.find(({ id }) => findSampleNavigationRecord(id)) : undefined;
  const listContext: SampleNavigationContext = {
    tab: "list",
    query,
    filters: appliedFilters,
    page: visiblePage,
    recordSet,
  };
  const refreshPending = refreshState === "pending";
  const refreshing = refreshPending || mode === "refreshing";
  const initialLoading = mode === "loading" || (refreshPending && !showData);
  const noResults =
    mode === "no-results" || (showData && !hasRows && Boolean(query || filterCount));
  const isEmpty = mode === "empty" || noResults || (showData && !hasRows);
  const listError = refreshPending
    ? ""
    : mode === "error"
      ? "Sample records could not be loaded."
      : mode === "refresh-error"
        ? "Sample refresh failed."
        : "";
  const vietnamese = toolbar === "vietnamese";
  const showFilters = toolbar === "all" || vietnamese;
  const showActions = toolbar !== "search";
  const toolbarRefreshing = refreshPending || (showActions && toolbarRefreshPreview);
  const deferred = filterBehavior === "deferred";

  function applyFilters(filters: SampleFilters) {
    setAppliedFilters(filters);
    setDraftFilters(filters);
    if (filters.category !== category || filters.status !== status) setPage(1);
  }

  function changeFilter(key: keyof SampleFilters, value: string | null) {
    const next = { ...draftFilters, [key]: value };
    if (deferred) setDraftFilters(next);
    else applyFilters(next);
  }

  function clearSearch() {
    setDraftQuery("");
    setQuery("");
    setPage(1);
  }

  function clearListQuery() {
    clearSearch();
    applyFilters(sampleEmptyFilters);
  }

  function changeToolbar(value: string | null) {
    if (!value || value === toolbar) return;
    setToolbar(value);
    if (value === "all" || value === "vietnamese") return;

    if (value === "actions") clearListQuery();
    else applyFilters(sampleEmptyFilters);
  }

  const refreshConfirmation = refreshState === "complete" && (
    <Text size="sm" c="dimmed" role="status">
      Sample records refreshed.
    </Text>
  );

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={700}
      role="region"
      aria-label="Scrollable sample records"
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
      style={{ outlineOffset: -2 }}
    >
      <Table aria-label="Sample records" aria-busy={refreshing || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            {sampleColumns.map((label) => (
              <Table.Th key={label} scope="col" ta={label === "Flag" ? "right" : undefined}>
                {label}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading
            ? Array.from({ length: pageSize }, (_, index) => (
                <Table.Tr key={index}>
                  {sampleColumns.map((column) => (
                    <Table.Td key={column}>
                      <Skeleton height={column === "Record" ? 34 : 12} width="80%" />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            : visible.map((record) => (
                <SampleRecordRow
                  key={record.id}
                  record={record}
                  flagged={flagged.includes(record.id)}
                  selected={selectedId === record.id}
                  onFlag={() =>
                    setFlagged((current) =>
                      current.includes(record.id)
                        ? current.filter((id) => id !== record.id)
                        : [...current, record.id],
                    )
                  }
                  onOpen={onOpen}
                />
              ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <>
      <Tabs.Panel value="toolbar" pt="lg" miw={0}>
        <Stack gap="md" miw={0}>
          <Group align="flex-end" gap="sm">
            <Select
              label="Toolbar controls"
              data={toolbarOptions}
              value={toolbar}
              onChange={changeToolbar}
              {...previewControl}
            />
            <Select
              label="Filter behavior"
              data={filterBehaviors}
              value={filterBehavior}
              disabled={!showFilters}
              onChange={(value) => {
                if (!value) return;
                setDraftFilters(appliedFilters);
                setFilterBehavior(value);
              }}
              {...previewControl}
            />
            <Select
              label="Content width preview"
              data={previewWidths}
              value={toolbarWidth}
              onChange={(value) => value && setToolbarWidth(value)}
              {...previewControl}
            />
          </Group>
          <Group gap="sm">
            <Switch
              label="Active filters"
              checked={filterCount > 0}
              disabled={toolbarBusy || !showFilters}
              onChange={(event) =>
                applyFilters(
                  event.currentTarget.checked
                    ? { ...sampleEmptyFilters, status: "pending" }
                    : sampleEmptyFilters,
                )
              }
            />
            <Switch
              label="Toolbar busy"
              checked={toolbarBusy}
              onChange={(event) => setToolbarBusy(event.currentTarget.checked)}
            />
            <Switch
              label="Preview refreshing"
              checked={toolbarRefreshPreview}
              disabled={!showActions || refreshPending}
              onChange={(event) => setToolbarRefreshPreview(event.currentTarget.checked)}
            />
          </Group>
          <Text size="sm" c="dimmed">
            {previewDescription} Search and filters apply to the Data List.
          </Text>
          <Box
            component="section"
            aria-label="List toolbar"
            maw={toolbarWidth === "available" ? undefined : Number(toolbarWidth)}
            w="100%"
          >
            <ListToolbar
              busy={toolbarBusy}
              search={
                toolbar === "actions"
                  ? undefined
                  : {
                      label: vietnamese ? "Tìm kiếm bản ghi" : "Search records",
                      value: draftQuery,
                      appliedValue: query,
                      formatAppliedValue: (value) =>
                        vietnamese ? `Đang tìm theo “${value}”` : `Applied search: “${value}”`,
                      placeholder: vietnamese
                        ? "Tìm theo tên, mã hoặc vị trí"
                        : "Search name, code or location",
                      submitLabel: vietnamese ? "Tìm kiếm" : "Search",
                      clearLabel: vietnamese ? "Xóa tìm kiếm" : "Clear search",
                      onChange: setDraftQuery,
                      onSubmit: (value) => {
                        const next = value.trim();
                        setDraftQuery(next);
                        setQuery(next);
                        setPage(1);
                      },
                      onClear: clearSearch,
                    }
              }
              filterPopover={
                showFilters
                  ? {
                      label: vietnamese ? "Bộ lọc quan sát" : "Filters",
                      title: vietnamese ? "Lọc bản ghi quan sát" : "Filter sample records",
                      activeCount: filterCount,
                      clearLabel: vietnamese ? "Xóa bộ lọc" : "Clear filters",
                      clearDisabled: !filterCount && !filtersChanged,
                      onClear: () => applyFilters(sampleEmptyFilters),
                      onDismiss: () => setDraftFilters(appliedFilters),
                      apply: deferred
                        ? {
                            label: vietnamese ? "Áp dụng bộ lọc" : "Apply filters",
                            onApply: () => applyFilters(draftFilters),
                            disabled: !filtersChanged,
                          }
                        : undefined,
                      children: (
                        <>
                          <Select
                            label={vietnamese ? "Danh mục" : "Category"}
                            placeholder={vietnamese ? "Tất cả danh mục" : "All categories"}
                            data={recordCategories}
                            value={draftFilters.category}
                            onChange={(value) => changeFilter("category", value)}
                            clearable
                            comboboxProps={nestedFilterSelect}
                          />
                          <Select
                            label={vietnamese ? "Trạng thái" : "Status"}
                            placeholder={vietnamese ? "Tất cả trạng thái" : "All statuses"}
                            data={statusOptions}
                            value={draftFilters.status}
                            onChange={(value) => changeFilter("status", value)}
                            clearable
                            comboboxProps={nestedFilterSelect}
                          />
                        </>
                      ),
                    }
                  : undefined
              }
              refresh={
                showActions
                  ? {
                      label: vietnamese ? "Làm mới danh sách" : "Refresh records",
                      onRefresh: refresh,
                      loading: toolbarRefreshing,
                    }
                  : undefined
              }
              primaryAction={
                showActions ? (
                  <Button
                    disabled={toolbarBusy}
                    leftSection={<IconPlus size={16} aria-hidden />}
                    onClick={(event) => onCreate(event.currentTarget)}
                  >
                    {vietnamese ? "Thêm bản ghi quan sát" : "New record"}
                  </Button>
                ) : undefined
              }
            />
          </Box>
          {toolbarRefreshing ? (
            <Text size="sm" c="dimmed" role="status">
              {refreshingLabel}
            </Text>
          ) : (
            refreshConfirmation
          )}
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="list" pt="lg" miw={0}>
        <Stack component="section" aria-label="Sample records" gap="md" miw={0}>
          <Group align="flex-end" gap="sm">
            <Select
              label="List state"
              data={listModes}
              value={mode}
              disabled={refreshPending}
              onChange={(value) => {
                if (!value) return;
                setMode(value);
                setRefreshState("idle");
              }}
              {...previewControl}
            />
            <Select
              label="Record set"
              data={[
                { value: "standard", label: "Standard" },
                { value: "single", label: "Single page" },
                { value: "many", label: "Many pages" },
              ]}
              value={recordSet}
              onChange={(value) => {
                if (!isSampleRecordSet(value)) return;
                setRecordSet(value);
                setPage(1);
              }}
              {...previewControl}
            />
            <Select
              label="Data list width preview"
              data={previewWidths}
              value={listWidth}
              onChange={(value) => value && setListWidth(value)}
              {...previewControl}
            />
          </Group>
          <Text size="sm" c="dimmed">
            {previewDescription}
          </Text>
          {linkedRecord && (
            <Anchor
              component={Link}
              href={sampleNavigationHref(linkedRecord.id, { context: listContext })}
              onNavigate={() => {
                window.history.replaceState(
                  { nfvShowcaseTab: "list" },
                  "",
                  sampleParentHref(listContext) + window.location.hash,
                );
              }}
              size="sm"
              style={{ alignSelf: "flex-start", overflowWrap: "anywhere" }}
            >
              Open as page: {linkedRecord.name}
            </Anchor>
          )}
          <Paper
            component="section"
            aria-label="Data list"
            maw={listWidth === "available" ? undefined : Number(listWidth)}
            w="100%"
            miw={0}
            style={{ overflow: "hidden" }}
          >
            {hasRows && table}
            {(!hasRows || refreshing || listError) && (
              <Box p={listError || (refreshing && hasRows) ? "md" : undefined}>
                <ListState
                  loading={initialLoading || refreshing}
                  loadingPlaceholder={initialLoading ? table : undefined}
                  hasData={hasRows}
                  refreshingLabel={refreshingLabel}
                  loadingLabel={initialLoading ? "Loading sample records…" : refreshingLabel}
                  error={listError}
                  empty="No sample records yet"
                  noResults={noResults ? "No matching sample records" : undefined}
                  description={
                    noResults ? "Change the search or filters to see more records." : undefined
                  }
                  action={
                    noResults ? (
                      <Button
                        variant="default"
                        onClick={() => {
                          clearListQuery();
                          setMode("ready");
                        }}
                      >
                        Clear search and filters
                      </Button>
                    ) : undefined
                  }
                  isEmpty={isEmpty}
                  onRetry={refresh}
                  retryLabel="Retry"
                  embedded
                />
              </Box>
            )}
            {(showData || isEmpty) && (
              <>
                <Divider />
                <Box px="md" py="sm">
                  <Pagination
                    page={showData ? visiblePage : 1}
                    total={showData ? total : 0}
                    pageSize={pageSize}
                    onPage={setPage}
                    previousLabel="Previous page"
                    nextLabel="Next page"
                    summary="Page {page} of {pages}"
                    resultCountLabel="{count} records"
                    resultCountSingularLabel="{count} record"
                    disabled={refreshing}
                  />
                </Box>
              </>
            )}
          </Paper>
          {refreshConfirmation}
        </Stack>
      </Tabs.Panel>
    </>
  );
}
