"use client";

import { Alert, Box, Button, Checkbox, Divider, Group, Stack, Table, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type RefObject } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DataListPaper } from "@/components/data-list-paper";
import { FarmProductLinkRecovery } from "@/components/farm-product-link-recovery";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { useToast } from "@/components/toast-provider";
import { requestErrorMessage } from "@/lib/client-error";
import { farmHref, normalizeFarmSupplySearch } from "@/lib/farm-navigation";
import {
  farmAccessDenied,
  farmListCanShowData,
  farmSupplyKey,
  retireFarmAccess,
} from "@/lib/farm-query";
import { listAvailableFarmProducts, MAX_FARM_PRODUCT_LINKS } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { AvailableFarmProduct } from "@/lib/types";
import type { FarmProductLinkWrite } from "@/lib/use-farm-product-link-write";

export function FarmProductPicker({
  farmId,
  write,
  onClose,
  onAccessLost,
  returnFocusRef,
}: {
  farmId: string;
  write: FarmProductLinkWrite;
  onClose: () => void;
  onAccessLost?: (cause: unknown) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const toast = useToast();
  const params = useSearchParams();
  const client = useQueryClient();
  const pickerId = useId();
  const currentSession = useIsAdminQueryScopeCurrent();
  const [selection, setSelection] = useState(
    () =>
      new Map(
        write.intent?.kind === "link" ? write.intent.products.map((row) => [row.id, row]) : [],
      ),
  );
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [unavailable, setUnavailable] = useState(() => new Set<string>());
  const key = [...farmSupplyKey(farmId), "available", search, page];
  const query = useQuery({
    queryKey: key,
    enabled: !write.unresolved,
    queryFn: ({ signal }) => listAvailableFarmProducts(farmId, { search, page }, signal),
  });
  const denial = farmAccessDenied(query.error) ? query.error : null;
  const data = farmListCanShowData(query.error) ? query.data : undefined;
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size)) : page;
  const querySafe = query.isSuccess && !query.isFetching && page <= lastPage;
  const catalogComplete =
    !search && page === 1 && Boolean(data && data.meta.total === data.data.length);
  useEffect(() => {
    if (!querySafe || !data) return;
    const present = new Set(data.data.map(({ id }) => id));
    setUnavailable((previous) => {
      // A search result can confirm presence. Only the full catalog can prove absence.
      const next = new Set(
        [...selection.keys()].filter(
          (id) => !present.has(id) && (catalogComplete || previous.has(id)),
        ),
      );
      return next.size === previous.size && [...next].every((id) => previous.has(id))
        ? previous
        : next;
    });
  }, [catalogComplete, data, querySafe, selection]);
  useEffect(() => {
    if (!query.error && page > lastPage) setPage(lastPage);
  }, [lastPage, page, query.error]);
  useEffect(() => {
    if (denial && currentSession()) {
      retireFarmAccess(client, denial);
      onAccessLost?.(denial);
    }
  }, [client, currentSession, denial, onAccessLost]);

  if (!currentSession() || denial) return null;

  const failure = write.failure;
  const recovering = failure?.kind === "unknown";
  const locked = write.unresolved || write.blocked;
  const rows = data?.data ?? [];
  const issueFor = (id: string) =>
    failure?.itemCodes[id] ??
    (unavailable.has(id) || (querySafe && catalogComplete && !rows.some((row) => row.id === id))
      ? "not_found"
      : undefined);
  const selectable = rows.filter(({ id }) => !issueFor(id));
  const selectedOnPage = selectable.filter(({ id }) => selection.has(id)).length;
  const allChecked = selectable.length > 0 && selectedOnPage === selectable.length;
  const partial = selectedOnPage > 0 && !allChecked;
  const atLimit = selection.size >= MAX_FARM_PRODUCT_LINKS;
  const fitsPage = selection.size + selectable.length - selectedOnPage <= MAX_FARM_PRODUCT_LINKS;
  const invalidSelection = [...selection.keys()].some(issueFor);
  const canSubmit =
    !locked &&
    querySafe &&
    selection.size > 0 &&
    !invalidSelection &&
    failure?.kind !== "idempotency_conflict" &&
    selection.size <= MAX_FARM_PRODUCT_LINKS;
  const loading = !data && (query.isPending || query.isFetching);
  const refetch = () => query.refetch({ cancelRefetch: false }).then(() => undefined);

  function applySearch(value: string) {
    const normalized = normalizeFarmSupplySearch(value);
    setDraft(normalized);
    if (normalized === search && page === 1) void refetch();
    else {
      setSearch(normalized);
      setPage(1);
    }
  }

  function select(products: AvailableFarmProduct[], checked: boolean) {
    if (locked) return;
    setSelection((previous) => {
      const next = new Map(previous);
      for (const row of products) {
        if (checked) next.set(row.id, row);
        else next.delete(row.id);
      }
      return next.size <= MAX_FARM_PRODUCT_LINKS ? next : previous;
    });
  }

  function saved(intent?: FarmProductLinkWrite["intent"]) {
    const count = intent?.kind === "link" ? intent.products.length : selection.size;
    toast(count === 1 ? c.addedOneProduct : c.addedProducts.replace("{count}", String(count)));
    onClose();
  }

  const nameOf = (row: AvailableFarmProduct) => (locale === "vi" ? row.name_vi : row.name_en);
  const reviewMessage = (code: string) => {
    if (code === "farm_product_removed") return c.addPreviouslyRemoved;
    if (code === "product_already_linked") return c.alreadyLinked;
    if (code === "product_inactive" || code === "product_not_selling") return c.productDeactivated;
    return c.productUnavailable;
  };

  const table = (
    <Table.ScrollContainer type="native" minWidth={300} aria-hidden={loading || undefined}>
      <Table aria-label={c.productColumn} aria-busy={query.isFetching || undefined}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" w={44}>
              <Checkbox
                aria-label={c.selectPageProducts}
                checked={allChecked}
                indeterminate={partial}
                disabled={locked || !querySafe || !selectable.length || (!allChecked && !fitsPage)}
                onChange={(event) => select(selectable, event.currentTarget.checked)}
              />
            </Table.Th>
            <Table.Th scope="col">{c.productColumn}</Table.Th>
            <Table.Th scope="col">{c.saleUnit}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading ? (
            <TableSkeletonRows columns={3} height={36} />
          ) : (
            rows.map((row) => {
              const name = nameOf(row);
              const selected = selection.has(row.id);
              const invalid = selected && Boolean(issueFor(row.id));
              return (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <Checkbox
                      aria-label={c.selectProduct.replace("{name}", name).replace("{sku}", row.sku)}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? `${pickerId}-${row.id}` : undefined}
                      checked={selected}
                      disabled={
                        locked ||
                        !querySafe ||
                        (!selected && (atLimit || Boolean(issueFor(row.id))))
                      }
                      onChange={(event) => select([row], event.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                      <Text fw={600}>{name}</Text>
                      <Text c="dimmed" size="sm">
                        {row.sku}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td style={{ overflowWrap: "anywhere" }}>
                    {formatDecimalInput(row.unit_size)}{" "}
                    {locale === "vi" ? row.unit_label_vi : row.unit_label_en}
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
  const error =
    failure?.kind === "rejected"
      ? requestErrorMessage(failure.cause, t, { product_ids: c.productColumn })
      : failure?.kind === "conflict"
        ? c.reviewProductSelection
        : undefined;

  return (
    <ConfirmationDialog
      title={c.addProduct}
      size="xl"
      busy={write.pending}
      busyLabel={c.saving}
      cancelLabel={c.cancel}
      confirmLabel={c.addProduct}
      confirmDisabled={!canSubmit}
      returnFocusRef={returnFocusRef}
      footerSummary={
        <Text size="sm" me="auto" role="status">
          {c.selectedProducts.replace("{count}", String(selection.size))}
        </Text>
      }
      onCancel={() => {
        if (!write.unresolved) write.clearFailure();
        onClose();
      }}
      onConfirm={() => {
        const cached = client.getQueryState(key);
        if (
          canSubmit &&
          cached?.status === "success" &&
          cached.fetchStatus === "idle" &&
          !cached.isInvalidated
        ) {
          void write.submit({ kind: "link", products: [...selection.values()] }, saved);
        }
      }}
    >
      <FarmProductLinkRecovery write={write} onSuccess={saved} />
      {error && (
        <Alert color="danger" role="alert">
          {error}
        </Alert>
      )}
      {!recovering && (
        <>
          <ListToolbar
            busy={write.unresolved}
            growSearch
            search={{
              label: c.productSearch,
              placeholder: c.productPlaceholder,
              value: draft,
              onChange: setDraft,
              onSubmit: applySearch,
              submitLabel: c.searchButton,
            }}
            refresh={{
              label: c.refreshAvailable,
              onRefresh: refetch,
              loading: query.isFetching && Boolean(data),
            }}
          />
          <DataListPaper>
            {rows.length > 0 && table}
            <Box p={query.error ? "md" : undefined}>
              <ListState
                embedded
                empty={c.availableProductsEmpty}
                noResults={search ? c.noCatalogMatch : undefined}
                hasData={Boolean(data)}
                isEmpty={Boolean(data && !rows.length)}
                loading={loading}
                loadingPlaceholder={table}
                loadingLabel={c.loadingSupply}
                error={query.error ? requestErrorMessage(query.error, t) : ""}
                onRetry={() => void refetch()}
                retryLabel={t.common.retry}
              />
            </Box>
            {data && (
              <>
                <Divider />
                <Box px="md" py="sm">
                  <Pagination
                    page={page}
                    pageSize={data.meta.page_size}
                    total={data.meta.total}
                    disabled={query.isFetching || write.unresolved || page > lastPage}
                    onPage={setPage}
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
          {(atLimit || !fitsPage) && (
            <Text size="sm" c="dimmed" role="status">
              {c.productLinkLimit.replace("{limit}", String(MAX_FARM_PRODUCT_LINKS))}
            </Text>
          )}
        </>
      )}
      {selection.size > 0 && (
        <Stack component="ul" gap="xs" m={0} p={0} style={{ listStyle: "none" }}>
          {[...selection.values()].map((row) => {
            const name = nameOf(row);
            const code = issueFor(row.id);
            return (
              <Stack component="li" key={row.id} gap={4} style={{ overflowWrap: "anywhere" }}>
                <Group gap="xs" justify="space-between">
                  <Text size="sm">
                    {name} · {row.sku}
                  </Text>
                  <Button
                    aria-label={c.unselectProduct.replace("{name}", name).replace("{sku}", row.sku)}
                    variant="subtle"
                    size="compact-sm"
                    disabled={locked}
                    onClick={() => select([row], false)}
                  >
                    {c.deselectProduct}
                  </Button>
                </Group>
                {code && (
                  <Text id={`${pickerId}-${row.id}`} c="danger" size="sm">
                    {reviewMessage(code)}{" "}
                    {(code === "farm_product_removed" || code === "product_already_linked") && (
                      <Text
                        component={AdminNavigationLink}
                        td="underline"
                        c="primary"
                        inherit
                        href={farmHref(params, { id: farmId, productId: row.id })}
                      >
                        {c.openSource}
                      </Text>
                    )}
                  </Text>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
    </ConfirmationDialog>
  );
}
