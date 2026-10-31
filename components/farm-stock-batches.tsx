"use client";

import { ReactNode, RefObject, useCallback, useEffect, useMemo, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button, DataState, FormSelect, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { StockBatchFields } from "@/components/stock-batch-fields";
import { formatAdminDate } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
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
import { formatDecimalInput } from "@/lib/numeric-input";
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
  actions?: ReactNode;
};

export function FarmStockBatches({
  farmId,
  product,
  detailHeadingRef,
  onBack,
  onSummaryChanged,
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
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<"new" | FarmStockBatch | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FarmStockBatch | null>(null);
  const [preset, setPreset] = useState<StockBatchPreset>("week");
  const [draft, setDraft] = useState<StockBatchDraft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<StockBatchFieldErrors>({});

  const load = useCallback(
    () => listFarmStockBatches(farmId, product.product_id, { page, status: status || undefined }),
    [farmId, page, product.product_id, status],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    load()
      .then((result) => {
        if (!live) return;
        setRows(result.data);
        setMeta(result.meta ?? { page, page_size: 20, total: result.data.length });
      })
      .catch((caught) => live && setError(requestErrorMessage(caught, t)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [load, page, retry, t]);

  const statusLabels = useMemo(
    () => ({
      upcoming: c.batchStatusUpcoming,
      active: c.batchStatusActive,
      expired: c.batchStatusExpired,
      cancelled: c.batchStatusCancelled,
    }),
    [c],
  );
  const productStockLabel = !product.is_active
    ? c.productInactive
    : product.available_quantity > 0
      ? c.remainingUnits.replace("{count}", String(product.available_quantity))
      : c.outOfStock;

  function openNew() {
    setEditor("new");
    setPreset("week");
    setDraft(emptyDraft());
    setFieldErrors({});
    setActionError("");
  }

  function openEdit(batch: FarmStockBatch) {
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

  function errorFor(caught: unknown) {
    return caught instanceof Error && conflictCodes.has(caught.message)
      ? c.batchChanged
      : requestErrorMessage(caught, t);
  }

  function reloadAfterConflict() {
    setEditor(null);
    setCancelTarget(null);
    setActionError("");
    reloadFromFirstPage();
    onSummaryChanged();
  }

  function reloadFromFirstPage() {
    if (page === 1) setRetry((value) => value + 1);
    else setPage(1);
  }

  async function save() {
    const validated = validateStockBatchInput(draft);
    setFieldErrors(validated.errors);
    if (!editor || !validated.value || busy) return;
    setBusy(true);
    setActionError("");
    try {
      if (editor === "new") {
        await createFarmStockBatch(farmId, product.product_id, validated.value);
      } else {
        await updateFarmStockBatch(farmId, product.product_id, editor.id, {
          ...validated.value,
          version: editor.version,
        });
      }
      setEditor(null);
      reloadFromFirstPage();
      onSummaryChanged();
    } catch (caught) {
      setActionError(errorFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!cancelTarget || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await cancelFarmStockBatch(farmId, product.product_id, cancelTarget.id, cancelTarget.version);
      setCancelTarget(null);
      reloadFromFirstPage();
      onSummaryChanged();
    } catch (caught) {
      setActionError(errorFor(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="farm-stock-batches" aria-label={`${c.stockBatches} ${product.sku}`}>
      <Button
        aria-label={c.backToProducts}
        className="farm-stock-mobile-back"
        variant="plain"
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
          <Status
            status={
              !product.is_active
                ? "inactive"
                : product.available_quantity > 0
                  ? "active"
                  : "expired"
            }
            label={productStockLabel}
          />
        </div>
        <div className="farm-stock-batches-actions">
          <Button small onClick={openNew}>
            {c.addBatch}
          </Button>
          {actions}
        </div>
      </div>
      <div className="farm-stock-batches-filter">
        <label className="nfv-field">
          <span className="nfv-field-label">{c.batchStatus}</span>
          <FormSelect
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as StockBatchStatus | "");
            }}
          >
            <option value="">{c.batchStatusAll}</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FormSelect>
        </label>
      </div>
      {error ? (
        <DataState
          kind="error"
          title={c.batchError}
          description={error}
          action={{ label: t.common.retry, onClick: () => setRetry((value) => value + 1) }}
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
                    {batch.quantity_units} × {formatDecimalInput(product.unit_size)} {unitLabel}
                  </span>
                </div>
                <strong>
                  {formatStockQuantityTotal(batch.quantity_units, product.unit_size, unitLabel)}
                </strong>
                <Status status={batch.status} label={statusLabels[batch.status]} />
                <div className="farm-stock-batch-row-actions">
                  {editable ? (
                    <>
                      <Button small variant="plain" onClick={() => openEdit(batch)}>
                        {c.edit}
                      </Button>
                      <Button
                        small
                        variant="plain"
                        onClick={() => {
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
          onPage={setPage}
          disabled={loading}
          previousLabel={t.common.previous}
          nextLabel={t.common.next}
          summary={t.common.pagination}
        />
      ) : null}
      {editor ? (
        <ConfirmationDialog
          title={editor === "new" ? c.addBatch : c.editBatch}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={c.cancel}
          confirmLabel={editor === "new" ? c.addBatch : c.save}
          alternateLabel={actionError === c.batchChanged ? c.reload : undefined}
          error={actionError}
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
            onChange={(value) => {
              setDraft(value);
              setFieldErrors({});
            }}
            onPresetChange={setPreset}
          />
        </ConfirmationDialog>
      ) : null}
      {cancelTarget ? (
        <ConfirmationDialog
          title={c.cancelBatch}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={c.cancel}
          confirmLabel={c.cancelBatch}
          danger
          alternateLabel={actionError === c.batchChanged ? c.reload : undefined}
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
