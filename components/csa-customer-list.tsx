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
import { useMediaQuery } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { openRecordFromRow } from "@/components/record-row-navigation";
import { requirePaginatedList, requireResponseEntity } from "@/lib/api-response";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import {
  csaCustomerHref,
  csaCustomerLinks,
  csaCustomerListKey,
  csaCustomerPath,
  csaMembershipStatuses,
  readCsaCustomerListContext,
} from "@/lib/csa-customers-query";
import type { CSACustomer, PaginationMeta } from "@/lib/types";

const emptyParams = new URLSearchParams();

function findCustomerLink(root: HTMLElement | null, id: string) {
  return Array.from(root?.querySelectorAll<HTMLAnchorElement>("[data-record-link]") ?? []).find(
    (link) => link.dataset.csaCustomerId === id,
  );
}

export function CSACustomerList() {
  const { t } = useAdminI18n();
  const copy = t.csaCustomers;
  const pathname = usePathname();
  const params = useSearchParams();
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const context = readCsaCustomerListContext(params ?? emptyParams);
  const { search, linked, status, page } = context;
  const [draftSearch, setDraftSearch] = useState(search);
  const [filters, setFilters] = useState({ linked, status });
  const selectedId = pathname?.startsWith(`${csaCustomerPath}/`)
    ? pathname.slice(csaCustomerPath.length + 1)
    : undefined;
  const previousSelection = useRef(selectedId);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<{ element: HTMLElement; x: number; y: number } | null>(null);
  const restoredOpener = useRef<HTMLElement | null>(null);
  const list = useQuery({
    queryKey: [...csaCustomerListKey, context],
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({
        page: String(page),
        page_size: "30",
        linked: linked || "all",
      });
      if (search) query.set("search", search);
      if (status) query.set("membership_status", status);
      return requirePaginatedList(
        await apiEnvelope<CSACustomer[], PaginationMeta>(`admin/csa-customers?${query}`, {
          signal,
        }),
        requireResponseEntity,
      );
    },
  });
  const { data: items, meta } = list.error ? {} : (list.data ?? {});
  const initialLoading = !items && list.isPending && !list.error;
  const loading = list.isFetching;

  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    const returning = !selectedId && previousSelection.current;
    previousSelection.current = selectedId;
    if (selectedId) restoredOpener.current = null;
    if (!returning) return;
    const saved = opener.current;
    opener.current = null;
    const frame = window.requestAnimationFrame(() => {
      const target = saved?.element.isConnected
        ? saved.element
        : (findCustomerLink(root.current, returning) ?? root.current);
      if (saved && (window.scrollX !== saved.x || window.scrollY !== saved.y)) {
        window.scrollTo(saved.x, saved.y);
      }
      target?.focus({ preventScroll: true });
      if (target !== root.current && document.activeElement === target) {
        restoredOpener.current = target;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId]);

  useLayoutEffect(() => {
    const target = restoredOpener.current;
    if (!target || target.isConnected) return;
    restoredOpener.current = null;
    if (!selectedId && document.activeElement === document.body) {
      root.current?.focus({ preventScroll: true });
    }
  }, [items, selectedId]);

  function navigateList(next: typeof context) {
    const href = csaCustomerHref(next);
    if (href !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", href);
    }
  }

  useEffect(() => {
    if (selectedId || !meta || loading) return;
    const lastPage = Math.max(1, Math.ceil(meta.total / meta.page_size));
    if (page > lastPage) {
      window.history.replaceState(
        null,
        "",
        csaCustomerHref({ search, linked, status, page: lastPage }),
      );
    }
  }, [linked, loading, meta, page, search, selectedId, status]);

  async function refresh() {
    await list.refetch({ cancelRefetch: false });
  }

  const accountLabels = { linked: copy.linked, managed: copy.managed };
  const statusLabels = {
    active: copy.active,
    scheduled: copy.scheduled,
    history_only: copy.historyOnly,
    new: copy.newStatus,
  };

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={520}
      role="region"
      aria-label={copy.title}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
      style={{ outlineOffset: -2 }}
    >
      <Table aria-label={copy.title} aria-busy={loading || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{copy.customer}</Table.Th>
            <Table.Th scope="col">{copy.websiteAccount}</Table.Th>
            <Table.Th scope="col">{copy.statusFilter}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading
            ? Array.from({ length: 5 }, (_, row) => (
                <Table.Tr key={row}>
                  <Table.Td>
                    <Skeleton height={34} width="80%" />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={12} width="65%" />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={12} width="65%" />
                  </Table.Td>
                </Table.Tr>
              ))
            : items?.map((item) => {
                const selected = selectedId === item.id;
                const mode = item.user ? "linked" : "managed";
                return (
                  <Table.Tr
                    key={item.id}
                    data-selected={selected || undefined}
                    onClick={openRecordFromRow}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                        <Anchor
                          component={AdminNavigationLink}
                          aria-current={selected ? "page" : undefined}
                          aria-label={`${copy.view}: ${item.name}`}
                          c="inherit"
                          data-record-link
                          fw={600}
                          href={csaCustomerHref(context, item.id)}
                          onNavigate={() => {
                            const element = findCustomerLink(root.current, item.id);
                            if (element)
                              opener.current = { element, x: window.scrollX, y: window.scrollY };
                          }}
                          data-csa-customer-id={item.id}
                          scroll={false}
                          underline="never"
                        >
                          {item.name}
                        </Anchor>
                        <Text size="sm" c="dimmed">
                          {item.phone || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Status domain="account-link" status={mode} label={accountLabels[mode]} />
                    </Table.Td>
                    <Table.Td>
                      <Status
                        domain="csa-customer"
                        status={item.status}
                        label={statusLabels[item.status]}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack
      ref={root}
      tabIndex={-1}
      gap="md"
      miw={0}
      hidden={Boolean(mobile && selectedId)}
      inert={Boolean(selectedId) || undefined}
      style={mobile && selectedId ? { display: "none" } : undefined}
    >
      <PageHeading title={copy.title} visuallyHiddenTitle bottomSpacing={0} />
      <ListToolbar
        busy={loading}
        search={{
          label: copy.searchLabel,
          placeholder: copy.searchPlaceholder,
          value: draftSearch,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setDraftSearch,
          onSubmit: (value) => {
            const applied = value.trim();
            if (applied === search && page === 1) void refresh();
            else navigateList({ ...context, search: applied, page: 1 });
          },
          submitLabel: copy.search,
          clearLabel: t.common.clearFilters,
          onClear: () => {
            setDraftSearch("");
            navigateList({ ...context, search: "", page: 1 });
          },
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: Number(Boolean(linked)) + Number(Boolean(status)),
          onOpen: () => setFilters({ linked, status }),
          onDismiss: () => setFilters({ linked, status }),
          clearLabel: t.common.clearFilters,
          clearDisabled: !linked && !status && !filters.linked && !filters.status,
          onClear: () => {
            setFilters({ linked: "", status: "" });
            if (linked || status) navigateList({ ...context, linked: "", status: "", page: 1 });
          },
          apply: {
            label: t.users.applyFilters,
            disabled: filters.linked === linked && filters.status === status,
            onApply: () => navigateList({ ...context, ...filters, page: 1 }),
          },
          children: (
            <>
              <Select
                label={copy.linkedFilter}
                placeholder={copy.allLinks}
                value={filters.linked || null}
                onChange={(value) =>
                  setFilters({
                    ...filters,
                    linked: csaCustomerLinks.find((option) => option === value) ?? "",
                  })
                }
                data={csaCustomerLinks.map((value) => ({ value, label: accountLabels[value] }))}
                comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
                clearable
              />
              <Select
                label={copy.statusFilter}
                placeholder={copy.allStatuses}
                value={filters.status || null}
                onChange={(value) =>
                  setFilters({
                    ...filters,
                    status: csaMembershipStatuses.find((option) => option === value) ?? "",
                  })
                }
                data={csaMembershipStatuses.map((value) => ({
                  value,
                  label: copy.membershipStatuses[value],
                }))}
                comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
                clearable
              />
            </>
          ),
        }}
        refresh={{ label: copy.refresh, onRefresh: refresh }}
        primaryAction={
          // A document navigation lets the static creation route bypass the [id] interception.
          <Button
            component="a"
            href={`${csaCustomerPath}/new`}
            leftSection={<IconPlus size={16} aria-hidden />}
          >
            {copy.create}
          </Button>
        }
      />
      <Paper component="section" miw={0} style={{ overflow: "hidden" }}>
        {Boolean(items?.length) && table}
        <Box p={list.error ? "md" : undefined}>
          <ListState
            embedded
            empty={copy.empty}
            noResults={search || linked || status ? copy.noMatches : undefined}
            error={list.error ? requestErrorMessage(list.error, t) : ""}
            hasData={items !== undefined}
            isEmpty={items?.length === 0}
            loading={initialLoading}
            loadingLabel={copy.loading}
            loadingPlaceholder={table}
            onRetry={refresh}
            retryLabel={t.common.retry}
          />
        </Box>
        {meta && (
          <>
            <Divider />
            <Box px="md" py="sm">
              <Pagination
                disabled={loading}
                nextLabel={t.common.next}
                onPage={(next) => navigateList({ ...context, page: next })}
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
      </Paper>
    </Stack>
  );
}
