"use client";

import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Select,
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
  { value: "vietnamese", label: "Vietnamese labels" },
];
const previewWidths = [
  { value: "available", label: "Available width" },
  { value: "320", label: "320 px" },
  { value: "360", label: "360 px" },
  { value: "390", label: "390 px" },
];

const statusOptions = Object.entries(recordStatuses).map(([value, label]) => ({ value, label }));

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
      "a, button, input, select, textarea, label, [role=button], [contenteditable]",
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
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
          {record.id}
        </Text>
      </Table.Td>
      <Table.Td>{record.category}</Table.Td>
      <Table.Td>
        <Badge color={record.status}>{recordStatuses[record.status]}</Badge>
      </Table.Td>
      <Table.Td>{record.location}</Table.Td>
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
  const [toolbar, setToolbar] = useState("all");
  const [width, setWidth] = useState("available");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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

  const filterCount = Number(Boolean(category)) + Number(Boolean(status));
  const matches = records.filter(
    (record) =>
      (!category || record.category === category) &&
      (!status || record.status === status) &&
      searchable(`${record.name} ${record.id} ${record.location}`).includes(searchable(query)),
  );
  const total = matches.length;
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const visible = matches.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const showData = mode === "ready" || mode === "refresh-error";
  const loadFailed = mode === "error" && !refreshing;
  const refreshFailed = mode === "refresh-error";
  const vietnamese = toolbar === "vietnamese";
  const showFilters = toolbar === "all" || vietnamese;

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
          onChange={(value) => {
            if (value) setToolbar(value);
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
      </Group>
      <Box maw={width === "available" ? undefined : Number(width)} w="100%">
        <Stack gap="md" miw={0}>
          <ListToolbar
            search={
              toolbar === "actions"
                ? undefined
                : {
                    label: vietnamese ? "Tìm kiếm bản ghi" : "Search records",
                    value: draftQuery,
                    placeholder: vietnamese
                      ? "Tìm theo tên, mã hoặc vị trí"
                      : "Search name, code or location",
                    submitLabel: vietnamese ? "Tìm kiếm" : "Search",
                    clearLabel: vietnamese ? "Xóa tìm kiếm" : "Clear search",
                    onChange: setDraftQuery,
                    onSubmit: (value) => {
                      setQuery(value.trim());
                      setPage(1);
                    },
                    onClear: () => {
                      setDraftQuery("");
                      setQuery("");
                      setPage(1);
                    },
                  }
            }
            filterPopover={
              showFilters
                ? {
                    label: vietnamese ? "Bộ lọc quan sát" : "Filters",
                    activeCount: filterCount,
                    clearLabel: vietnamese ? "Xóa bộ lọc" : "Clear filters",
                    onClear: () => {
                      setCategory(null);
                      setStatus(null);
                      setPage(1);
                    },
                    children: (
                      <>
                        <Select
                          label={vietnamese ? "Danh mục" : "Category"}
                          placeholder={vietnamese ? "Tất cả danh mục" : "All categories"}
                          data={recordCategories}
                          value={category}
                          onChange={(value) => {
                            setCategory(value);
                            setPage(1);
                          }}
                          clearable
                          comboboxProps={{ withinPortal: false }}
                        />
                        <Select
                          label={vietnamese ? "Trạng thái" : "Status"}
                          placeholder={vietnamese ? "Tất cả trạng thái" : "All statuses"}
                          data={statusOptions}
                          value={status}
                          onChange={(value) => {
                            setStatus(value);
                            setPage(1);
                          }}
                          clearable
                          comboboxProps={{ withinPortal: false }}
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

          <Paper withBorder miw={0} aria-busy={refreshing || mode === "loading"}>
            {(mode !== "ready" || refreshing || total === 0) && (
              <Box p="sm">
                <ListState
                  loading={mode === "loading" || refreshing}
                  hasData={showData && total > 0}
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
                  noResults={
                    showData && (query || filterCount) ? "No matching sample records" : undefined
                  }
                  isEmpty={mode === "empty" || (showData && total === 0)}
                  onRetry={refresh}
                  retryLabel="Retry"
                  embedded
                />
              </Box>
            )}
            {showData && total > 0 && (
              <Table.ScrollContainer
                type="native"
                minWidth={700}
                role="region"
                aria-label="Scrollable sample records"
                tabIndex={0}
              >
                <Table aria-label="Sample records" withRowBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th scope="col">Record</Table.Th>
                      <Table.Th scope="col">Code</Table.Th>
                      <Table.Th scope="col">Category</Table.Th>
                      <Table.Th scope="col">Status</Table.Th>
                      <Table.Th scope="col">Location</Table.Th>
                      <Table.Th scope="col" ta="right">
                        Flag
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {visible.map((record) => (
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
            )}
            {(showData || mode === "empty") && (
              <Box px="sm" pb="sm">
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
