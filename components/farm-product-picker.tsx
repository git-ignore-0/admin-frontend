"use client";

import { Alert, Box, Button, Checkbox, Divider, Stack, Table, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
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
import { normalizeFarmSupplySearch } from "@/lib/farm-navigation";
import {
  farmAccessDenied,
  farmListCanShowData,
  farmSupplyKey,
  retireFarmAccess,
} from "@/lib/farm-query";
import { listAvailableFarmProducts, MAX_FARM_PRODUCT_LINKS } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { AvailableFarmProduct, LinkableFarmProduct } from "@/lib/types";
import type { FarmProductLinkWrite } from "@/lib/use-farm-product-link-write";
import styles from "./farm-product-picker.module.css";

type Selection = {
  row: LinkableFarmProduct;
  reviewedFailure?: FarmProductLinkWrite["failure"];
};

function isLinkableProduct(
  row: AvailableFarmProduct | LinkableFarmProduct,
): row is LinkableFarmProduct {
  return "link_state" in row;
}

function catalogConflict(
  chosen: LinkableFarmProduct,
  rows: readonly LinkableFarmProduct[],
  complete: boolean,
) {
  const latest = rows.find(({ id }) => id === chosen.id);
  if (!latest) return complete ? "not_found" : undefined;
  const expected = chosen.removed_source;
  const source = latest.removed_source;
  if (expected?.id !== source?.id) return "farm_product_identity_changed";
  if (
    expected?.version !== source?.version ||
    expected?.supply_generation !== source?.supply_generation
  )
    return "farm_product_version_conflict";
}

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
  const client = useQueryClient();
  const pickerId = useId();
  const reviewButton = useRef<HTMLButtonElement>(null);
  const currentSession = useIsAdminQueryScopeCurrent();
  const submittedRows = write.intent?.kind === "link" ? write.intent.products : [];
  const [selection, setSelection] = useState(
    () =>
      new Map<string, Selection>(
        submittedRows.filter(isLinkableProduct).map((row) => [row.id, { row }]),
      ),
  );
  const [reviewing, setReviewing] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [catalogIssues, setCatalogIssues] = useState(() => new Map<string, string>());
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
    if (!querySafe || !data || write.unresolved) return;
    setCatalogIssues((previous) => {
      const next = new Map(previous);
      for (const { row } of selection.values()) {
        // Absence is only evidence when this page represents the entire catalog.
        const issue = catalogConflict(row, data.data, catalogComplete);
        if (issue) next.set(row.id, issue);
      }
      return [...next].every(([id, issue]) => previous.get(id) === issue) ? previous : next;
    });
  }, [catalogComplete, data, querySafe, selection, write.unresolved]);
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
  const locked = write.unresolved || write.blocked;
  const rows = data?.data ?? [];
  const issueFor = (id: string) => {
    const item = selection.get(id);
    if (!item) return undefined;
    return (
      (item.reviewedFailure !== failure ? failure?.itemCodes[id] : undefined) ??
      catalogIssues.get(id) ??
      (querySafe ? catalogConflict(item.row, rows, catalogComplete) : undefined)
    );
  };
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
  const loading = !reviewing && !data && (query.isPending || query.isFetching);
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

  function select(products: LinkableFarmProduct[], checked: boolean) {
    if (locked || (checked && !querySafe)) return;
    setSelection((previous) => {
      const next = new Map(previous);
      for (const row of products) {
        if (!checked) next.delete(row.id);
        else if (!next.has(row.id)) next.set(row.id, { row, reviewedFailure: failure });
      }
      return next.size <= MAX_FARM_PRODUCT_LINKS ? next : previous;
    });
    if (!checked) {
      setCatalogIssues((previous) => {
        const next = new Map(previous);
        for (const { id } of products) next.delete(id);
        return next.size === previous.size ? previous : next;
      });
    }
  }

  function saved(intent: NonNullable<FarmProductLinkWrite["intent"]>) {
    if (intent.kind !== "link") return;
    const count = intent.products.length;
    toast(count === 1 ? c.addedOneProduct : c.addedProducts.replace("{count}", String(count)));
    onClose();
  }

  const displayedRows = reviewing ? [...selection.values()].map(({ row }) => row) : rows;
  const reviewMessage = (code: string) => {
    if (code === "farm_product_removed" || code === "farm_product_identity_changed")
      return c.productSourceChanged;
    if (code === "farm_product_version_conflict") return c.productSourceRevisionChanged;
    if (code === "product_already_linked" || code === "farm_product_not_removed")
      return c.alreadyLinked;
    if (code === "product_inactive" || code === "product_not_selling") return c.productDeactivated;
    return c.productUnavailable;
  };

  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={300}
      role="region"
      aria-label={reviewing ? c.selectedProductReview : c.productColumn}
      aria-hidden={loading || undefined}
      tabIndex={loading ? undefined : 0}
    >
      <Table
        aria-label={reviewing ? c.selectedProductReview : c.productColumn}
        aria-busy={loading || undefined}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" w={44}>
              {!reviewing && (
                <Checkbox
                  aria-label={c.selectPageProducts}
                  checked={allChecked}
                  indeterminate={partial}
                  disabled={
                    locked || !querySafe || !selectable.length || (!allChecked && !fitsPage)
                  }
                  onChange={(event) => select(selectable, event.currentTarget.checked)}
                />
              )}
            </Table.Th>
            <Table.Th scope="col">{c.productColumn}</Table.Th>
            <Table.Th scope="col">{c.saleUnit}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading ? (
            <TableSkeletonRows columns={3} height={36} />
          ) : (
            displayedRows.map((row) => {
              const name = locale === "vi" ? row.name_vi : row.name_en;
              const selected = selection.has(row.id);
              const issue = issueFor(row.id);
              const describedBy = issue ? `${pickerId}-${row.id}` : undefined;
              const label = reviewing ? c.unselectProduct : c.selectProduct;
              return (
                <Table.Tr key={row.id} data-selected={selected || undefined}>
                  <Table.Td>
                    <Checkbox
                      aria-label={label.replace("{name}", name).replace("{sku}", row.sku)}
                      aria-invalid={Boolean(issue) || undefined}
                      aria-describedby={describedBy}
                      checked={selected}
                      disabled={locked || (!reviewing && !querySafe) || (!selected && atLimit)}
                      onChange={(event) => select([row], event.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                      <Text fw={600}>{name}</Text>
                      <Text c="dimmed" size="sm">
                        {row.sku}
                        {row.link_state === "removed" && ` · ${c.previouslySupplied}`}
                      </Text>
                      {issue && (
                        <Text id={describedBy} c="danger" size="sm">
                          {reviewMessage(issue)}
                        </Text>
                      )}
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
      ? requestErrorMessage(failure.cause, t, {
          items: c.productColumn,
          product_ids: c.productColumn,
        })
      : failure?.kind === "conflict" || invalidSelection
        ? c.reviewProductSelection
        : undefined;
  const count = write.unresolved ? submittedRows.length : selection.size;
  const summary = c.selectedProducts.replace("{count}", String(count));

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
        <Box className={styles.summary} me="auto" role="status">
          {write.unresolved || (!count && !reviewing) ? (
            <Text size="sm">{summary}</Text>
          ) : (
            <Button
              ref={reviewButton}
              variant="subtle"
              size="compact-sm"
              type="button"
              aria-pressed={reviewing}
              aria-controls={pickerId}
              onClick={() => setReviewing(!reviewing)}
            >
              {summary}
            </Button>
          )}
        </Box>
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
          void write.submit(
            { kind: "link", products: [...selection.values()].map(({ row }) => row) },
            saved,
          );
        }
      }}
    >
      <FarmProductLinkRecovery write={write} onSuccess={saved} />
      {error && !write.unresolved && (
        <Alert color="danger" role="alert">
          {error}
        </Alert>
      )}
      {!write.unresolved && (
        <>
          {reviewing ? (
            <Box>
              <Button
                variant="default"
                type="button"
                onClick={() => {
                  setReviewing(false);
                  reviewButton.current?.focus();
                }}
              >
                {c.backToAvailableProducts}
              </Button>
            </Box>
          ) : (
            <ListToolbar
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
          )}
          <DataListPaper id={pickerId}>
            {displayedRows.length > 0 && table}
            <Box p={!reviewing && query.error ? "md" : undefined}>
              <ListState
                embedded
                empty={reviewing ? c.noSelectedProducts : c.availableProductsEmpty}
                noResults={!reviewing && search ? c.noCatalogMatch : undefined}
                hasData={reviewing || Boolean(data)}
                isEmpty={(reviewing || Boolean(data)) && !displayedRows.length}
                loading={loading}
                loadingPlaceholder={table}
                loadingLabel={c.loadingSupply}
                error={!reviewing && query.error ? requestErrorMessage(query.error, t) : ""}
                onRetry={() => void refetch()}
                retryLabel={t.common.retry}
              />
            </Box>
            {!reviewing && data && (
              <>
                <Divider />
                <Box px="md" py="sm">
                  <Pagination
                    page={page}
                    pageSize={data.meta.page_size}
                    total={data.meta.total}
                    disabled={query.isFetching || page > lastPage}
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
          {!reviewing && (atLimit || !fitsPage) && (
            <Text size="sm" c="dimmed" role="status">
              {c.productLinkLimit.replace("{limit}", String(MAX_FARM_PRODUCT_LINKS))}
            </Text>
          )}
        </>
      )}
    </ConfirmationDialog>
  );
}
