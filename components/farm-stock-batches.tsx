"use client";
import {
  Alert,
  Button,
  Divider,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DataState, Status } from "@/components/nfv-controls";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { Pagination } from "@/components/pagination";
import { StockBatchFields } from "@/components/stock-batch-fields";
import { adminDateInputToIso, formatAdminDate } from "@/lib/admin-date";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import {
  cancelFarmStockBatch,
  createFarmStockBatch,
  listFarmStockBatches,
  updateFarmStockBatch,
} from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import {
  formatStockQuantityTotal,
  stockBatchDateDraft,
  stockBatchRangeForPreset,
  validateStockBatchInput,
  type StockBatchDraft,
  type StockBatchFieldErrors,
  type StockBatchPreset,
} from "@/lib/farm-stock";
import type { FarmProduct, FarmStockBatch, PaginationMeta, StockBatchStatus } from "@/lib/types";

import classes from "./farm-inventory.module.css";

const conflictCodes = new Set([
  "version_conflict",
  "stock_batch_changed",
  "stock_batch_cancelled",
  "stock_batch_expired",
  "stock_batch_start_locked",
  "farm_product_changed",
]);

function emptyDraft(): StockBatchDraft {
  return { ...stockBatchDateDraft(stockBatchRangeForPreset("week")), quantity: "" };
}

type Props = {
  farmId: string;
  product: FarmProduct;
  detailHeadingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSummaryChanged: () => void;
  onAccessLost: (caught: unknown) => void;
  summaryBusy: boolean;
  actions?: ReactNode;
};

export function FarmStockBatches({
  farmId,
  product,
  detailHeadingRef,
  onBack,
  onSummaryChanged,
  onAccessLost,
  summaryBusy,
  actions,
}: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const dictionary = useRef(t);
  dictionary.current = t;
  const unitLabel = locale === "vi" ? product.unit_label_vi : product.unit_label_en;
  const [rows, setRows] = useState<FarmStockBatch[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, page_size: 20, total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StockBatchStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const mutation = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<"new" | FarmStockBatch | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FarmStockBatch | null>(null);
  const [preset, setPreset] = useState<StockBatchPreset>("week");
  const [draft, setDraft] = useState<StockBatchDraft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<StockBatchFieldErrors>({});

  const load = useCallback(
    (signal: AbortSignal) =>
      listFarmStockBatches(
        farmId,
        product.product_id,
        { page, status: status || undefined },
        { signal, linkId: product.id },
      ),
    [farmId, page, product.id, product.product_id, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    load(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows(result.data);
        setMeta(result.meta ?? { page, page_size: 20, total: result.data.length });
        setReloadRequired(false);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        if (isProtectedDataError(caught)) {
          onAccessLost(caught);
          return;
        }
        setRows(null);
        setEditor(null);
        setCancelTarget(null);
        setError(requestErrorMessage(caught, dictionary.current));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, onAccessLost, page, retry]);

  const statusLabels = useMemo(
    () => ({
      upcoming: c.batchStatusUpcoming,
      active: c.batchStatusActive,
      expired: c.batchStatusExpired,
      cancelled: c.batchStatusCancelled,
    }),
    [c],
  );
  const canIncrease = product.product_status === "active";
  const actionsBlocked = summaryBusy || loading || busy || Boolean(error) || reloadRequired;
  const limits =
    !canIncrease && editor && editor !== "new"
      ? { start: editor.start_date, end: editor.end_date, quantity: editor.quantity_units }
      : undefined;
  const startDate = limits && adminDateInputToIso(draft.start_date);
  const endDate = limits && adminDateInputToIso(draft.end_date);
  const exceedsLimits = Boolean(
    limits &&
    ((startDate && startDate < limits.start) ||
      (endDate && endDate > limits.end) ||
      Number(draft.quantity) > limits.quantity),
  );
  const productStockLabel = c.availableUnits.replace("{count}", String(product.available_quantity));

  function openNew() {
    if (actionsBlocked || !canIncrease) return;
    setEditor("new");
    setPreset("week");
    setDraft(emptyDraft());
    setFieldErrors({});
    setActionError("");
  }

  function openEdit(batch: FarmStockBatch) {
    if (actionsBlocked) return;
    setEditor(batch);
    setPreset("custom");
    setDraft({
      ...stockBatchDateDraft(batch),
      quantity: String(batch.quantity_units),
    });
    setFieldErrors({});
    setActionError("");
  }

  function handleMutationError(caught: unknown) {
    if (isProtectedDataError(caught)) {
      onAccessLost(caught);
      return;
    }
    if (!(caught instanceof Error)) {
      setActionError(requestErrorMessage(caught, t));
      return;
    }
    const error = caught as ClientApiError;
    if (error.message === "product_not_selling" || error.message === "product_inactive") {
      setEditor(null);
      setCancelTarget(null);
      setActionError(t.storeCatalog.batchIncreaseBlocked);
      reloadFromFirstPage();
      onSummaryChanged();
      return;
    }
    if (error.message === "stock_reserved") {
      setActionError(c.stockReserved);
      return;
    }
    if (conflictCodes.has(error.message)) {
      setReloadRequired(true);
      setActionError(c.batchChanged);
      return;
    }
    if (
      error.status === 404 ||
      (error.status ?? 0) >= 500 ||
      ["invalid_response", "network_error", "request_timeout"].includes(error.message)
    ) {
      setReloadRequired(true);
    }
    setActionError(requestErrorMessage(caught, t));
  }

  function reloadAfterConflict() {
    setEditor(null);
    setCancelTarget(null);
    setActionError("");
    reloadFromFirstPage();
    onSummaryChanged();
  }

  function reloadFromFirstPage() {
    setLoading(true);
    if (page === 1) setRetry((value) => value + 1);
    else setPage(1);
  }

  async function save() {
    const validated = validateStockBatchInput(draft);
    setFieldErrors(validated.errors);
    if (
      !editor ||
      !validated.value ||
      mutation.current ||
      actionsBlocked ||
      exceedsLimits ||
      (editor === "new" && !canIncrease)
    )
      return;
    mutation.current = true;
    setBusy(true);
    setActionError("");
    try {
      if (editor === "new") {
        await createFarmStockBatch(farmId, product.product_id, validated.value, product.id);
      } else {
        await updateFarmStockBatch(
          farmId,
          product.product_id,
          editor.id,
          { ...validated.value, version: editor.version },
          product.id,
        );
      }
      if (!mounted.current) return;
      setEditor(null);
      reloadFromFirstPage();
      onSummaryChanged();
    } catch (caught) {
      if (mounted.current) handleMutationError(caught);
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function cancel() {
    if (!cancelTarget || mutation.current || actionsBlocked) return;
    mutation.current = true;
    setBusy(true);
    setActionError("");
    try {
      await cancelFarmStockBatch(
        farmId,
        product.product_id,
        cancelTarget.id,
        cancelTarget.version,
        product.id,
      );
      if (!mounted.current) return;
      setCancelTarget(null);
      reloadFromFirstPage();
      onSummaryChanged();
    } catch (caught) {
      if (mounted.current) handleMutationError(caught);
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Stack gap="md">
      <Button
        aria-label={c.backToProducts}
        className={classes.mobileBack}
        variant="subtle"
        onClick={onBack}
      >
        ← {c.backToProducts}
      </Button>
      <Group align="flex-start" justify="space-between" gap="sm">
        <Stack gap="xs" miw={0}>
          <Title
            order={3}
            ref={detailHeadingRef}
            tabIndex={-1}
            style={{ overflowWrap: "anywhere" }}
          >
            {c.stockBatches}: {locale === "vi" ? product.name_vi : product.name_en}
          </Title>
          <Text size="sm" c="dimmed">
            {c.stockBatchesHint}
          </Text>
          <Group gap="xs">
            <ProductLifecycleStatus status={product.product_status} />
            <Status
              domain="farm-stock"
              status={product.is_active ? "active" : "inactive"}
              label={product.is_active ? c.productActive : c.productInactive}
            />
            <Text size="sm">{productStockLabel}</Text>
          </Group>
        </Stack>
        {!error && (
          <Group gap="xs">
            <Button
              size="xs"
              onClick={openNew}
              disabled={!canIncrease || actionsBlocked}
              aria-describedby={!canIncrease && !summaryBusy ? "farm-stock-add-reason" : undefined}
            >
              {c.addBatch}
            </Button>
            {!actionsBlocked && actions}
          </Group>
        )}
      </Group>
      {!canIncrease && !summaryBusy && !error && (
        <Text size="sm" id="farm-stock-add-reason">
          {t.storeCatalog.batchIncreaseBlocked}
        </Text>
      )}
      {actionError && !editor && !cancelTarget && (
        <Alert color="danger" role="alert">
          {actionError}
          {reloadRequired && (
            <Button ml="xs" size="xs" variant="default" onClick={reloadAfterConflict}>
              {c.reload}
            </Button>
          )}
        </Alert>
      )}
      <Select
        role="combobox"
        label={c.batchStatus}
        maw="15rem"
        value={status}
        onChange={(value) => {
          if (status !== (value ?? "") || page !== 1) setLoading(true);
          setPage(1);
          setStatus((value ?? "") as StockBatchStatus | "");
        }}
        data={[
          { value: "", label: c.batchStatusAll },
          ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
        ]}
      />
      {error ? (
        <DataState
          kind="error"
          title={c.batchError}
          description={error}
          action={{ label: t.common.retry, onClick: reloadAfterConflict }}
        />
      ) : loading ? (
        <DataState kind="loading" title={c.loading} compact />
      ) : rows?.length ? (
        <Stack gap="xs">
          {rows.map((batch) => {
            const editable = batch.status === "active" || batch.status === "upcoming";
            return (
              <Paper component="article" p="sm" key={batch.id}>
                <SimpleGrid
                  type="container"
                  cols={{ base: 1, "25rem": 2, "40rem": 4 }}
                  spacing="sm"
                >
                  <Stack gap={4}>
                    <Text fw={600}>
                      {formatAdminDate(batch.start_date)} – {formatAdminDate(batch.end_date)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {c.batchInventory
                        .replace("{initial}", String(batch.quantity_units))
                        .replace("{sold}", String(batch.net_sold_quantity))
                        .replace("{remaining}", String(batch.remaining_quantity))
                        .replace("{available}", String(batch.available_quantity))}
                    </Text>
                  </Stack>
                  <Text component="strong" fw={600}>
                    {formatStockQuantityTotal(
                      batch.remaining_quantity,
                      product.unit_size,
                      unitLabel,
                    )}
                  </Text>
                  <Group align="flex-start" gap="xs">
                    <Status
                      domain="farm-stock"
                      status={batch.status}
                      label={statusLabels[batch.status]}
                    />
                  </Group>
                  <Group gap="xs" align="flex-start">
                    {editable ? (
                      <>
                        <Button
                          size="xs"
                          variant="subtle"
                          disabled={actionsBlocked}
                          onClick={() => openEdit(batch)}
                        >
                          {c.edit}
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          disabled={actionsBlocked}
                          onClick={() => {
                            if (actionsBlocked) return;
                            setActionError("");
                            setCancelTarget(batch);
                          }}
                        >
                          {c.cancelBatch}
                        </Button>
                      </>
                    ) : null}
                  </Group>
                </SimpleGrid>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <DataState kind="empty" title={c.batchEmpty} compact />
      )}
      {!loading && !error && meta.total > meta.page_size ? (
        <>
          <Divider />
          <Pagination
            page={page}
            total={meta.total}
            pageSize={meta.page_size}
            onPage={(page) => {
              setLoading(true);
              setPage(page);
            }}
            disabled={loading}
            previousLabel={t.common.previous}
            nextLabel={t.common.next}
            summary={t.common.pagination}
            resultCountLabel={t.common.resultCount}
            resultCountSingularLabel={t.common.resultCountSingular}
          />
        </>
      ) : null}
      {editor && !error ? (
        <ConfirmationDialog
          title={editor === "new" ? c.addBatch : c.editBatch}
          size={640}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={c.cancel}
          confirmLabel={editor === "new" ? c.addBatch : c.save}
          alternateLabel={reloadRequired ? c.reload : undefined}
          error={
            actionError ||
            (exceedsLimits || (editor === "new" && !canIncrease)
              ? t.storeCatalog.batchIncreaseBlocked
              : undefined)
          }
          confirmDisabled={actionsBlocked || exceedsLimits || (editor === "new" && !canIncrease)}
          onAlternate={reloadAfterConflict}
          onCancel={() => !busy && setEditor(null)}
          onConfirm={() => void save()}
        >
          <StockBatchFields
            draft={draft}
            errors={fieldErrors}
            labels={c}
            preset={preset}
            unitSize={product.unit_size}
            unitLabel={unitLabel}
            startDisabled={editor !== "new" && editor.status === "active"}
            disabled={actionsBlocked || (editor === "new" && !canIncrease)}
            limits={limits}
            onChange={(value) => {
              setDraft(value);
              setFieldErrors({});
            }}
            onPresetChange={setPreset}
          />
        </ConfirmationDialog>
      ) : null}
      {cancelTarget && !error ? (
        <ConfirmationDialog
          title={c.cancelBatch}
          size={400}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={c.cancel}
          confirmLabel={c.cancelBatch}
          danger
          confirmDisabled={actionsBlocked}
          alternateLabel={reloadRequired ? c.reload : undefined}
          error={actionError}
          onAlternate={reloadAfterConflict}
          onCancel={() => !busy && setCancelTarget(null)}
          onConfirm={() => void cancel()}
        >
          <Text>
            {c.cancelBatchConfirm
              .replace("{start}", formatAdminDate(cancelTarget.start_date))
              .replace("{end}", formatAdminDate(cancelTarget.end_date))}
          </Text>
        </ConfirmationDialog>
      ) : null}
    </Stack>
  );
}
