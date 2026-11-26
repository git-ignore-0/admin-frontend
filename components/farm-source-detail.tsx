"use client";

import { Alert, Anchor, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmBatchDialog } from "@/components/farm-batch-dialog";
import { FarmStockBatches } from "@/components/farm-stock-batches";
import { ListState } from "@/components/list-state";
import { DataState, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import { farmHref } from "@/lib/farm-navigation";
import { farmSupplyKey } from "@/lib/farm-query";
import { listFarmProductHistory } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { farmSourceQuery } from "@/lib/farm-supply-query";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { Farm, FarmProductHistoryEntry, FarmSourceBlocker } from "@/lib/types";
import {
  sameFarmSourceRevision,
  useFarmSourceWrite,
  type FarmSupplyAction,
} from "@/lib/use-farm-source-write";

type Props = { farm: Farm; productId: string; onAccessLost?: (cause: unknown) => void };

export function FarmSourceDetail(props: Props) {
  return <SourceDetail key={`${props.farm.id}:${props.productId}`} {...props} />;
}

function SourceDetail({ farm, productId, onAccessLost }: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const currentSession = useIsAdminQueryScopeCurrent();
  const toast = useToast();
  const params = useSearchParams();
  const query = useQuery(farmSourceQuery(farm.id, productId));
  const write = useFarmSourceWrite(farm.id, productId, onAccessLost);
  const [action, setAction] = useState<FarmSupplyAction | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const denied = isProtectedDataError(query.error);
  const notFound = (query.error as ClientApiError | null)?.status === 404;
  const source = denied
    ? undefined
    : notFound
      ? write.failure
        ? action?.source
        : undefined
      : query.data;
  const hasVerifiedSource = Boolean(source) && !notFound;
  const productName =
    source && !notFound ? (locale === "vi" ? source.name_vi : source.name_en) : c.sourceDetail;
  const farmName = locale === "vi" ? farm.name_vi : farm.name_en;
  const pathname = farmHref(null, { id: farm.id, productId });
  const farmListHref = farmHref(params);
  const farmHrefWithContext = farmHref(params, { id: farm.id, tab: "products" });
  const breadcrumbs = useMemo(
    () => [
      { label: c.list, href: farmListHref },
      { label: farmName, href: farmHrefWithContext },
      { label: productName },
    ],
    [c.list, farmListHref, farmName, farmHrefWithContext, productName],
  );

  useEffect(() => {
    if (denied) onAccessLost?.(query.error);
  }, [denied, query.error, onAccessLost]);

  useEffect(() => {
    if (hasVerifiedSource && document.activeElement === document.body)
      heading.current?.focus({ preventScroll: true });
  }, [hasVerifiedSource]);

  if (!currentSession() || denied) return null;

  const breadcrumb = (
    <AdminBreadcrumbForRoute
      pathname={pathname}
      search={params?.toString() ?? ""}
      items={breadcrumbs}
    />
  );
  if (!source) {
    return (
      <>
        {breadcrumb}
        {query.isPending ? (
          <DataState kind="loading" title={c.loadingSource} />
        ) : (
          <RecoveryAlert
            message={
              write.failure?.type === "uncertain"
                ? c.stillUnconfirmed
                : notFound
                  ? c.sourceMissing
                  : requestErrorMessage(query.error, t)
            }
            retryLabel={c.checkLatestFarm}
            onRetry={() => (write.failure ? write.recover() : void query.refetch())}
            loading={query.isFetching || write.checking}
          />
        )}
      </>
    );
  }

  const active = source.supply_status === "supplying";
  const caps = source.capabilities;
  const stale = Boolean(action && !sameFarmSourceRevision(source, action.source));
  const unresolved = Boolean(write.failure && write.failure.type !== "rejected");
  const busy = write.pending || write.checking;
  const locked = Boolean(query.error) || query.isFetching || write.isWriting || busy || unresolved;
  const comparable =
    write.review === "matches" ||
    write.review === "changed" ||
    (write.review === "batch_missing" &&
      (write.attemptedKind === "create" || write.attemptedKind === "readd"));
  const blocked =
    locked ||
    stale ||
    (action?.kind === "remove" && !caps.can_remove) ||
    (action?.kind === "create" && !caps.can_create_batch) ||
    (action?.kind === "readd" && !caps.can_readd);
  const openAllocations = caps.blockers.remove;
  const newBlocker = write.failure?.blocker;
  const stockReserved =
    write.failure?.cause instanceof Error && write.failure.cause.message === "stock_reserved";
  const stockSold =
    write.failure?.cause instanceof Error && write.failure.cause.message === "stock_sold";
  const localizedError =
    write.failure?.type === "rejected"
      ? stockReserved
        ? c.stockReserved
        : stockSold
          ? c.stockSold
          : requestErrorMessage(write.failure.cause, t, {
              start_date: c.startDate,
              end_date: c.endDate,
              quantity_units: c.quantityUnits,
            })
      : stale && !unresolved
        ? c.supplyWriteConflict
        : undefined;
  const messages = {
    remove: c.removedProduct,
    readd: c.readdedProduct,
    create: c.savedBatch,
    edit: c.savedBatch,
    cancel: c.cancelledBatch,
  };

  function close() {
    setAction(null);
    write.reset();
  }

  function dismiss() {
    setAction(null);
    if (!unresolved || comparable) write.reset();
  }

  function begin(next: FarmSupplyAction) {
    if (locked) return;
    write.reset();
    setAction(next);
  }

  function confirm(input?: Parameters<typeof write.submit>[2]) {
    if (!action || blocked) return;
    void write.submit(
      action,
      () => {
        toast(messages[action.kind]);
        close();
      },
      input,
    );
  }

  const feedback = unresolved ? (
    <Stack gap="sm" align="flex-start">
      {newBlocker && <SourceBlocker blocker={newBlocker} />}
      {!comparable && !write.checking && (
        <RecoveryAlert
          message={
            write.failure?.type === "uncertain" ? c.supplyWriteUnconfirmed : c.supplyWriteConflict
          }
          retryLabel={c.checkLatestFarm}
          onRetry={write.recover}
        />
      )}
      {write.checking && (
        <Text size="sm" role="status">
          {c.loadingSource}
        </Text>
      )}
      {write.review && (
        <Text size="sm" role="status">
          {write.review === "matches"
            ? c.observedExpected
            : write.review === "changed"
              ? c.reviewCurrent
              : write.review === "batch_missing"
                ? c.batchRecoveryLimited
                : c.stillUnconfirmed}
        </Text>
      )}
      {comparable && (
        <Button variant="default" onClick={close}>
          {c.closeAndReview}
        </Button>
      )}
    </Stack>
  ) : null;

  return (
    <Stack gap="md" miw={0}>
      {breadcrumb}
      {query.error && (
        <RecoveryAlert
          message={requestErrorMessage(query.error, t)}
          retryLabel={c.checkLatestFarm}
          onRetry={() => void query.refetch()}
        />
      )}
      {!notFound && (
        <>
          <Paper p="md" miw={0}>
            <Stack gap="md">
              <Group component="header" justify="space-between" align="flex-start" gap="sm">
                <Stack gap="xs" miw={0}>
                  <Title ref={heading} tabIndex={-1} order={1} style={{ overflowWrap: "anywhere" }}>
                    {productName}
                  </Title>
                  <Text c="dimmed" size="sm" style={{ overflowWrap: "anywhere" }}>
                    {source.sku} · {formatDecimalInput(source.unit_size)}{" "}
                    {locale === "vi" ? source.unit_label_vi : source.unit_label_en}
                  </Text>
                  <Group gap="xs">
                    <Status
                      domain="farm-stock"
                      status={active ? "active" : "inactive"}
                      label={active ? c.productActive : c.productRemoved}
                    />
                    {source.product_status !== "active" && (
                      <ProductLifecycleStatus status={source.product_status} />
                    )}
                  </Group>
                </Stack>
                <Group gap="xs">
                  {active && caps.can_create_batch && (
                    <Button disabled={locked} onClick={() => begin({ kind: "create", source })}>
                      {c.addBatch}
                    </Button>
                  )}
                  {active && caps.can_remove && (
                    <Button
                      color="red"
                      variant="subtle"
                      disabled={locked}
                      onClick={() => begin({ kind: "remove", source })}
                    >
                      {c.removeLink}
                    </Button>
                  )}
                  {!active && caps.can_readd && (
                    <Button disabled={locked} onClick={() => begin({ kind: "readd", source })}>
                      {c.readdProduct}
                    </Button>
                  )}
                </Group>
              </Group>
              {active && (
                <Stack gap={4}>
                  <Text size="sm">
                    {c.currentStock}:{" "}
                    <Text span fw={600} inherit>
                      {new Intl.NumberFormat(locale).format(source.available_quantity)}
                    </Text>
                  </Text>
                  <Text size="xs" c="dimmed">
                    {c.currentStockHint}
                  </Text>
                </Stack>
              )}
              {active && !caps.can_remove && <SourceBlocker blocker={openAllocations} />}
              {active && !caps.can_create_batch && (
                <Text size="sm" c="dimmed">
                  {caps.blockers.create_batch?.code === "product_not_selling"
                    ? c.createNotSelling
                    : c.actionUnavailable}
                </Text>
              )}
              {!active && !caps.can_readd && (
                <Alert color="gray">
                  {caps.blockers.readd?.code === "product_not_selling"
                    ? c.readdNotSelling
                    : c.actionUnavailable}
                </Alert>
              )}
            </Stack>
          </Paper>
          <Paper p="md" miw={0}>
            <FarmStockBatches
              source={source}
              locked={locked}
              onAccessLost={onAccessLost}
              onEdit={(batch, filter) => begin({ kind: "edit", source, batch, filter })}
              onCancel={(batch, filter) => begin({ kind: "cancel", source, batch, filter })}
            />
          </Paper>
          <Paper p="md" miw={0}>
            <Stack gap="sm" align="stretch">
              <Group justify="space-between" gap="sm">
                <Title order={3} size="h4">
                  {c.history}
                </Title>
                <Button
                  size="sm"
                  variant="default"
                  aria-expanded={historyOpen}
                  onClick={() => setHistoryOpen((open) => !open)}
                >
                  {historyOpen ? c.hideHistory : c.showHistory}
                </Button>
              </Group>
              {historyOpen && (
                <FarmSourceHistory
                  farmId={farm.id}
                  productId={productId}
                  onAccessLost={onAccessLost}
                />
              )}
            </Stack>
          </Paper>
        </>
      )}
      {!action && feedback}
      {action && (action.kind === "remove" || action.kind === "cancel") && (
        <ConfirmationDialog
          title={
            action.kind === "remove"
              ? c.productRemovePrompt.replace("{sku}", productName)
              : c.cancelBatch
          }
          busy={busy}
          busyLabel={c.saving}
          confirmLabel={action.kind === "remove" ? c.removeLink : c.cancelBatch}
          cancelLabel={c.cancel}
          confirmDisabled={blocked}
          error={localizedError}
          danger
          onCancel={dismiss}
          onConfirm={() => confirm()}
          fallbackFocusRef={heading}
        >
          <Text>
            {action.kind === "remove"
              ? c.removeConfirmBody
              : c.cancelBatchConfirm
                  .replace("{start}", formatAdminDate(action.batch.start_date))
                  .replace("{end}", formatAdminDate(action.batch.end_date))}
          </Text>
          {feedback}
        </ConfirmationDialog>
      )}
      {action && action.kind !== "remove" && action.kind !== "cancel" && (
        <FarmBatchDialog
          title={
            action.kind === "edit"
              ? c.editBatch
              : action.kind === "create"
                ? c.addBatch
                : c.readdProduct
          }
          confirmLabel={
            action.kind === "edit" ? c.save : action.kind === "create" ? c.addBatch : c.readdProduct
          }
          product={action.source}
          batch={action.kind === "edit" ? action.batch : undefined}
          restrictIncrease={source.product_status !== "active"}
          blocked={
            blocked ||
            (action.kind === "create" && !caps.can_create_batch) ||
            (action.kind === "readd" && !caps.can_readd)
          }
          busy={busy}
          error={localizedError}
          onCancel={dismiss}
          onSubmit={confirm}
          feedback={feedback}
          fallbackFocusRef={heading}
        >
          {action.kind === "readd" && <Text size="sm">{c.readdExplain}</Text>}
        </FarmBatchDialog>
      )}
    </Stack>
  );
}

function SourceBlocker({ blocker }: { blocker?: FarmSourceBlocker }) {
  const { locale } = useAdminI18n();
  const c = farmsCopy(locale);
  const { code, context } = blocker ?? {};
  const quantity = new Intl.NumberFormat(locale);
  if (code === "farm_product_has_open_allocations" && context && "orders" in context) {
    return (
      <Alert color="orange">
        <Stack gap="xs">
          <Text size="sm">{c.openAllocations}</Text>
          <Group gap="sm">
            {context.orders.map((order) => (
              <Anchor
                key={order.id}
                component={AdminNavigationLink}
                href={`/store-orders/${order.id}`}
                size="sm"
              >
                {order.reference_code}
              </Anchor>
            ))}
          </Group>
          {context.has_more && <Text size="sm">{c.moreOrders}</Text>}
        </Stack>
      </Alert>
    );
  }
  if (code === "farm_product_supply_shortfall" && context && "required_units" in context) {
    return (
      <Alert color="orange">
        {c.supplyShortfall
          .replace("{required}", quantity.format(context.required_units))
          .replace("{remaining}", quantity.format(context.remaining_units))
          .replace("{shortfall}", quantity.format(context.shortfall_units))}
      </Alert>
    );
  }
  return <Alert color="orange">{c.actionUnavailable}</Alert>;
}

function FarmSourceHistory({
  farmId,
  productId,
  onAccessLost,
}: {
  farmId: string;
  productId: string;
  onAccessLost?: (cause: unknown) => void;
}) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: [...farmSupplyKey(farmId), "history", productId, page],
    queryFn: ({ signal }) => listFarmProductHistory(farmId, productId, { page }, signal),
  });
  const denied = isProtectedDataError(history.error);
  useEffect(() => {
    if (denied) onAccessLost?.(history.error);
  }, [denied, onAccessLost, history.error]);

  if (denied) return null;
  const data = history.error ? undefined : history.data;
  const labels: Record<FarmProductHistoryEntry["action"], string> = {
    "farm.product.add": c.historyAdd,
    "farm.product.remove": c.historyRemove,
    "farm.product.readd": c.historyReadd,
    "farm.product.lifecycle_backfill": c.historyBackfill,
    "farm.product.update": c.historyUpdate,
    "farm.product.delete": c.historyDelete,
  };
  return (
    <>
      {Boolean(data?.data.length) && (
        <Table.ScrollContainer
          type="native"
          minWidth={460}
          role="region"
          aria-label={c.history}
          tabIndex={0}
        >
          <Table aria-label={c.history} aria-busy={history.isFetching || undefined}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th scope="col">{c.historyAction}</Table.Th>
                <Table.Th scope="col">{c.historyTime}</Table.Th>
                <Table.Th scope="col">{c.historyActor}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.data.map((event) => (
                <Table.Tr key={event.id}>
                  <Table.Td>{labels[event.action]}</Table.Td>
                  <Table.Td>
                    {formatAdminDateTime(event.context.classified_at ?? event.created_at)}
                  </Table.Td>
                  <Table.Td>{event.actor?.name || "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <ListState
        embedded
        loading={history.isPending}
        loadingLabel={c.loadingSupply}
        hasData={Boolean(data)}
        isEmpty={data?.data.length === 0}
        empty={c.historyEmpty}
        error={history.error ? requestErrorMessage(history.error, t) : ""}
        onRetry={() => void history.refetch()}
        retryLabel={t.common.retry}
      />
      {data && data.meta.total > data.meta.page_size && (
        <Pagination
          page={page}
          pageSize={data.meta.page_size}
          total={data.meta.total}
          disabled={history.isFetching}
          onPage={setPage}
          previousLabel={t.common.previous}
          nextLabel={t.common.next}
          summary={t.common.pagination}
          resultCountLabel={t.common.resultCount}
          resultCountSingularLabel={t.common.resultCountSingular}
        />
      )}
    </>
  );
}
