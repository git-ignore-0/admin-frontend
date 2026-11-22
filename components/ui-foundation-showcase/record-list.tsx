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
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconFlag, IconPlus } from "@tabler/icons-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { ListToolbar } from "@/components/list-toolbar";
import { ListState } from "@/components/list-state";
import { Pagination } from "@/components/pagination";
import { type SampleRecord, recordCategories, recordHref, recordStatuses } from "./sample-records";

const pageSize = 5;
const sampleColumns = ["Record", "Category", "Status", "Location", "Flag"];
const listModes = [
  { value: "ready", label: "Records" },
  { value: "loading", label: "Initial loading" },
  { value: "empty", label: "Empty list" },
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

const statusOptions = Object.entries(recordStatuses).map(([value, label]) => ({ value, label }));
const nestedFilterSelect = { withinPortal: false, floatingStrategy: "fixed" } as const;
type SampleFilters = { category: string | null; status: string | null };
const emptyFilters: SampleFilters = { category: null, status: null };

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
}: {
  records: SampleRecord[];
  selectedId: string | null;
  onOpen: (id: string, link: HTMLAnchorElement) => void;
  onCreate: (trigger: HTMLButtonElement) => void;
}) {
  const [mode, setMode] = useState("ready");
  const [recordSet, setRecordSet] = useState("standard");
  const [toolbar, setToolbar] = useState("all");
  const [filterBehavior, setFilterBehavior] = useState("deferred");
  const [width, setWidth] = useState("available");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const refreshTimeout = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (refreshTimeout.current !== null) window.clearTimeout(refreshTimeout.current);
    },
    [],
  );

  const refresh = () => {
    if (refreshTimeout.current !== null) return;
    setRefreshing(true);
    setRefreshed(false);
    if (mode === "refresh-error") setMode("ready");
    refreshTimeout.current = window.setTimeout(() => {
      refreshTimeout.current = null;
      setRefreshing(false);
      setMode("ready");
      setRefreshed(true);
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
  const matches = availableRecords.filter(
    (record) =>
      (!category || record.category === category) &&
      (!status || record.status === status) &&
      searchable(`${record.name} ${record.id} ${record.location}`).includes(searchable(query)),
  );
  const total = matches.length;
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const visible = matches.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const showData = mode === "ready" || mode === "refresh-error";
  const hasRows = showData && total > 0;
  const initialLoading = mode === "loading" || (refreshing && !showData);
  const noResults = showData && !hasRows && Boolean(query || filterCount);
  const loadFailed = mode === "error" && !refreshing;
  const refreshFailed = mode === "refresh-error";
  const vietnamese = toolbar === "vietnamese";
  const showFilters = toolbar === "all" || vietnamese;
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
    applyFilters(emptyFilters);
  }

  function changeToolbar(value: string | null) {
    if (!value || value === toolbar) return;
    setToolbar(value);
    if (value === "all" || value === "vietnamese") return;

    if (value === "actions") clearListQuery();
    else applyFilters(emptyFilters);
  }

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
    <Stack gap="md" miw={0}>
      <Group align="flex-end" gap="sm">
        <Select
          label="List state"
          data={listModes}
          value={mode}
          disabled={refreshing}
          onChange={(value) => {
            if (value) setMode(value);
            setRefreshed(false);
          }}
          flex="1 1 120px"
          miw={0}
          maw={160}
        />
        <Select
          label="Toolbar controls"
          data={toolbarOptions}
          value={toolbar}
          onChange={changeToolbar}
          flex="1 1 120px"
          miw={0}
          maw={160}
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
          flex="1 1 120px"
          miw={0}
          maw={160}
        />
        <Select
          label="Content width preview"
          data={previewWidths}
          value={width}
          onChange={(value) => {
            if (value) setWidth(value);
          }}
          flex="1 1 120px"
          miw={0}
          maw={160}
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
            if (!value) return;
            setRecordSet(value);
            setPage(1);
          }}
          flex="1 1 120px"
          miw={0}
          maw={160}
        />
      </Group>
      <Box maw={width === "available" ? undefined : Number(width)} w="100%">
        <Stack gap="md" miw={0}>
          <Box component="section" aria-label="List toolbar" id="list-toolbar">
            <ListToolbar
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
                      onClear: () => applyFilters(emptyFilters),
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
                toolbar === "search"
                  ? undefined
                  : {
                      label: vietnamese ? "Làm mới danh sách" : "Refresh records",
                      onRefresh: refresh,
                      loading: refreshing,
                    }
              }
              primaryAction={
                toolbar === "search" ? undefined : (
                  <Button
                    leftSection={<IconPlus size={16} aria-hidden />}
                    onClick={(event) => onCreate(event.currentTarget)}
                  >
                    {vietnamese ? "Thêm bản ghi quan sát" : "New record"}
                  </Button>
                )
              }
            />
          </Box>

          <Paper
            component="section"
            aria-label="Data list"
            id="data-list"
            miw={0}
            style={{ overflow: "hidden" }}
          >
            {hasRows && table}
            {(!hasRows || refreshing || refreshFailed) && (
              <Box p={loadFailed || refreshFailed || (refreshing && hasRows) ? "md" : undefined}>
                <ListState
                  loading={initialLoading || refreshing}
                  loadingPlaceholder={initialLoading ? table : undefined}
                  hasData={hasRows}
                  refreshingLabel="Refreshing sample records…"
                  loadingLabel="Loading sample records…"
                  error={
                    loadFailed
                      ? "Sample records could not be loaded."
                      : refreshFailed
                        ? "Sample refresh failed."
                        : ""
                  }
                  empty="No sample records yet"
                  noResults={noResults ? "No matching sample records" : undefined}
                  description={
                    noResults ? "Change the search or filters to see more records." : undefined
                  }
                  action={
                    noResults ? (
                      <Button variant="default" onClick={clearListQuery}>
                        Clear search and filters
                      </Button>
                    ) : undefined
                  }
                  isEmpty={mode === "empty" || (showData && !hasRows)}
                  onRetry={refresh}
                  retryLabel="Retry"
                  embedded
                />
              </Box>
            )}
            {(showData || mode === "empty") && (
              <>
                <Divider />
                <Box px="md" py="sm">
                  <Pagination
                    page={visiblePage}
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
          {refreshed && (
            <Text size="sm" c="dimmed" role="status">
              Sample records refreshed.
            </Text>
          )}
        </Stack>
      </Box>
      <Text size="sm" c="dimmed">
        Preview changes the list container only. Resize the browser to test mobile detail and
        viewport breakpoints.
      </Text>
    </Stack>
  );
}
