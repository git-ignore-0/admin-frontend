"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { CSAOrderPanel } from "@/components/csa-order-panel";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import {
  Button,
  DataState,
  FormCheckbox,
  FormField,
  FormInput,
  FormTextarea,
  Section,
} from "@/components/nfv-controls";
import { StoreOrderAllocationEditor } from "@/components/store-order-allocation-editor";
import { StoreOrderProducts } from "@/components/store-order-products";
import { StoreOrderStatusBadge } from "@/components/store-order-status";
import { StoreOrderTotals, StoreRecipientSummary } from "@/components/store-order-summary";
import { useToast } from "@/components/toast-provider";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
import {
  formatStoreMoney,
  getStoreOrder,
  getStoreOrderActions,
  getStoreOrderPrimaryAction,
  IdempotencyKeyStore,
  mutateStoreOrder,
  storeDeadlineRemainingMs,
  validateStoreAllocations,
} from "@/lib/store-orders";
import {
  storeCancellationReason,
  storeOrdersCopy,
  storeRestockUnavailableReason,
} from "@/lib/store-orders-copy";
import type { StoreOrder, StoreOrderAction, StoreOrderAllocationDraft } from "@/lib/types";

function TimelineRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{formatAdminDateTime(value)}</dd>
    </div>
  );
}

export function StoreOrderDetail({ orderId }: { orderId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const c = storeOrdersCopy(locale);
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<StoreOrderAllocationDraft[]>([]);
  const [tick, setTick] = useState(0);
  const draftInitialized = useRef(false);
  const csaRevision = useRef<string | null>(null);
  const receivedAt = useRef(Date.now());
  const requestId = useRef(0);
  const expiryReloaded = useRef<string | null>(null);
  const submitting = useRef(false);
  const idempotencyKeys = useRef(new IdempotencyKeyStore());
  const [action, setAction] = useState<StoreOrderAction | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionConflict, setActionConflict] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [restock, setRestock] = useState<Record<string, number>>({});
  const restockLedgerAtOpen = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const next = await getStoreOrder(orderId);
      if (current !== requestId.current) return;
      receivedAt.current = Date.now();
      setOrder(next);
      setError("");
      setReloadRequired(false);
      const nextCSARevision = next.csa
        ? `${next.csa.selection.revision}:${next.csa.selection.state}`
        : null;
      if (nextCSARevision !== csaRevision.current) {
        draftInitialized.current = false;
        csaRevision.current = nextCSARevision;
      }
      if (!draftInitialized.current) {
        setDraft(next.allocation_suggestion ?? []);
        draftInitialized.current = true;
      }
    } catch (caught) {
      if (current === requestId.current) setError(requestErrorMessage(caught, t));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = order ? storeDeadlineRemainingMs(order, receivedAt.current, Date.now()) : null;
  useEffect(() => {
    if (!order?.expires_at || remaining !== 0 || expiryReloaded.current === order.expires_at)
      return;
    expiryReloaded.current = order.expires_at;
    void load();
  }, [load, order?.expires_at, remaining, tick]);

  if (!order) {
    return (
      <DataState
        kind={error ? "error" : "loading"}
        title={error || c.detailLoading}
        action={error ? { label: t.common.retry, onClick: () => void load() } : undefined}
      />
    );
  }

  const currentOrder = order;
  const deadlineLabel =
    currentOrder.status === "payment_pending" ? c.paymentDeadline : c.reviewDeadline;
  const remainingMinutes = remaining === null ? null : Math.ceil(remaining / 60_000);
  const actions = getStoreOrderActions(currentOrder);
  const primaryAction = getStoreOrderPrimaryAction(actions);
  actions.sort((a, b) => Number(b === primaryAction) - Number(a === primaryAction));
  const allocationsValid =
    currentOrder.status !== "pending_review" || validateStoreAllocations(currentOrder, draft).valid;
  const timeline = [
    { label: c.createdAt, value: order.created_at },
    { label: c.transferReportedAt, value: order.transfer_reported_at },
    { label: c.paymentReceivedAt, value: order.payment?.received_at },
    { label: c.approvedAt, value: order.approved_at },
    { label: c.deliveredAt, value: order.delivered_at },
    { label: c.cancelledAt, value: order.cancelled_at },
    { label: c.refundedAt, value: order.payment?.refunded_at },
  ];

  function openAction(next: StoreOrderAction) {
    if (error || reloadRequired) return;
    setAction(next);
    setReason("");
    setNote("");
    setConfirmed(false);
    setActionError("");
    setActionConflict(false);
    restockLedgerAtOpen.current = Object.fromEntries(
      (currentOrder.allocations ?? []).map((row) => [row.id, row.restocked_quantity]),
    );
    setRestock(
      Object.fromEntries(
        (currentOrder.allocations ?? [])
          .filter((row) => row.restock_remaining_quantity > 0)
          .map((row) => [row.id, 0]),
      ),
    );
  }

  function actionPayload() {
    if (!action) return null;
    if (action === "approve") return { allocations: draft };
    if (action === "cancel") return { reason: reason.trim(), reconciliation_note: note.trim() };
    if (action === "record-payment") return { note: note.trim() };
    if (action === "refund") return { amount_vnd: currentOrder.total_vnd, note: note.trim() };
    if (action === "restock")
      return {
        allocations: Object.entries(restock)
          .filter(([, quantity]) => quantity > 0)
          .map(([allocation_id, quantity]) => ({ allocation_id, quantity })),
      };
    return {};
  }

  function restockIsValid() {
    const limits = new Map(
      (currentOrder.allocations ?? []).map((row) => [
        row.id,
        row.restock_eligible ? row.restock_remaining_quantity : 0,
      ]),
    );
    const entries = Object.entries(restock);
    return (
      entries.some(([, quantity]) => quantity > 0) &&
      entries.every(
        ([id, quantity]) =>
          Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= (limits.get(id) ?? -1),
      )
    );
  }

  function actionDisabled() {
    if (!action || loading || error || reloadRequired || !actions.includes(action)) return true;
    if (action === "approve") return !allocationsValid;
    if (action === "cancel") return !reason.trim();
    if (action === "refund") return !note.trim() || !confirmed;
    if (action === "deliver") return !confirmed;
    if (action === "restock") return !restockIsValid();
    return false;
  }

  function discardPendingReads() {
    // Mutation results (including conflicts) supersede every older GET response.
    requestId.current += 1;
    setLoading(false);
  }

  async function submitAction() {
    if (
      !action ||
      submitting.current ||
      loading ||
      error ||
      reloadRequired ||
      !actions.includes(action)
    )
      return;
    if (action === "cancel" && !reason.trim()) {
      setActionError(c.cancelReasonRequired);
      return;
    }
    if (action === "refund" && !note.trim()) {
      setActionError(c.refundNoteRequired);
      return;
    }
    if (action === "approve" && !allocationsValid) {
      setActionError(c.approveAllocationInvalid);
      return;
    }
    if (action === "restock" && !restockIsValid()) {
      setActionError(c.restockInvalid);
      return;
    }
    if (actionDisabled()) return;
    const payload = actionPayload();
    if (!payload) return;
    // Compare the ledger captured when opening this intent, not a background refresh.
    // Reopening after a confirmed restock creates a new key; retries retain their key.
    const restockRevision =
      action === "restock"
        ? Object.fromEntries(
            (currentOrder.allocations ?? [])
              .filter((row) => (restock[row.id] ?? 0) > 0)
              .map((row) => [row.id, restockLedgerAtOpen.current[row.id]]),
          )
        : undefined;
    const key = idempotencyKeys.current.forPayload(action, payload, restockRevision);
    discardPendingReads();
    submitting.current = true;
    setActionBusy(true);
    setActionError("");
    setActionConflict(false);
    try {
      const updated = await mutateStoreOrder(currentOrder.id, action, {
        idempotency_key: key,
        ...payload,
      });
      discardPendingReads();
      receivedAt.current = Date.now();
      setOrder(updated);
      setError("");
      setReloadRequired(false);
      idempotencyKeys.current.clear(action);
      setAction(null);
      toast(c.mutationSuccess);
    } catch (caught) {
      discardPendingReads();
      if ((caught as { status?: number }).status === 409) {
        setReloadRequired(true);
        setActionConflict(true);
        setActionError(c.conflict);
      } else {
        setActionError(requestErrorMessage(caught, t));
      }
    } finally {
      submitting.current = false;
      setActionBusy(false);
    }
  }

  async function reloadConflict() {
    setAction(null);
    setActionError("");
    setActionConflict(false);
    await load();
  }

  return (
    <div className="store-order-detail-page">
      <DetailPageHeading backHref="/store-orders" backLabel={c.back} title={order.reference_code} />
      <header className="store-order-detail-header">
        <div className="store-order-state-line">
          <StoreOrderStatusBadge order={order} />
          {order.expires_at && ["payment_pending", "pending_review"].includes(order.status) ? (
            <div className="store-order-deadline">
              <div>
                <span>{deadlineLabel}</span>
                <span>{formatAdminDateTime(order.expires_at)}</span>
              </div>
              <strong className="store-order-countdown">
                {remainingMinutes
                  ? c.remainingMinutes.replace("{count}", String(remainingMinutes))
                  : c.expired}
              </strong>
            </div>
          ) : null}
        </div>
        <Button variant="outline" disabled={loading} onClick={() => void load()} type="button">
          {c.refresh}
        </Button>
      </header>
      {error || reloadRequired ? (
        <div className="error-box retry-error" role="alert">
          <span>{error ? `${error} ${c.staleSnapshot}` : c.conflictReloadRequired}</span>
          <Button variant="outline" disabled={loading} onClick={() => void load()} type="button">
            {t.common.retry}
          </Button>
        </div>
      ) : null}
      {order.cancellation_reason ? (
        <p className="store-order-cancellation-reason">
          <strong>{c.cancellationReason}:</strong>{" "}
          {storeCancellationReason(order.cancellation_reason, locale)}
        </p>
      ) : null}
      {order.status === "cancelled" &&
      (actions.includes("refund") || actions.includes("restock")) ? (
        <ul className="store-order-pending-work">
          {actions.includes("refund") ? <li>{c.refundPending}</li> : null}
          {actions.includes("restock") ? <li>{c.restockPending}</li> : null}
        </ul>
      ) : null}
      <CSAOrderPanel
        order={order}
        disabled={loading || Boolean(error) || reloadRequired || actionBusy}
        onReload={() => void load()}
      />
      <div className="store-order-workspace">
        <div className="store-order-main">
          {order.status === "pending_review" && order.csa?.selection.state !== "reselecting" ? (
            <StoreOrderAllocationEditor
              order={order}
              value={draft}
              onChange={setDraft}
              disabled={loading || Boolean(error) || reloadRequired || actionBusy}
            />
          ) : (
            <StoreOrderProducts order={order} />
          )}
          <Section title={c.recipientTitle}>
            <StoreRecipientSummary order={order} />
          </Section>
          <Section title={c.timelineTitle} className="store-order-history">
            <dl className="detail-list">
              {timeline.map((event) => (
                <TimelineRow key={event.label} label={event.label} value={event.value} />
              ))}
              {order.reconciliation_note ? (
                <div>
                  <dt>{c.reconciliationNote}</dt>
                  <dd>{order.reconciliation_note}</dd>
                </div>
              ) : null}
              {order.payment?.refund_note ? (
                <div>
                  <dt>{c.refundNote}</dt>
                  <dd>{order.payment.refund_note}</dd>
                </div>
              ) : null}
            </dl>
          </Section>
        </div>
        <aside className="store-order-sidebar" aria-label={c.paymentSummary}>
          <Section title={c.paymentSummary} className="store-order-payment">
            <StoreOrderTotals order={order} />
            {order.payment ? (
              <div className="store-order-bank-disclosure">
                <h3>{c.transferTitle}</h3>
                <div className="store-order-bank-details">
                  <dl className="detail-list">
                    <div>
                      <dt>{c.bank}</dt>
                      <dd>
                        {order.payment.bank_name} ({order.payment.bank_bin})
                      </dd>
                    </div>
                    <div>
                      <dt>{c.account}</dt>
                      <dd>{order.payment.account_number}</dd>
                    </div>
                    <div>
                      <dt>{c.accountName}</dt>
                      <dd>{order.payment.account_name}</dd>
                    </div>
                    <div>
                      <dt>{c.transferContent}</dt>
                      <dd>{order.payment.transfer_content}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            ) : null}
          </Section>
          {actions.length ? (
            <Section title={c.actions} className="store-order-actions">
              {order.status === "pending_review" && !allocationsValid ? (
                <p className="allocation-invalid store-order-action-hint">{c.allocationCheck}</p>
              ) : null}
              <div className="detail-actions">
                {actions.map((item) => (
                  <Button
                    variant={item === primaryAction ? "primary" : "outline"}
                    disabled={
                      actionBusy ||
                      loading ||
                      Boolean(error) ||
                      reloadRequired ||
                      (item === "approve" && !allocationsValid)
                    }
                    className={item === "cancel" ? "store-order-cancel" : undefined}
                    key={item}
                    onClick={() => openAction(item)}
                    type="button"
                  >
                    {c.actionLabels[item]}
                  </Button>
                ))}
              </div>
            </Section>
          ) : null}
        </aside>
      </div>

      {action ? (
        <ConfirmationDialog
          busy={actionBusy}
          busyLabel={c.saving}
          cancelLabel={c.cancelButton}
          confirmDisabled={actionDisabled()}
          confirmLabel={c.actionLabels[action]}
          danger={action === "cancel" || action === "refund"}
          error={actionError}
          alternateLabel={actionConflict ? c.reloadAfterConflict : undefined}
          onAlternate={actionConflict ? () => void reloadConflict() : undefined}
          onCancel={() => !actionBusy && setAction(null)}
          onConfirm={() => void submitAction()}
          title={c.actionTitles[action]}
        >
          <dl className="detail-list store-order-confirm-summary">
            <div>
              <dt>{c.reference}</dt>
              <dd>{order.reference_code}</dd>
            </div>
            {action === "restock" || action === "deliver" ? (
              <div>
                <dt>{c.quantity}</dt>
                <dd>
                  {action === "restock"
                    ? Object.values(restock)
                        .filter((quantity) => Number.isSafeInteger(quantity) && quantity > 0)
                        .reduce((total, quantity) => total + quantity, 0)
                    : order.lines.reduce((total, line) => total + line.quantity, 0)}
                </dd>
              </div>
            ) : (
              <div>
                <dt>{action === "refund" ? c.refundAmount : c.total}</dt>
                <dd>{formatStoreMoney(order.total_vnd, locale)}</dd>
              </div>
            )}
          </dl>
          {action === "approve" ? <p>{c.approveAllocationInvalid}</p> : null}
          {action === "cancel" ? (
            <>
              <FormField label={c.cancelReason}>
                <FormTextarea
                  aria-label={c.cancelReason}
                  disabled={actionBusy}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setActionError("");
                  }}
                />
              </FormField>
              <FormField label={c.note}>
                <FormTextarea
                  aria-label={c.note}
                  disabled={actionBusy}
                  maxLength={2000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FormField>
            </>
          ) : null}
          {action === "record-payment" ? (
            <FormField label={c.note}>
              <FormTextarea
                aria-label={c.note}
                disabled={actionBusy}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
          ) : null}
          {action === "refund" ? (
            <>
              <p>{c.refundHint}</p>
              <FormField label={c.refundNote}>
                <FormTextarea
                  aria-label={c.refundNote}
                  disabled={actionBusy}
                  maxLength={2000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FormField>
              <FormCheckbox
                label={c.refundOutside}
                checked={confirmed}
                disabled={actionBusy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
            </>
          ) : null}
          {action === "deliver" ? (
            <FormCheckbox
              label={c.deliveredConfirm}
              checked={confirmed}
              disabled={actionBusy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
          ) : null}
          {action === "restock" ? (
            <div className="form-grid one">
              {(order.allocations ?? [])
                .filter((row) => row.restock_remaining_quantity > 0)
                .map((row) => {
                  const line = order.lines.find((item) => item.id === row.line_id);
                  const product = line?.name ?? row.product_id;
                  const sku = line?.sku ?? row.product_id;
                  const firstForLine =
                    (order.allocations ?? []).find(
                      (item) => item.line_id === row.line_id && item.restock_remaining_quantity > 0,
                    )?.id === row.id;
                  const label = c.restockQuantity
                    .replace("{product}", product)
                    .replace("{sku}", sku)
                    .replace("{farm}", row.farm_name)
                    .replace("{batch}", row.batch_id);
                  return (
                    <FormField label={label} className="store-restock-row" key={row.id}>
                      {firstForLine ? <strong>{product}</strong> : null}
                      <span className="table-secondary">
                        {sku}
                        {line ? ` · ${line.unit_size} ${line.unit_label}` : ""}
                      </span>
                      <span className="table-secondary">
                        {row.farm_name} · {formatAdminDate(row.start_date)} –{" "}
                        {formatAdminDate(row.end_date)}
                      </span>
                      <span className="table-secondary">
                        {c.restockBatch.replace("{batch}", row.batch_id)}
                      </span>
                      <span className="table-secondary">
                        {c.restockAllocation
                          .replace("{allocated}", String(row.quantity))
                          .replace("{restocked}", String(row.restocked_quantity))
                          .replace("{remaining}", String(row.restock_remaining_quantity))}
                      </span>
                      {!row.restock_eligible ? (
                        <span className="nfv-field-error">
                          {storeRestockUnavailableReason(row.restock_unavailable_reason, locale)}
                        </span>
                      ) : null}
                      <FormInput
                        aria-invalid={
                          !row.restock_eligible && (restock[row.id] ?? 0) > 0 ? "true" : undefined
                        }
                        aria-label={label}
                        disabled={actionBusy}
                        max={row.restock_eligible ? row.restock_remaining_quantity : 0}
                        min={0}
                        type="number"
                        value={restock[row.id] ?? 0}
                        onChange={(event) =>
                          setRestock((current) => ({
                            ...current,
                            [row.id]: Number(event.target.value),
                          }))
                        }
                      />
                    </FormField>
                  );
                })}
            </div>
          ) : null}
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}
