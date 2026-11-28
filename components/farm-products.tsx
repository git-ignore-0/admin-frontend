"use client";

import { Box, Button, Checkbox, Divider, Group, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { FarmProductBulkRemoveDialog } from "@/components/farm-product-bulk-remove-dialog";
import { FarmProductPicker } from "@/components/farm-product-picker";
import { DataListPaper } from "@/components/data-list-paper";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { ListState } from "@/components/list-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { useToast } from "@/components/toast-provider";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { farmHref, normalizeFarmSupplySearch, readFarmSupplyContext } from "@/lib/farm-navigation";
import { farmListCanShowData, farmSupplyKey, useFarmAccess } from "@/lib/farm-query";
import { listFarmProducts } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { Farm, FarmProduct } from "@/lib/types";
import { useFarmProductBulkRemove } from "@/lib/use-farm-product-bulk-remove";
import { useFarmProductLinkWrite } from "@/lib/use-farm-product-link-write";

type Props = {
  farm: Farm;
  canAddSupply?: boolean;
  onRefreshFarm?: () => void | Promise<void>;
  isTabActive?: boolean;
  onAccessLost?: (cause: unknown) => void;
};
type SupplyContext = ReturnType<typeof readFarmSupplyContext>;
type RemovalSelection = { scope: string; products: readonly FarmProduct[] };

function sameSource(a: FarmProduct, b: FarmProduct) {
  return a.id === b.id && a.product_id === b.product_id && a.version === b.version;
}

export function FarmProducts({
  farm,
  canAddSupply,
  onRefreshFarm,
  isTabActive = true,
  onAccessLost,
}: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const quantity = new Intl.NumberFormat(locale);
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const currentSession = useIsAdminQueryScopeCurrent();
  const access = useFarmAccess();
  const context = readFarmSupplyContext(params);
  const { search, page } = context;
  const [draft, setDraft] = useState(search);
  const [addOpen, setAddOpen] = useState<boolean>();
  const [selection, setSelection] = useState<RemovalSelection>();
  const [confirmation, setConfirmation] = useState<RemovalSelection>();
  const [dismissedIntent, setDismissedIntent] = useState<string>();
  const addButton = useRef<HTMLButtonElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const query = useQuery({
    queryKey: [...farmSupplyKey(farm.id), "list", "supplying", search, page],
    enabled: isTabActive && !access.error,
    queryFn: ({ signal }) =>
      listFarmProducts(farm.id, { search, supplyStatus: "supplying", page }, signal),
  });
  const accessLost = isProtectedDataError(query.error);
  const data = !access.error && farmListCanShowData(query.error) ? query.data : undefined;
  const initialLoading = !data && (query.isPending || query.isFetching);
  const showingError = Boolean(query.error && !query.isFetching);
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size)) : page;
  const linkWrite = useFarmProductLinkWrite(farm.id, undefined, onAccessLost);
  const removeWrite = useFarmProductBulkRemove(farm.id, onAccessLost);
  const supplyHref = (supply: SupplyContext) =>
    farmHref(params, { id: farm.id, tab: "products", supply });
  const lastHref =
    isTabActive && page > lastPage ? supplyHref({ ...context, page: lastPage }) : null;
  const rows = data?.data ?? [];
  const scope = JSON.stringify([farm.id, access.revision, search, page]);
  const selected =
    selection?.scope === scope
      ? selection.products.filter((product) => rows.some((row) => sameSource(row, product)))
      : [];
  // Prune stale snapshots before rendering so returning to a prior page or version cannot revive them.
  if (selection && selected.length !== selection.products.length)
    setSelection(selected.length > 0 ? { scope, products: selected } : undefined);
  if (confirmation && (confirmation.scope !== scope || access.error || accessLost))
    setConfirmation(undefined);

  const intentKey = removeWrite.intent?.payload.idempotency_key;
  const intentProducts =
    intentKey && intentKey !== dismissedIntent ? removeWrite.intent?.products : undefined;
  const dialogProducts =
    intentProducts ?? (confirmation?.scope === scope ? confirmation.products : undefined);
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const removalLocked =
    removeWrite.blocked || removeWrite.unresolved || Boolean(removeWrite.failure);
  const selectionLocked =
    removalLocked || !query.isSuccess || query.isFetching || Boolean(lastHref);
  const confirmationStale = Boolean(
    confirmation?.products.some((product) => !rows.some((row) => sameSource(row, product))),
  );

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

  function selectProducts(products: readonly FarmProduct[]) {
    if (!selectionLocked) setSelection(products.length > 0 ? { scope, products } : undefined);
  }

  function openRemoval() {
    if (removeWrite.unresolved || removeWrite.failure) {
      setDismissedIntent(undefined);
    } else if (!selectionLocked && selected.length > 0) {
      setConfirmation({ scope, products: selected });
    }
  }

  function closeRemoval() {
    if (removeWrite.pending) return;
    if (intentKey) setDismissedIntent(intentKey);
    if ((removeWrite.failure && !removeWrite.unresolved) || confirmationStale)
      setSelection(undefined);
    setConfirmation(undefined);
    removeWrite.clearFailure();
  }

  function removed(count: number) {
    setConfirmation(undefined);
    setSelection(undefined);
    toast(
      count === 1
        ? c.removedOneProduct
        : c.removedProducts.replace("{count}", quantity.format(count)),
    );
  }

  if (!currentSession() || access.error || accessLost) return null;
  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={520}
      role="region"
      aria-label={c.productsAndSupply}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
    >
      <Table aria-label={c.productsAndSupply} aria-busy={query.isFetching || undefined}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" w={44}>
              {!initialLoading && (
                <Checkbox
                  aria-label={c.selectPageProducts}
                  checked={allSelected}
                  indeterminate={!allSelected && selected.length > 0}
                  disabled={selectionLocked || rows.length === 0}
                  onChange={(event) => selectProducts(event.currentTarget.checked ? rows : [])}
                />
              )}
            </Table.Th>
            <Table.Th scope="col">{c.productColumn}</Table.Th>
            <Table.Th scope="col">{c.saleUnit}</Table.Th>
            <Table.Th scope="col">{c.currentStock}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading ? (
            <TableSkeletonRows columns={4} height={36} />
          ) : (
            rows.map((row) => {
              const name = locale === "vi" ? row.name_vi : row.name_en;
              const picked = selected.some((product) => sameSource(row, product));
              return (
                <Table.Tr key={row.id} data-selected={picked || undefined}>
                  <Table.Td>
                    <Checkbox
                      aria-label={c.selectProduct.replace("{name}", name).replace("{sku}", row.sku)}
                      checked={picked}
                      disabled={selectionLocked}
                      onChange={(event) =>
                        selectProducts(
                          event.currentTarget.checked
                            ? [...selected, row]
                            : selected.filter((product) => !sameSource(row, product)),
                        )
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                      <DataListRecordLink
                        component={AdminNavigationLink}
                        href={farmHref(params, { id: farm.id, productId: row.product_id })}
                      >
                        {name}
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
                  <Table.Td>{quantity.format(row.available_quantity)}</Table.Td>
                </Table.Tr>
              );
            })
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
        refresh={{
          label: c.refreshSupply,
          onRefresh: async () => {
            await Promise.all([query.refetch({ cancelRefetch: false }), onRefreshFarm?.()]);
          },
          loading: query.isFetching && Boolean(data),
          disabled: initialLoading,
        }}
        wrapPrimaryAction
        primaryAction={
          <Group gap="xs" wrap="wrap" justify="flex-end">
            <Button
              ref={addButton}
              variant="default"
              onClick={() => setAddOpen(true)}
              disabled={
                removeWrite.unresolved ||
                linkWrite.pending ||
                (!linkWrite.unresolved && (linkWrite.blocked || !query.isSuccess))
              }
            >
              {c.addProduct}
            </Button>
            <Button
              ref={removeButton}
              variant="light"
              color="danger"
              onClick={openRemoval}
              disabled={
                removeWrite.pending || (!intentKey && (selectionLocked || selected.length === 0))
              }
            >
              {selected.length > 0
                ? `${c.removeProducts} (${quantity.format(selected.length)})`
                : c.removeProducts}
            </Button>
            {canAddSupply &&
            !removeWrite.unresolved &&
            !linkWrite.blocked &&
            !linkWrite.unresolved ? (
              <Button
                component={AdminNavigationLink}
                href={farmHref(params, { id: farm.id, bulk: true })}
              >
                {c.addSupply}
              </Button>
            ) : (
              <Button disabled>{c.addSupply}</Button>
            )}
          </Group>
        }
      />
      <DataListPaper>
        {Boolean(data?.data.length) && table}
        <Box p={showingError ? "md" : undefined}>
          <ListState
            embedded
            loadingPlaceholder={table}
            empty={c.linkedEmpty}
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
      {isTabActive && dialogProducts && (
        <FarmProductBulkRemoveDialog
          products={dialogProducts}
          write={removeWrite}
          stale={confirmationStale}
          confirmDisabled={selectionLocked}
          onCancel={closeRemoval}
          onConfirmed={removed}
          returnFocusRef={removeButton}
          fallbackFocusRef={addButton}
        />
      )}
    </Stack>
  );
}
