"use client";

import {
  Box,
  Button,
  Divider,
  Group,
  Image,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { CancelledError, useQuery, useQueryClient } from "@tanstack/react-query";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { requestErrorMessage } from "@/lib/client-error";
import { farmHref, readFarmListContext } from "@/lib/farm-navigation";
import {
  farmAccessDenied,
  farmListKey,
  retireFarmAccess,
  retryFarmAccess,
  useFarmAccess,
} from "@/lib/farm-query";
import { listFarms } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";

export function FarmList() {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const router = useRouter();
  const params = useSearchParams();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const client = useQueryClient();
  const { search, status, page } = readFarmListContext(params);
  const [query, setQuery] = useState(search);
  const { error: accessError } = useFarmAccess();
  useEffect(() => setQuery(search), [search]);

  const result = useQuery({
    queryKey: [...farmListKey, { search, status, page }],
    queryFn: async ({ signal }) => {
      const result = await listFarms(
        { search, is_active: status ? status === "true" : undefined, page },
        signal,
      );
      if (signal.aborted || !isCurrent()) throw new CancelledError();
      return result;
    },
    enabled: !accessError && isCurrent(),
  });
  useEffect(() => {
    if (!accessError && isCurrent() && farmAccessDenied(result.error))
      retireFarmAccess(client, result.error);
  }, [accessError, client, isCurrent, result.error]);
  const cause = accessError ?? result.error;
  const items = !cause ? (result.data?.data ?? null) : null;
  const meta = !cause ? result.data?.meta : undefined;
  const loading = !accessError && (result.isPending || result.isFetching);
  const initialLoading = loading && items === null;
  const error = cause ? requestErrorMessage(cause, t) : "";
  const reload = () => {
    if (accessError) retryFarmAccess(client);
    else void result.refetch();
  };
  const lastPage = meta ? Math.max(1, Math.ceil(meta.total / meta.page_size)) : page;

  function href(change: Record<string, string>) {
    const next = new URLSearchParams(params?.toString());
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return farmHref(next);
  }

  useEffect(() => {
    if (!isCurrent() || loading || page <= lastPage) return;
    const next = new URLSearchParams(params?.toString());
    next.set("page", String(lastPage));
    router.replace(farmHref(next), { scroll: false });
  }, [isCurrent, lastPage, loading, page, params, router]);

  function clearFilters() {
    setQuery("");
    router.push(href({ search: "", is_active: "", page: "" }), { scroll: false });
  }

  if (!isCurrent()) return null;

  return (
    <Stack gap="md" miw={0}>
      <PageHeading title={t.common.farmList} visuallyHiddenTitle />
      <ListToolbar
        busy={loading}
        refresh={{
          label: t.common.refreshList,
          onRefresh: reload,
          loading: loading && items !== null,
          disabled: initialLoading,
        }}
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
      <DataListPaper>
        {!!items?.length && (
          <Table.ScrollContainer
            type="native"
            minWidth={420}
            role="region"
            aria-label={c.list}
            tabIndex={0}
            style={{ outlineOffset: -2 }}
          >
            <Table aria-label={c.list} aria-busy={loading || undefined}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">{c.listFarmColumn}</Table.Th>
                  <Table.Th scope="col">
                    <Tooltip
                      label={c.listProductCountHint}
                      events={{ hover: true, focus: true, touch: true }}
                      multiline
                      w={220}
                    >
                      <span tabIndex={0}>{c.listProductsColumn}</span>
                    </Tooltip>
                  </Table.Th>
                  <Table.Th scope="col">{c.status}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((farm) => {
                  const inStock = farm.in_stock_product_count;
                  const total = inStock + farm.out_of_stock_product_count;
                  const productCount =
                    total === 1 ? c.listProductCountSingular : c.listProductCount;

                  return (
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
                            <DataListRecordLink
                              component={AdminNavigationLink}
                              href={farmHref(params, { id: farm.id, tab: "products" })}
                            >
                              {locale === "vi" ? farm.name_vi : farm.name_en}
                            </DataListRecordLink>
                            <Text size="sm" c="dimmed">
                              {locale === "vi" ? farm.location_vi : farm.location_en}
                            </Text>
                          </Stack>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        {total > 0 ? (
                          <Stack gap={4}>
                            <Text inherit fw={600}>
                              {productCount.replace("{count}", String(total))}
                            </Text>
                            <Text size="sm" c="dimmed">
                              {inStock > 0
                                ? c.listProductsInStock.replace("{count}", String(inStock))
                                : c.listNoProductsInStock}
                            </Text>
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed">
                            {c.listNoProducts}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Status
                          domain="availability"
                          status={farm.is_active ? "active" : "inactive"}
                          label={farm.is_active ? c.active : c.inactive}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <Box p={error && !loading ? "md" : undefined}>
          <ListState
            embedded
            tableColumns={3}
            empty={c.empty}
            error={loading ? "" : error}
            hasData={items !== null}
            isEmpty={items?.length === 0}
            loading={initialLoading}
            loadingLabel={c.loading}
            noResults={search || status ? c.noMatchingFarms : undefined}
            onRetry={reload}
            retryLabel={t.common.retry}
          />
        </Box>
        {meta && (
          <>
            <Divider />
            <Box component="footer" px="md" py="sm">
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
      </DataListPaper>
    </Stack>
  );
}
