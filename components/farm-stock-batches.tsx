"use client";
import { Alert, Button, Group, Text } from "@mantine/core";

import { ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DataState, FormField, FormSelect, Status } from "@/components/nfv-controls";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { Pagination } from "@/components/pagination";
import { StockBatchFields } from "@/components/stock-batch-fields";
import { formatAdminDate } from "@/lib/admin-date";
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
  stockBatchRangeForPreset,
  validateStockBatchInput,
  type StockBatchDraft,
  type StockBatchFieldErrors,
  type StockBatchPreset,
} from "@/lib/farm-stock";
import type { FarmProduct, FarmStockBatch, PaginationMeta, StockBatchStatus } from "@/lib/types";

const conflictCodes = new Set([
  "version_conflict",
  "stock_batch_changed",
  "stock_batch_cancelled",
  "stock_batch_expired",
  "stock_batch_start_locked",
  "farm_product_changed",
]);

function emptyDraft(): StockBatchDraft {
  return { ...stockBatchRangeForPreset("week"), quantity: "" };
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
        setError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, onAccessLost, page, retry, t]);

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
  const exceedsLimits = Boolean(
    limits &&
    ((draft.start_date && draft.start_date < limits.start) ||
      draft.end_date > limits.end ||
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
      start_date: batch.start_date,
      end_date: batch.end_date,
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
    <section className="farm-stock-batches" aria-label={`${c.stockBatches} ${product.sku}`}>
      <Button
        aria-label={c.backToProducts}
        className="farm-stock-mobile-back"
        variant="subtle"
        onClick={onBack}
      >
        ← {c.backToProducts}
      </Button>
      <div className="farm-stock-batches-heading">
        <div>
          <h3 ref={detailHeadingRef} tabIndex={-1}>
            {c.stockBatches}: {locale === "vi" ? product.name_vi : product.name_en}
          </h3>
          <p>{c.stockBatchesHint}</p>
          <Group gap="xs">
            <ProductLifecycleStatus status={product.product_status} />
            <Status
              domain="farm-stock"
              status={product.is_active ? "active" : "inactive"}
              label={product.is_active ? c.productActive : c.productInactive}
            />
            <Text size="sm">{productStockLabel}</Text>
          </Group>
        </div>
        {!error && (
          <div className="farm-stock-batches-actions">
            <Button
              size="xs"
              onClick={openNew}
              disabled={!canIncrease || actionsBlocked}
              aria-describedby={!canIncrease && !summaryBusy ? "farm-stock-add-reason" : undefined}
            >
              {c.addBatch}
            </Button>
            {!actionsBlocked && actions}
          </div>
        )}
      </div>
      {!canIncrease && !summaryBusy && !error && (
        <Text size="sm" id="farm-stock-add-reason">
          {t.storeCatalog.batchIncreaseBlocked}
        </Text>
      )}
      {actionError && !editor && !cancelTarget && (
        <Alert color="red" role="alert">
          {actionError}
          {reloadRequired && (
            <Button ml="xs" size="xs" variant="default" onClick={reloadAfterConflict}>
              {c.reload}
            </Button>
          )}
        </Alert>
      )}
      <div className="farm-stock-batches-filter">
        <FormField label={c.batchStatus}>
          <FormSelect
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
        </FormField>
      </div>
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
        <div className="farm-stock-batch-list">
          {rows.map((batch) => {
            const editable = batch.status === "active" || batch.status === "upcoming";
            return (
              <article className="farm-stock-batch-row" key={batch.id}>
                <div>
                  <strong>
                    {formatAdminDate(batch.start_date)} – {formatAdminDate(batch.end_date)}
                  </strong>
                  <span>
                    {c.batchInventory
                      .replace("{initial}", String(batch.quantity_units))
                      .replace("{sold}", String(batch.net_sold_quantity))
                      .replace("{remaining}", String(batch.remaining_quantity))
                      .replace("{available}", String(batch.available_quantity))}
                  </span>
                </div>
                <strong>
                  {formatStockQuantityTotal(batch.remaining_quantity, product.unit_size, unitLabel)}
                </strong>
                <Status
                  domain="farm-stock"
                  status={batch.status}
                  label={statusLabels[batch.status]}
                />
                <div className="farm-stock-batch-row-actions">
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
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <DataState kind="empty" title={c.batchEmpty} compact />
      )}
      {!loading && !error && meta.total > meta.page_size ? (
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
        />
      ) : null}
      {editor && !error ? (
        <ConfirmationDialog
          title={editor === "new" ? c.addBatch : c.editBatch}
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
          <p>
            {c.cancelBatchConfirm
              .replace("{start}", formatAdminDate(cancelTarget.start_date))
              .replace("{end}", formatAdminDate(cancelTarget.end_date))}
          </p>
        </ConfirmationDialog>
      ) : null}
    </section>
  );
}
