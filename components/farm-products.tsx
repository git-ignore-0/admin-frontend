"use client";

import { Anchor, Box, Button, Divider, Group, Select, Stack, Table, Text } from "@mantine/core";
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { FarmBatchDialog } from "@/components/farm-batch-dialog";
import { DataListPaper } from "@/components/data-list-paper";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { ListState } from "@/components/list-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { apiErrorContext, isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { invalidateFarmDetail } from "@/lib/farm-detail-snapshot";
import { farmHref, normalizeFarmSupplySearch, readFarmSupplyContext } from "@/lib/farm-navigation";
import {
  farmAccess,
  farmAccessDenied,
  farmBulkBlocksWrite,
  farmDeleteBlocksWrite,
  farmListCanShowData,
  farmListKey,
  farmSupplyKey,
  farmSupplyWriteKey,
  retireFarmAccess,
  useFarmDeleteBlocksWrite,
  useFarmBulkBlocksWrite,
} from "@/lib/farm-query";
import {
  addFarmProduct,
  getFarmProduct,
  listAvailableFarmProducts,
  listFarmProducts,
  parseFarmSourceBlocker,
} from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { isUncertainFarmSupplyWrite } from "@/lib/farm-stock";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { AvailableFarmProduct, Farm, StockBatchInput } from "@/lib/types";

type Props = { farm: Farm; isTabActive?: boolean; onAccessLost?: (cause: unknown) => void };
type SupplyContext = ReturnType<typeof readFarmSupplyContext>;
type AddAttempt = { product: AvailableFarmProduct; batch: StockBatchInput };
const addMutationKey = (farmId: string) => [...farmSupplyWriteKey(farmId), "add"];

export function FarmProducts({ farm, isTabActive = true, onAccessLost }: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const quantity = new Intl.NumberFormat(locale);
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const currentSession = useIsAdminQueryScopeCurrent();
  const context = readFarmSupplyContext(params);
  const { search, status, page } = context;
  const [draft, setDraft] = useState(search);
  const [addOpen, setAddOpen] = useState(false);
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
  const pendingWrite = useIsMutating({ mutationKey: farmSupplyWriteKey(farm.id) }) > 0;
  const deletionLocked = useFarmDeleteBlocksWrite(farm.id);
  const bulkLocked = useFarmBulkBlocksWrite(farm.id);
  const retained = useMutationState({
    filters: { mutationKey: addMutationKey(farm.id), exact: true, status: "error" },
    select: (entry) => entry,
  }).findLast(
    ({ state }) => !isProtectedDataError(state.error) && isUncertainFarmSupplyWrite(state.error),
  );
  const savedAttempt = retained?.state.variables as AddAttempt | undefined;
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
        primaryAction={
          <Group gap="sm">
            <Button
              ref={addButton}
              variant="default"
              onClick={() => setAddOpen(true)}
              disabled={
                deletionLocked ||
                pendingWrite ||
                bulkLocked ||
                Boolean(retained) ||
                !query.isSuccess ||
                query.isFetching
              }
            >
              {c.addProduct}
            </Button>
            <Button
              component={AdminNavigationLink}
              href={farmHref(params, { id: farm.id, bulk: true })}
            >
              {locale === "vi" ? "Bổ sung nguồn cung" : "Add supply"}
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
      {(addOpen || savedAttempt) && (
        <AddFarmProduct
          farm={farm}
          isTabActive={isTabActive}
          onAccessLost={onAccessLost}
          onClose={() => setAddOpen(false)}
          focus={addButton}
          savedAttempt={savedAttempt}
          clearAttempt={() => {
            if (retained) queryClient.getMutationCache().remove(retained);
          }}
          onAdded={() => {
            setAddOpen(false);
            void queryClient.invalidateQueries({ queryKey: [...farmSupplyKey(farm.id), "list"] });
            void queryClient.invalidateQueries({ queryKey: farmListKey });
          }}
        />
      )}
    </Stack>
  );
}

function AddFarmProduct({
  farm,
  isTabActive,
  onAccessLost,
  onClose,
  onAdded,
  focus,
  savedAttempt,
  clearAttempt,
}: Props & {
  onClose: () => void;
  onAdded: () => void;
  focus: React.RefObject<HTMLButtonElement | null>;
  savedAttempt?: AddAttempt;
  clearAttempt: () => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const toast = useToast();
  const currentSession = useIsAdminQueryScopeCurrent();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AvailableFarmProduct | undefined>(savedAttempt?.product);
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(Boolean(savedAttempt));
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const [found, setFound] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(!savedAttempt);
  const active = useRef(false);
  const tabActive = useRef(isTabActive);
  tabActive.current = isTabActive;
  const pending = useRef(false);
  const recovery = useRef<AbortController | null>(null);
  const mutationKey = addMutationKey(farm.id);
  const cache = queryClient.getMutationCache();
  const deletionLocked = useFarmDeleteBlocksWrite(farm.id);
  // Pending writes stay observable across routes. Only unresolved writes survive settlement.
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ product, batch }: AddAttempt) => addFarmProduct(farm.id, product.id, batch),
    gcTime: Infinity,
  });
  const picker = useQuery({
    queryKey: [...farmSupplyKey(farm.id), "picker", search, page],
    enabled: isTabActive && !unconfirmed,
    queryFn: ({ signal }) => listAvailableFarmProducts(farm.id, { search, page }, signal),
    refetchOnWindowFocus: false,
  });
  const permissionLost = isProtectedDataError(picker.error);

  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      recovery.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (permissionLost) onAccessLost?.(picker.error);
  }, [onAccessLost, permissionLost, picker.error]);

  async function add(batch: StockBatchInput) {
    if (
      !selected ||
      unconfirmed ||
      pending.current ||
      !currentSession() ||
      farmDeleteBlocksWrite(queryClient, farm.id) ||
      farmBulkBlocksWrite(queryClient, farm.id) ||
      queryClient.isMutating({ mutationKey: farmSupplyWriteKey(farm.id) }) > 0
    )
      return;
    pending.current = true;
    const attempt = { product: selected, batch };
    const accessRevision = farmAccess(queryClient).revision;
    const permitted = () => currentSession() && farmAccess(queryClient).revision === accessRevision;
    let uncertain = false;
    setError("");
    try {
      await mutation.mutateAsync(attempt);
      if (!permitted()) return;
      invalidateFarmDetail(queryClient, farm.id);
      void queryClient.invalidateQueries({
        queryKey: [...farmSupplyKey(farm.id), "picker"],
        refetchType: "none",
      });
      if (!active.current) {
        void queryClient.invalidateQueries({ queryKey: [...farmSupplyKey(farm.id), "list"] });
        void queryClient.invalidateQueries({
          queryKey: [...farmSupplyKey(farm.id), "source", selected.id],
        });
        void queryClient.invalidateQueries({ queryKey: farmListKey });
        return;
      }
      if (tabActive.current) toast(c.addedProduct);
      onAdded();
    } catch (cause) {
      if (currentSession() && farmAccessDenied(cause)) {
        retireFarmAccess(queryClient, cause);
        if (active.current) onAccessLost?.(cause);
        return;
      }
      uncertain = permitted() && isUncertainFarmSupplyWrite(cause);
      if (!active.current || !permitted()) return;
      const blocker = parseFarmSourceBlocker({
        code: (cause as Error)?.message,
        context: apiErrorContext(cause) ?? undefined,
      });
      if (blocker?.code === "farm_product_removed" || blocker?.code === "product_already_linked") {
        invalidateFarmDetail(queryClient, farm.id);
        setError(
          blocker.code === "farm_product_removed" ? c.addPreviouslyRemoved : c.alreadyLinked,
        );
        setFound(true);
        setUnconfirmed(true);
      } else if (blocker?.code === "product_inactive") {
        setError(c.productDeactivated);
        setSelected(undefined);
        void picker.refetch();
      } else if (uncertain) {
        setUnconfirmed(true);
      } else {
        setError(
          requestErrorMessage(cause, t, {
            start_date: c.startDate,
            end_date: c.endDate,
            quantity_units: c.quantityUnits,
          }),
        );
      }
    } finally {
      if (!uncertain) {
        const entry = cache.find({
          mutationKey,
          exact: true,
          predicate: (row) => row.state.variables === attempt,
        });
        if (entry) cache.remove(entry);
      }
      pending.current = false;
    }
  }

  async function verify() {
    if (!selected || recovery.current || !currentSession()) return;
    const controller = new AbortController();
    const accessRevision = farmAccess(queryClient).revision;
    const canUpdate = () =>
      !controller.signal.aborted &&
      active.current &&
      currentSession() &&
      farmAccess(queryClient).revision === accessRevision;
    recovery.current = controller;
    setChecking(true);
    setCheckMessage("");
    try {
      await getFarmProduct(farm.id, selected.id, controller.signal);
      if (canUpdate()) {
        setFound(true);
        setCheckMessage(c.sourceFoundReview);
        invalidateFarmDetail(queryClient, farm.id);
        void queryClient.invalidateQueries({ queryKey: [...farmSupplyKey(farm.id), "list"] });
        void queryClient.invalidateQueries({ queryKey: farmListKey });
        void queryClient.invalidateQueries({
          queryKey: [...farmSupplyKey(farm.id), "picker"],
          refetchType: "none",
        });
      }
    } catch (cause) {
      if (!controller.signal.aborted && currentSession() && farmAccessDenied(cause)) {
        retireFarmAccess(queryClient, cause);
        if (active.current) onAccessLost?.(cause);
      } else if (canUpdate()) {
        setCheckMessage(c.addStillUncertain);
      }
    } finally {
      recovery.current = null;
      if (canUpdate()) setChecking(false);
    }
  }

  if (permissionLost || !currentSession()) return null;
  const showDialog = Boolean(isTabActive && dialogVisible);
  const recoveryBanner = isTabActive && !showDialog && (
    <RecoveryAlert
      message={c.addUnconfirmed}
      retryLabel={c.checkLatestFarm}
      onRetry={() => {
        setDialogVisible(true);
        void verify();
      }}
    />
  );
  const items = picker.error ? [] : (picker.data?.data ?? []);
  const products =
    selected && !items.some(({ id }) => id === selected.id) ? [selected, ...items] : items;
  const busy = mutation.isPending;
  return (
    <>
      {recoveryBanner}
      <FarmBatchDialog
        visible={showDialog}
        initialBatch={savedAttempt?.batch}
        title={c.addFromCatalog}
        confirmLabel={c.addProduct}
        product={selected}
        busy={busy}
        blocked={deletionLocked || unconfirmed || picker.isFetching || Boolean(picker.error)}
        error={error}
        fallbackFocusRef={focus}
        onCancel={() => {
          if (unconfirmed && !found) setDialogVisible(false);
          else {
            clearAttempt();
            onClose();
          }
        }}
        onSubmit={(batch) => void add(batch)}
        feedback={
          unconfirmed && (
            <Stack gap="xs">
              {!found && (
                <RecoveryAlert
                  message={c.addUnconfirmed}
                  retryLabel={c.checkLatestFarm}
                  loading={checking}
                  onRetry={() => void verify()}
                />
              )}
              {checkMessage && (
                <Text size="sm" role="status">
                  {checkMessage}
                </Text>
              )}
              {found && selected && (
                <Anchor
                  component={AdminNavigationLink}
                  href={farmHref(params, { id: farm.id, productId: selected.id })}
                >
                  {c.openSource}
                </Anchor>
              )}
            </Stack>
          )
        }
      >
        {unconfirmed && selected ? (
          <Text fw={600} style={{ overflowWrap: "anywhere" }}>
            {locale === "vi" ? selected.name_vi : selected.name_en} · {selected.sku}
          </Text>
        ) : (
          <>
            <ListToolbar
              search={{
                label: c.productSearch,
                value: searchDraft,
                appliedValue: search,
                formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
                submitLabel: c.searchButton,
                onChange: setSearchDraft,
                onSubmit: (value) => {
                  const trimmed = normalizeFarmSupplySearch(value);
                  if (search === trimmed && page === 1) void picker.refetch();
                  else {
                    setSearch(trimmed);
                    setPage(1);
                  }
                },
              }}
              busy={busy}
            />
            <ListState
              embedded
              loading={picker.isLoading}
              loadingLabel={c.loadingSupply}
              hasData={Boolean(picker.data)}
              isEmpty={items.length === 0}
              empty={c.noCatalogMatch}
              error={picker.error ? requestErrorMessage(picker.error, t) : ""}
              onRetry={() => void picker.refetch()}
              retryLabel={t.common.retry}
            />
            <Select
              label={c.productColumn}
              role="combobox"
              placeholder={c.chooseProduct}
              disabled={busy || picker.isFetching || Boolean(picker.error)}
              value={selected?.id ?? null}
              data={products.map((row) => ({
                value: row.id,
                label: `${locale === "vi" ? row.name_vi : row.name_en} · ${row.sku}`,
              }))}
              onChange={(id) => setSelected(products.find((row) => row.id === id))}
            />
            {picker.data && picker.data.meta.total > picker.data.meta.page_size && (
              <Group>
                <Pagination
                  page={page}
                  pageSize={picker.data.meta.page_size}
                  total={picker.data.meta.total}
                  disabled={busy || picker.isFetching}
                  onPage={setPage}
                  previousLabel={t.common.previous}
                  nextLabel={t.common.next}
                  summary={t.common.pagination}
                  resultCountLabel={t.common.resultCount}
                  resultCountSingularLabel={t.common.resultCountSingular}
                />
              </Group>
            )}
          </>
        )}
      </FarmBatchDialog>
    </>
  );
}
