"use client";

import {
  Alert,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Image,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import {
  TrackerFarmManager,
  type TrackerFarmManagerHandle,
} from "@/components/tracker-farm-manager";
import { requestErrorMessage } from "@/lib/client-error";
import { farmHref, readFarmListContext } from "@/lib/farm-navigation";
import { listFarms } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function FarmList() {
  const { t } = useAdminI18n();
  const search = useSearchParams();
  const router = useRouter();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const tab = search?.get("tab") === "tracker" ? "tracker" : "farms";
  const [opened, setOpened] = useState({ farms: tab === "farms", tracker: tab === "tracker" });
  const tracker = useRef<TrackerFarmManagerHandle>(null);
  useEffect(() => {
    setOpened((current) => (current[tab] ? current : { ...current, [tab]: true }));
  }, [tab]);

  if (!isCurrent()) return null;

  return (
    <Stack gap="md" miw={0}>
      <PageHeading title={t.common.farmList} visuallyHiddenTitle />
      <Tabs
        value={tab}
        onChange={(value) => {
          if (value !== "farms" && value !== "tracker") return;
          const navigate = () =>
            router.push(farmHref(search, { view: value, setup: false }), { scroll: false });
          if (tab === "tracker" && tracker.current) tracker.current.requestNavigation(navigate);
          else navigate();
        }}
      >
        <Tabs.List mb="md" aria-label={t.common.farms}>
          <Tabs.Tab value="farms">{t.common.farmList}</Tabs.Tab>
          <Tabs.Tab value="tracker">{t.common.trackerFarms}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="farms">
          {(tab === "farms" || opened.farms) && <FarmDirectory active={tab === "farms"} />}
        </Tabs.Panel>
        <Tabs.Panel value="tracker">
          {(tab === "tracker" || opened.tracker) && <TrackerFarmManager ref={tracker} />}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function FarmDirectory({ active }: { active: boolean }) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const router = useRouter();
  const params = useSearchParams();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const { search, status, page, setup } = readFarmListContext(params);
  const [query, setQuery] = useState(search);
  const dictionary = useRef(t);
  dictionary.current = t;
  useEffect(() => setQuery(search), [search]);

  const fetchPage = useCallback(
    async (page: number, signal: AbortSignal) => {
      const result = await listFarms(
        { search, is_active: status ? status === "true" : undefined, page },
        signal,
      );
      if (!isCurrent()) throw new Error("session_changed");
      return result;
    },
    [isCurrent, search, status],
  );
  const getErrorMessage = useCallback(
    (error: unknown) => requestErrorMessage(error, dictionary.current),
    [],
  );
  const { items, meta, loading, error, reload } = usePaginatedList({
    fetchPage,
    getErrorMessage,
    controlledPage: page,
    requestKey: JSON.stringify([search, status]),
  });
  const lastPage = meta ? Math.max(1, Math.ceil(meta.total / meta.page_size)) : page;

  function href(change: Record<string, string>) {
    const next = new URLSearchParams(params?.toString());
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return farmHref(next, { view: "farms" });
  }

  useEffect(() => {
    if (!active || loading || page <= lastPage) return;
    const next = new URLSearchParams(params?.toString());
    next.set("page", String(lastPage));
    router.replace(farmHref(next, { view: "farms" }), { scroll: false });
  }, [active, lastPage, loading, page, params, router]);

  function clearFilters() {
    setQuery("");
    router.push(href({ search: "", is_active: "", page: "" }), { scroll: false });
  }

  return (
    <Stack gap="md" miw={0}>
      {setup && (
        <Alert color="info" title={c.chooseTrackerFarm}>
          {c.chooseTrackerFarmHint}
        </Alert>
      )}
      <ListToolbar
        busy={loading}
        primaryAction={
          <Button component={AdminNavigationLink} href={farmHref(params, { mode: "new" })}>
            {c.new}
          </Button>
        }
        search={{
          label: c.search,
          submitLabel: c.searchButton,
          placeholder: c.searchPlaceholder,
          value: query,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setQuery,
          onSubmit: (value) => {
            if (value.trim() === search && page === 1) reload();
            else router.push(href({ search: value.trim(), page: "" }), { scroll: false });
          },
          clearLabel: t.common.clearFilters,
          onClear: clearFilters,
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: status ? 1 : 0,
          clearLabel: t.common.clearFilters,
          clearDisabled: !search && !query && !status,
          onClear: clearFilters,
          children: (
            <Select
              label={c.status}
              role="combobox"
              disabled={loading}
              withScrollArea={false}
              comboboxProps={{
                withinPortal: false,
                floatingStrategy: "fixed",
                middlewares: { size: { padding: 8 } },
                styles: { dropdown: { overflowY: "auto" } },
              }}
              value={status}
              onChange={(value) =>
                router.push(href({ is_active: value ?? "", page: "" }), { scroll: false })
              }
              data={[
                { value: "", label: c.all },
                { value: "true", label: c.active },
                { value: "false", label: c.inactive },
              ]}
            />
          ),
        }}
      />
      <Paper miw={0}>
        {!!items?.length && (
          <Table.ScrollContainer
            type="native"
            minWidth={600}
            role="region"
            aria-label={c.list}
            tabIndex={0}
            style={{ outlineOffset: -2 }}
          >
            <Table aria-label={c.list} aria-busy={loading || undefined}>
              <Table.Thead>
                <Table.Tr>
                  {[c.name, c.status, c.availableStock, c.outOfStock].map((label) => (
                    <Table.Th key={label} scope="col">
                      {label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((farm) => (
                  <Table.Tr key={farm.id}>
                    <Table.Td>
                      <Group wrap="nowrap" gap="sm" miw={0}>
                        {farm.image && (
                          <Image
                            component={NextImage}
                            alt=""
                            src={mediaUrlForWidth(farm.image, 112)}
                            width={56}
                            height={48}
                            w={56}
                            h={48}
                            flex="0 0 auto"
                            radius="md"
                            unoptimized
                          />
                        )}
                        <Stack miw={0} gap={4} style={{ overflowWrap: "anywhere" }}>
                          <Anchor
                            component={AdminNavigationLink}
                            fw={600}
                            href={farmHref(params, {
                              id: farm.id,
                              tab: setup ? "tracker" : "products",
                            })}
                          >
                            {locale === "vi" ? farm.name_vi : farm.name_en}
                          </Anchor>
                          <Text size="sm" c="dimmed">
                            {locale === "vi" ? farm.location_vi : farm.location_en}
                          </Text>
                        </Stack>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Status
                        domain="availability"
                        status={farm.is_active ? "active" : "inactive"}
                        label={farm.is_active ? c.active : c.inactive}
                      />
                    </Table.Td>
                    <Table.Td>
                      {c.inStockProducts.replace("{count}", String(farm.in_stock_product_count))}
                    </Table.Td>
                    <Table.Td>
                      {c.outOfStockProducts.replace(
                        "{count}",
                        String(farm.out_of_stock_product_count),
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <Box p={error || (loading && items !== null) ? "md" : undefined}>
          <ListState
            embedded
            empty={c.empty}
            error={error}
            hasData={items !== null}
            isEmpty={items?.length === 0}
            loading={loading}
            loadingLabel={c.loading}
            noResults={search || status ? c.noMatchingFarms : undefined}
            onRetry={reload}
            retryLabel={t.common.retry}
          />
        </Box>
        {meta && (
          <>
            <Divider />
            <Box px="md" py="sm">
              <Pagination
                page={meta.page}
                total={meta.total}
                pageSize={meta.page_size}
                onPage={(page) => router.push(href({ page: String(page) }), { scroll: false })}
                disabled={loading}
                previousLabel={t.common.previous}
                nextLabel={t.common.next}
                summary={t.common.pagination}
                resultCountLabel={t.common.resultCount}
                resultCountSingularLabel={t.common.resultCountSingular}
              />
            </Box>
          </>
        )}
      </Paper>
    </Stack>
  );
}
