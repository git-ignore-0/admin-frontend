"use client";

import { Box, Divider, Select, Skeleton, Stack, Table, Text } from "@mantine/core";
import { useDebouncedValue, useMediaQuery } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import {
  AdminSupplyRequestDetail,
  SupplyRequestStatusBadge,
} from "@/components/admin-supply-request-detail";
import { DataListPaper } from "@/components/data-list-paper";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { openRecordFromRow } from "@/components/record-row-navigation";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
import { normalizeFarmSupplySearch } from "@/lib/farm-navigation";
import {
  farmAccess,
  farmAccessDenied,
  farmListKey,
  farmSupplyRequestListKey,
  isFarmGone,
  retireFarmAccess,
  retryFarmAccess,
  useFarmAccess,
} from "@/lib/farm-query";
import {
  adminSupplyRequests,
  supplyRequestStatuses,
  type SupplyRequestStatus,
} from "@/lib/farm-supply-request-api";
import { farmSupplyRequestCopy } from "@/lib/farm-supply-request-copy";
import { readSupplyRequestContext, supplyRequestHref } from "@/lib/farm-supply-request-navigation";
import { getFarm, listFarms } from "@/lib/farms-api";

const nestedSelect = {
  withinPortal: false,
  floatingStrategy: "fixed",
  middlewares: { size: { padding: 8 } },
  styles: { dropdown: { overflowY: "auto" } },
} as const;

export function AdminSupplyRequestList() {
  const { locale, t } = useAdminI18n();
  const copy = farmSupplyRequestCopy(locale);
  const router = useRouter();
  const params = useSearchParams();
  const context = readSupplyRequestContext(params);
  const { page, search, farm_id, status } = context;
  const client = useQueryClient();
  const current = useIsAdminQueryScopeCurrent();
  const access = useFarmAccess();
  const [filters, setFilters] = useState({ farm: farm_id, status });
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const opener = useRef<HTMLAnchorElement | null>(null);
  const listRoot = useRef<HTMLDivElement>(null);
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const query = useQuery({
    queryKey: [...farmSupplyRequestListKey, context],
    queryFn: ({ signal }) => scopedRead(signal, () => adminSupplyRequests(context, signal)),
    enabled: !access.error && current(),
  });
  const rows = access.error
    ? undefined
    : query.data?.data.filter((row) => !isFarmGone(client, row.farm.id));
  const meta = access.error ? undefined : query.data?.meta;
  const lastPage = meta ? Math.max(1, Math.ceil(meta.total / meta.page_size)) : page;
  const firstLoad = rows === undefined && !query.error && !access.error;
  const columns = [copy.code, copy.farm, copy.period, copy.count, copy.submitted, copy.status];
  const openId = !access.error ? selectedId : undefined;

  useEffect(() => {
    if (access.error) {
      setSelectedId(undefined);
      setFilters({ farm: undefined, status: undefined });
      setFilterOpen(false);
    }
  }, [access.error]);
  useEffect(() => {
    if (!query.isFetching && page > lastPage && current()) {
      router.replace(supplyRequestHref({ page: lastPage, search, status, farm_id }), {
        scroll: false,
      });
    }
  }, [page, lastPage, query.isFetching, current, router, search, status, farm_id]);
  useEffect(() => {
    if (mobile && openId) {
      router.push(supplyRequestHref({ page, search, status, farm_id }, openId));
      setSelectedId(undefined);
    }
  }, [mobile, openId, page, search, status, farm_id, router]);

  async function scopedRead<T>(signal: AbortSignal, request: () => Promise<T>) {
    const { revision } = farmAccess(client);
    try {
      const response = await request();
      signal.throwIfAborted();
      if (!current() || revision !== farmAccess(client).revision) {
        throw new DOMException("Obsolete farm data", "AbortError");
      }
      return response;
    } catch (error) {
      if (
        !signal.aborted &&
        current() &&
        revision === farmAccess(client).revision &&
        farmAccessDenied(error)
      ) {
        retireFarmAccess(client, error);
      }
      throw error;
    }
  }

  function update(next: Partial<typeof context>) {
    const href = supplyRequestHref({ ...context, ...next });
    if (href !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", href);
    }
  }

  function closeDrawer() {
    setSelectedId(undefined);
    requestAnimationFrame(() => {
      const target = opener.current;
      (target?.isConnected ? target : listRoot.current)?.focus({ preventScroll: true });
    });
  }

  function reload() {
    if (access.error) {
      retryFarmAccess(client);
      return;
    }
    return query.refetch().then(() => undefined);
  }

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={820}
      aria-label={t.common.farmSupplyRequests}
      aria-hidden={firstLoad || undefined}
      role="region"
      tabIndex={firstLoad ? undefined : 0}
      style={{ outlineOffset: -2 }}
    >
      <Table withRowBorders aria-busy={query.isFetching || undefined}>
        <Table.Thead>
          <Table.Tr>
            {columns.map((label) => (
              <Table.Th key={label} scope="col">
                {label}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {firstLoad
            ? Array.from({ length: 5 }, (_, index) => (
                <Table.Tr key={index}>
                  {columns.map((label) => (
                    <Table.Td key={label}>
                      <Skeleton h={16} w="75%" />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            : rows?.map((row) => (
                <Table.Tr
                  key={row.id}
                  data-selected={openId === row.id || undefined}
                  onClick={openRecordFromRow}
                  style={{ cursor: "pointer" }}
                >
                  <Table.Td maw={200}>
                    <DataListRecordLink
                      component={AdminNavigationLink}
                      href={supplyRequestHref(context, row.id)}
                      data-record-link
                      aria-current={openId === row.id || undefined}
                      style={{ overflowWrap: "anywhere" }}
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                      }}
                      onNavigate={(event) => {
                        if (!mobile) {
                          event.preventDefault();
                          setSelectedId(row.id);
                        }
                      }}
                    >
                      {row.code}
                    </DataListRecordLink>
                  </Table.Td>
                  <Table.Td>{locale === "vi" ? row.farm.name_vi : row.farm.name_en}</Table.Td>
                  <Table.Td>
                    {formatAdminDate(row.start_date)} – {formatAdminDate(row.end_date)}
                  </Table.Td>
                  <Table.Td>{row.items.length}</Table.Td>
                  <Table.Td>
                    <Text component="time" size="sm" dateTime={row.submitted_at}>
                      {formatAdminDateTime(row.submitted_at)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <SupplyRequestStatusBadge status={row.status} />
                  </Table.Td>
                </Table.Tr>
              ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  if (!current()) return null;
  return (
    <>
      <Stack ref={listRoot} tabIndex={-1} gap="md" miw={0} inert={Boolean(openId) || undefined}>
        <PageHeading title={t.common.farmSupplyRequests} visuallyHiddenTitle bottomSpacing={0} />
        <ListToolbar
          busy={Boolean(access.error)}
          filterPopover={{
            label: t.users.filter,
            activeCount:
              Number(Boolean(status)) + Number(Boolean(farm_id)) + Number(Boolean(search)),
            onOpen: () => {
              setFilters({ farm: farm_id, status });
              setFilterOpen(true);
            },
            onDismiss: () => {
              setFilters({ farm: farm_id, status });
              setFilterOpen(false);
            },
            clearLabel: t.common.clearFilters,
            clearDisabled: !filters.status && !filters.farm && !status && !farm_id && !search,
            onClear: () => {
              setFilters({ farm: undefined, status: undefined });
              update({ farm_id: undefined, status: undefined, search: "", page: 1 });
            },
            apply: {
              label: t.users.applyFilters,
              disabled: filters.status === status && filters.farm === farm_id,
              onApply: () => {
                setFilterOpen(false);
                update({ status: filters.status, farm_id: filters.farm, page: 1 });
              },
            },
            children: (
              <>
                {search && (
                  <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                    {t.users.appliedSearch.replace("{query}", search)}
                  </Text>
                )}
                {filterOpen && (
                  <SupplyRequestFarmFilter
                    value={filters.farm}
                    setValue={(farm) => setFilters((draft) => ({ ...draft, farm }))}
                    scopedRead={scopedRead}
                  />
                )}
                <Select
                  label={copy.status}
                  placeholder={copy.allStatuses}
                  value={filters.status ?? null}
                  onChange={(value) =>
                    setFilters((draft) => ({
                      ...draft,
                      status: supplyRequestStatuses.find(
                        (option: SupplyRequestStatus) => option === value,
                      ),
                    }))
                  }
                  data={supplyRequestStatuses.map((value: SupplyRequestStatus) => ({
                    value,
                    label: copy.statuses[value],
                  }))}
                  comboboxProps={nestedSelect}
                  clearable
                  withScrollArea={false}
                />
              </>
            ),
          }}
          refresh={{
            label: copy.refresh,
            onRefresh: reload,
            loading: query.isFetching && rows !== undefined,
            disabled: firstLoad,
          }}
        />
        <DataListPaper component="section">
          {Boolean(rows?.length) && table}
          <Box p={access.error || query.error ? "md" : undefined}>
            <ListState
              embedded
              hasData={rows !== undefined}
              isEmpty={rows?.length === 0}
              empty={copy.empty}
              noResults={search || status || farm_id ? copy.noMatches : undefined}
              loading={firstLoad}
              loadingLabel={copy.loading}
              loadingPlaceholder={table}
              error={
                access.error
                  ? t.common.forbidden
                  : query.error
                    ? requestErrorMessage(query.error, t)
                    : ""
              }
              onRetry={() => void reload()}
              retryLabel={t.common.retry}
            />
          </Box>
          {meta && (
            <>
              <Divider />
              <Box component="footer" px="md" py="sm">
                <Pagination
                  disabled={query.isFetching}
                  nextLabel={t.common.next}
                  onPage={(value) => update({ page: value })}
                  page={meta.page}
                  pageSize={meta.page_size}
                  previousLabel={t.common.previous}
                  resultCountLabel={t.common.resultCount}
                  resultCountSingularLabel={t.common.resultCountSingular}
                  summary={t.common.pagination}
                  total={meta.total}
                />
              </Box>
            </>
          )}
        </DataListPaper>
      </Stack>
      {openId && !mobile && (
        <AdminSupplyRequestDetail key={openId} requestId={openId} onClose={closeDrawer} />
      )}
    </>
  );
}

function SupplyRequestFarmFilter({
  value,
  setValue,
  scopedRead,
}: {
  value?: string;
  setValue: (id?: string) => void;
  scopedRead: <T>(signal: AbortSignal, request: () => Promise<T>) => Promise<T>;
}) {
  const { locale, t } = useAdminI18n();
  const copy = farmSupplyRequestCopy(locale);
  const [search, setSearch] = useState("");
  const remembered = useRef<{ value: string; label: string } | undefined>(undefined);
  const [debounced] = useDebouncedValue(normalizeFarmSupplySearch(search), 220);
  const results = useQuery({
    queryKey: [...farmListKey, "supply-request-filter", debounced],
    queryFn: ({ signal }) =>
      scopedRead(signal, () => listFarms({ page: 1, search: debounced }, signal)),
  });
  const found = results.data?.data.some((farm) => farm.id === value);
  const selected = useQuery({
    queryKey: [...farmListKey, "supply-request-filter-farm", value],
    enabled: Boolean(value && !found && remembered.current?.value !== value),
    queryFn: ({ signal }) => scopedRead(signal, () => getFarm(value ?? "", signal)),
  });
  const options = (results.data?.data ?? []).map((farm) => ({
    value: farm.id,
    label: locale === "vi" ? farm.name_vi : farm.name_en,
  }));
  const selection =
    selected.data && selected.data.id === value
      ? {
          value: selected.data.id,
          label: locale === "vi" ? selected.data.name_vi : selected.data.name_en,
        }
      : remembered.current?.value === value
        ? remembered.current
        : undefined;
  if (selection && !found) options.unshift(selection);
  return (
    <Select
      label={copy.farm}
      placeholder={copy.farmSearch}
      value={value ?? null}
      onChange={(id) => {
        remembered.current = options.find((option) => option.value === id);
        setValue(id ?? undefined);
      }}
      onSearchChange={(text) => {
        const existingValue = options.find((option) => option.value === value);
        setSearch(text === existingValue?.label ? "" : text);
      }}
      data={options}
      filter={({ options }) => options}
      searchable
      clearable
      withScrollArea={false}
      maxDropdownHeight={240}
      nothingFoundMessage={results.isFetching ? copy.loading : copy.noFarms}
      error={results.error ? requestErrorMessage(results.error, t) : undefined}
      comboboxProps={nestedSelect}
    />
  );
}
