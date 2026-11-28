"use client";

import { Box, Button, Divider, Group, Select, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { FarmProductPicker } from "@/components/farm-product-picker";
import { DataListPaper } from "@/components/data-list-paper";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { ListState } from "@/components/list-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { farmHref, normalizeFarmSupplySearch, readFarmSupplyContext } from "@/lib/farm-navigation";
import { farmListCanShowData, farmSupplyKey } from "@/lib/farm-query";
import { listFarmProducts } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { Farm } from "@/lib/types";
import { useFarmProductLinkWrite } from "@/lib/use-farm-product-link-write";

type Props = { farm: Farm; isTabActive?: boolean; onAccessLost?: (cause: unknown) => void };
type SupplyContext = ReturnType<typeof readFarmSupplyContext>;

export function FarmProducts({ farm, isTabActive = true, onAccessLost }: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const quantity = new Intl.NumberFormat(locale);
  const router = useRouter();
  const params = useSearchParams();
  const currentSession = useIsAdminQueryScopeCurrent();
  const context = readFarmSupplyContext(params);
  const { search, status, page } = context;
  const [draft, setDraft] = useState(search);
  const [addOpen, setAddOpen] = useState<boolean>();
  const addButton = useRef<HTMLButtonElement>(null);
  const query = useQuery({
    queryKey: [...farmSupplyKey(farm.id), "list", status, search, page],
    enabled: isTabActive,
    queryFn: ({ signal }) =>
      listFarmProducts(farm.id, { search, supplyStatus: status, page }, signal),
  });
  const accessLost = isProtectedDataError(query.error);
  const data = farmListCanShowData(query.error) ? query.data : undefined;
  const initialLoading = !data && (query.isPending || query.isFetching);
  const showingError = Boolean(query.error && !query.isFetching);
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size)) : page;
  const linkWrite = useFarmProductLinkWrite(farm.id, undefined, onAccessLost);
  const supplyHref = (supply: SupplyContext) =>
    farmHref(params, { id: farm.id, tab: "products", supply });
  const lastHref =
    isTabActive && page > lastPage ? supplyHref({ ...context, page: lastPage }) : null;

  useEffect(() => setDraft(search), [search]);
  useEffect(() => {
    if (lastHref) router.replace(lastHref, { scroll: false });
  }, [lastHref, router]);
  useEffect(() => {
    if (accessLost) onAccessLost?.(query.error);
  }, [accessLost, onAccessLost, query.error]);

  function change(change: Partial<SupplyContext>) {
    router.push(supplyHref({ ...context, page: 1, ...change }), { scroll: false });
  }

  if (!currentSession() || accessLost) return null;
  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={520}
      role="region"
      aria-label={c.products}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
    >
      <Table aria-label={c.products} aria-busy={query.isFetching || undefined}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{c.productColumn}</Table.Th>
            <Table.Th scope="col">{c.saleUnit}</Table.Th>
            <Table.Th scope="col">{c.currentStock}</Table.Th>
            {status !== "supplying" && <Table.Th scope="col">{c.supplyStatus}</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading ? (
            <TableSkeletonRows columns={status === "supplying" ? 3 : 4} height={36} />
          ) : (
            data?.data.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                    <DataListRecordLink
                      component={AdminNavigationLink}
                      href={farmHref(params, { id: farm.id, productId: row.product_id })}
                    >
                      {locale === "vi" ? row.name_vi : row.name_en}
                    </DataListRecordLink>
                    <Text c="dimmed" size="sm">
                      {row.sku}
                    </Text>
                    {row.product_status !== "active" && (
                      <ProductLifecycleStatus status={row.product_status} />
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  {formatDecimalInput(row.unit_size)}{" "}
                  {locale === "vi" ? row.unit_label_vi : row.unit_label_en}
                </Table.Td>
                <Table.Td>
                  {row.supply_status === "removed" ? "—" : quantity.format(row.available_quantity)}
                </Table.Td>
                {status !== "supplying" && (
                  <Table.Td>
                    <Status
                      domain="farm-stock"
                      status={row.supply_status === "supplying" ? "active" : "inactive"}
                      label={row.supply_status === "supplying" ? c.productActive : c.productRemoved}
                    />
                  </Table.Td>
                )}
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <Stack gap="md" miw={0}>
      <ListToolbar
        busy={initialLoading}
        search={{
          label: c.searchLinked,
          submitLabel: c.searchButton,
          placeholder: c.productPlaceholder,
          value: draft,
          appliedValue: search,
          formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
          onChange: setDraft,
          onSubmit: (value) => {
            const trimmed = normalizeFarmSupplySearch(value);
            if (page === 1 && trimmed === search) void query.refetch({ cancelRefetch: false });
            else change({ search: trimmed });
          },
          clearLabel: t.common.clearFilters,
          onClear: () => change({ search: "" }),
        }}
        filterPopover={{
          label: t.users.filter,
          activeCount: status === "supplying" ? 0 : 1,
          children: (
            <Select
              label={c.supplyStatus}
              role="combobox"
              value={status}
              allowDeselect={false}
              comboboxProps={{ withinPortal: false }}
              data={[
                { value: "supplying", label: c.productActive },
                { value: "removed", label: c.productRemoved },
                { value: "all", label: c.all },
              ]}
              onChange={(value) => {
                if (value === "supplying" || value === "removed" || value === "all")
                  change({ status: value });
              }}
            />
          ),
        }}
        refresh={{
          label: c.refreshSupply,
          onRefresh: () => query.refetch({ cancelRefetch: false }).then(() => undefined),
          loading: query.isFetching && Boolean(data),
          disabled: initialLoading,
        }}
        wrapPrimaryAction
        primaryAction={
          <Group gap="xs" wrap="nowrap" justify="flex-end">
            <Button
              ref={addButton}
              variant="default"
              onClick={() => setAddOpen(true)}
              disabled={
                linkWrite.pending ||
                (!linkWrite.unresolved && (linkWrite.blocked || !query.isSuccess))
              }
            >
              {c.addProduct}
            </Button>
            <Button
              component={AdminNavigationLink}
              href={farmHref(params, { id: farm.id, bulk: true })}
            >
              {c.addSupply}
            </Button>
          </Group>
        }
      />
      <DataListPaper>
        {Boolean(data?.data.length) && table}
        <Box p={showingError ? "md" : undefined}>
          <ListState
            embedded
            loadingPlaceholder={table}
            empty={status === "removed" ? c.noRemovedProducts : c.linkedEmpty}
            noResults={search ? c.noLinkedMatch : undefined}
            loading={initialLoading}
            loadingLabel={c.loadingSupply}
            hasData={Boolean(data)}
            isEmpty={data?.data.length === 0}
            error={showingError ? requestErrorMessage(query.error, t) : ""}
            onRetry={() => void query.refetch({ cancelRefetch: false })}
            retryLabel={t.common.retry}
          />
        </Box>
        {data && (
          <>
            <Divider />
            <Box component="footer" px="md" py="sm">
              <Pagination
                page={page}
                pageSize={data.meta.page_size}
                total={data.meta.total}
                disabled={query.isFetching || Boolean(lastHref)}
                onPage={(next) => change({ page: next })}
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
      {isTabActive && (addOpen ?? linkWrite.unresolved) && (
        <FarmProductPicker
          farmId={farm.id}
          write={linkWrite}
          onAccessLost={onAccessLost}
          onClose={() => setAddOpen(false)}
          returnFocusRef={addButton}
        />
      )}
    </Stack>
  );
}
