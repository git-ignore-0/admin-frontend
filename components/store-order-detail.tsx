"use client";
import { Alert, Group } from "@mantine/core";

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
  FormSelect,
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
  storeOrderHasDeadline,
  validateStoreAllocations,
} from "@/lib/store-orders";
import {
  storeCancellationReason,
  storeOrderActionLabel,
  storeOrderActionTitle,
  storeOrderDeadlineLabel,
  storeOrdersCopy,
  storeRefundStatusLabel,
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
  return <StoreOrderDetailContent key={orderId} orderId={orderId} />;
}

function StoreOrderDetailContent({ orderId }: { orderId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const c = storeOrdersCopy(locale);
  const latestCopy = useRef({ t, c });
  latestCopy.current = { t, c };
  const mounted = useRef(false);
  const pendingIntent = useRef<{
    action: StoreOrderAction;
    payload: Record<string, unknown>;
  } | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<StoreOrderAllocationDraft[]>([]);
  const [tick, setTick] = useState(0);
  const draftInitialized = useRef(false);
  const csaRevision = useRef<string | null>(null);
  const receivedAt = useRef(performance.now());
  const requestId = useRef(0);
  const expiryReloaded = useRef<string | null>(null);
  const submitting = useRef(false);
  const idempotencyKeys = useRef(new IdempotencyKeyStore());
  const [action, setAction] = useState<StoreOrderAction | null>(null);
  const [reconciliationDialog, setReconciliationDialog] = useState(false);
  const [reconciliationChoice, setReconciliationChoice] = useState<
    "record-payment" | "close-refund-request" | null
  >(null);
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
    if (submitting.current) return;
    const current = ++requestId.current;
    setLoading(true);
    try {
      const next = await getStoreOrder(orderId);
      if (current !== requestId.current) return;
      receivedAt.current = performance.now();
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
      if (current === requestId.current)
        setError(requestErrorMessage(caught, latestCopy.current.t));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requestId.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining =
    order && storeOrderHasDeadline(order)
      ? storeDeadlineRemainingMs(order, receivedAt.current, performance.now())
      : null;
  useEffect(() => {
    if (
      !order?.expires_at ||
      !storeOrderHasDeadline(order) ||
      remaining !== 0 ||
      submitting.current ||
      expiryReloaded.current === order.expires_at
    )
      return;
    expiryReloaded.current = order.expires_at;
    void load();
  }, [load, order, remaining, tick]);

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
  const deadlineLabel = storeOrderDeadlineLabel(currentOrder, locale);
  const remainingMinutes = remaining === null ? null : Math.ceil(remaining / 60_000);
  const actions = getStoreOrderActions(currentOrder, { expired: remaining === 0 });
  const groupedReconciliation =
    currentOrder.workflow_version === 2 &&
    !currentOrder.csa &&
    currentOrder.status === "cancelled" &&
    actions.includes("record-payment") &&
    actions.includes("close-refund-request");
  const visibleActions = groupedReconciliation
    ? actions.filter((item) => item !== "close-refund-request")
    : actions;
  // An unresolved request may be replayed, but is not a new permission on this snapshot.
  const recoveryAction =
    unresolved && pendingIntent.current && !visibleActions.includes(pendingIntent.current.action)
      ? pendingIntent.current.action
      : null;
  const replaying = unresolved && pendingIntent.current?.action === action;
  const primaryAction = getStoreOrderPrimaryAction(actions);
  visibleActions.sort((a, b) => Number(b === primaryAction) - Number(a === primaryAction));
  const allocationsValid =
    currentOrder.status !== "pending_review" || validateStoreAllocations(currentOrder, draft).valid;
  const timeline = [
    { label: c.createdAt, value: order.created_at },
    { label: c.transferReportedAt, value: order.transfer_reported_at },
    { label: c.paymentReceivedAt, value: order.payment_received_at },
    {
      label:
        order.workflow_version === 2 && !order.csa ? c.reconciliationOpenedAt : c.refundRequestedAt,
      value: order.refund_requested_at,
    },
    { label: c.refundRequestClosedAt, value: order.refund_request_closed_at },
    { label: c.approvedAt, value: order.approved_at },
    { label: c.deliveredAt, value: order.delivered_at },
    { label: c.cancelledAt, value: order.cancelled_at },
    { label: c.refundedAt, value: order.refunded_at },
  ]
    .filter((event) => event.value)
    .sort((a, b) => Date.parse(a.value!) - Date.parse(b.value!));

  function openAction(next: StoreOrderAction) {
    if (error || reloadRequired || submitting.current) return;
    if (pendingIntent.current) {
      if (pendingIntent.current.action === next) setAction(next);
      return;
    }
    setAction(next);
    setReconciliationDialog(groupedReconciliation && next === "record-payment");
    setReconciliationChoice(null);
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
    if (action === "cancel")
      return currentOrder.workflow_version === 2 && !currentOrder.csa
        ? { reason: reason.trim() }
        : { reason: reason.trim(), reconciliation_note: note.trim() };
    if (action === "close-refund-request") return { reason: reason.trim() };
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
    if (!action || loading || error || reloadRequired || (!actions.includes(action) && !replaying))
      return true;
    if (unresolved && pendingIntent.current?.action === action) return false;
    if (reconciliationDialog && !reconciliationChoice) return true;
    if (action === "approve") return !allocationsValid;
    if (action === "cancel" || action === "close-refund-request") return !reason.trim();
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
      (!actions.includes(action) && !replaying)
    )
      return;
    const expiredNow =
      storeOrderHasDeadline(currentOrder) &&
      storeDeadlineRemainingMs(currentOrder, receivedAt.current, performance.now()) === 0;
    if (
      !pendingIntent.current &&
      !getStoreOrderActions(currentOrder, { expired: expiredNow }).includes(action)
    ) {
      expiryReloaded.current = currentOrder.expires_at;
      void load();
      return;
    }
    if ((action === "cancel" || action === "close-refund-request") && !reason.trim()) {
      setActionError(action === "cancel" ? c.cancelReasonRequired : c.closeRefundReasonRequired);
      return;
    }
    if (action === "refund" && !note.trim()) {
      setActionError(c.refundNoteRequired);
      return;
    }
    if (!unresolved && action === "approve" && !allocationsValid) {
      setActionError(c.approveAllocationInvalid);
      return;
    }
    if (!unresolved && action === "restock" && !restockIsValid()) {
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
    const key =
      pendingIntent.current?.payload.idempotency_key ??
      idempotencyKeys.current.forPayload(action, payload, restockRevision);
    const intent = pendingIntent.current ?? {
      action,
      payload: { idempotency_key: key, ...payload },
    };
    pendingIntent.current = intent;
    discardPendingReads();
    submitting.current = true;
    setActionBusy(true);
    setActionError("");
    setActionConflict(false);
    try {
      const updated = await mutateStoreOrder(currentOrder.id, intent.action, intent.payload);
      if (!mounted.current) return;
      discardPendingReads();
      receivedAt.current = performance.now();
      setOrder(updated);
      setError("");
      setReloadRequired(false);
      idempotencyKeys.current.clear(action);
      pendingIntent.current = null;
      setUnresolved(false);
      setAction(null);
      toast(latestCopy.current.c.mutationSuccess);
    } catch (caught) {
      if (!mounted.current) return;
      discardPendingReads();
      const status = (caught as { status?: number }).status;
      const unknownResult =
        status === undefined ||
        status >= 500 ||
        (caught instanceof Error && caught.message === "invalid_response");
      setUnresolved(unknownResult);
      if (!unknownResult) pendingIntent.current = null;
      if (status === 409) {
        setReloadRequired(true);
        setActionConflict(true);
        setActionError(latestCopy.current.c.conflict);
      } else {
        setActionError(requestErrorMessage(caught, latestCopy.current.t));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setActionBusy(false);
    }
  }

  async function reloadConflict() {
    setAction(null);
    setActionError("");
    setActionConflict(false);
    if (action) idempotencyKeys.current.clear(action);
    await load();
  }

  return (
    <div className="store-order-detail-page">
      <DetailPageHeading
        bottomSpacing={0}
        backHref="/store-orders"
        backLabel={c.back}
        title={order.reference_code}
      />
      <header className="store-order-detail-header">
        <div className="store-order-state-line">
          <StoreOrderStatusBadge order={order} />
          {order.expires_at && storeOrderHasDeadline(order) ? (
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
        <Button
          variant="outline"
          disabled={loading || actionBusy}
          onClick={() => void load()}
          type="button"
        >
          {c.refresh}
        </Button>
      </header>
      {error || reloadRequired ? (
        <Alert color="red" role="alert">
          <Group gap="sm" justify="space-between">
            <span>{error ? `${error} ${c.staleSnapshot}` : c.conflictReloadRequired}</span>
            <Button
              variant="outline"
              disabled={loading || actionBusy}
              onClick={() => void load()}
              type="button"
            >
              {t.common.retry}
            </Button>
          </Group>
        </Alert>
      ) : null}
      {order.cancellation_reason ? (
        <p className="store-order-cancellation-reason">
          <strong>{c.cancellationReason}:</strong>{" "}
          {storeCancellationReason(order.cancellation_reason, locale)}
        </p>
      ) : null}
      {order.status === "cancelled" &&
      (order.refund_status === "pending" || actions.includes("restock")) ? (
        <ul className="store-order-pending-work">
          {order.refund_status === "pending" ? (
            <li>{storeRefundStatusLabel(order.refund_status, locale, order)}</li>
          ) : null}
          {actions.includes("restock") ? <li>{c.restockPending}</li> : null}
        </ul>
      ) : null}
      <CSAOrderPanel
        order={order}
        disabled={loading || Boolean(error) || reloadRequired || actionBusy || unresolved}
        onReload={() => void load()}
      />
      <div className="store-order-workspace">
        <div className="store-order-main">
          {order.status === "pending_review" && order.csa?.selection.state !== "reselecting" ? (
            <StoreOrderAllocationEditor
              order={order}
              value={draft}
              onChange={setDraft}
              disabled={loading || Boolean(error) || reloadRequired || actionBusy || unresolved}
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
              {order.refund_request_closed_reason ? (
                <div>
                  <dt>{c.refundRequestClosedReason}</dt>
                  <dd>{order.refund_request_closed_reason}</dd>
                </div>
              ) : null}
              {order.refund_note ? (
                <div>
                  <dt>{c.refundNote}</dt>
                  <dd>{order.refund_note}</dd>
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
          {recoveryAction ? (
            <div className="detail-actions">
              <Button
                variant="outline"
                disabled={actionBusy || loading || Boolean(error) || reloadRequired}
                onClick={() => openAction(recoveryAction)}
                type="button"
              >
                {c.retryRequest}
              </Button>
            </div>
          ) : null}
          {visibleActions.length ? (
            <Section title={c.actions} className="store-order-actions">
              {order.status === "pending_review" && !allocationsValid ? (
                <p className="allocation-invalid store-order-action-hint">{c.allocationCheck}</p>
              ) : null}
              <div className="detail-actions">
                {visibleActions.map((item) => (
                  <Button
                    variant={item === primaryAction ? "primary" : "outline"}
                    disabled={
                      actionBusy ||
                      loading ||
                      Boolean(error) ||
                      reloadRequired ||
                      (unresolved && pendingIntent.current?.action !== item) ||
                      (!unresolved && item === "approve" && !allocationsValid)
                    }
                    className={item === "cancel" ? "store-order-cancel" : undefined}
                    key={item}
                    onClick={() => openAction(item)}
                    type="button"
                  >
                    {storeOrderActionLabel(order, item, locale)}
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
          confirmLabel={
            recoveryAction === action
              ? c.retryRequest
              : reconciliationDialog
                ? c.confirmReconciliation
                : storeOrderActionLabel(order, action, locale)
          }
          danger={action === "cancel" || action === "refund"}
          error={actionError}
          alternateLabel={actionConflict ? c.reloadAfterConflict : undefined}
          onAlternate={actionConflict ? () => void reloadConflict() : undefined}
          onCancel={() => !actionBusy && setAction(null)}
          onConfirm={() => void submitAction()}
          title={
            recoveryAction === action
              ? c.retryRequest
              : reconciliationDialog
                ? c.reconcile
                : storeOrderActionTitle(order, action, locale)
          }
        >
          {loading || error ? (
            <DataState
              kind={loading ? "loading" : "error"}
              title={loading ? c.detailLoading : error}
              action={
                !loading && error
                  ? { label: t.common.retry, onClick: () => void load() }
                  : undefined
              }
            />
          ) : null}
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
          {reconciliationDialog ? (
            <FormField label={c.reconciliationDecision}>
              <FormSelect
                aria-label={c.reconciliationDecision}
                disabled={actionBusy || unresolved || reloadRequired}
                value={reconciliationChoice ?? ""}
                onChange={(choice) => {
                  if (actionBusy || unresolved || reloadRequired) return;
                  if (choice === "record-payment" || choice === "close-refund-request") {
                    setReconciliationChoice(choice);
                    setAction(choice);
                  } else {
                    setReconciliationChoice(null);
                    setAction("record-payment");
                  }
                  setActionError("");
                }}
                data={[
                  { value: "", label: c.reconciliationUnknown },
                  { value: "record-payment", label: c.paymentReceived },
                  { value: "close-refund-request", label: c.paymentNotReceived },
                ]}
              />
            </FormField>
          ) : null}
          {action === "approve" ? <p>{c.approveAllocationInvalid}</p> : null}
          {action === "cancel" || action === "close-refund-request" ? (
            <>
              <FormField label={action === "cancel" ? c.cancelReason : c.closeRefundReason}>
                <FormTextarea
                  aria-label={action === "cancel" ? c.cancelReason : c.closeRefundReason}
                  disabled={actionBusy || unresolved || reloadRequired}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setActionError("");
                  }}
                />
              </FormField>
              {action === "cancel" && (currentOrder.workflow_version !== 2 || currentOrder.csa) ? (
                <FormField label={c.note}>
                  <FormTextarea
                    aria-label={c.note}
                    disabled={actionBusy || unresolved || reloadRequired}
                    maxLength={2000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </FormField>
              ) : null}
            </>
          ) : null}
          {action === "record-payment" && (!reconciliationDialog || reconciliationChoice) ? (
            <FormField label={c.note}>
              <FormTextarea
                aria-label={c.note}
                disabled={actionBusy || unresolved || reloadRequired}
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
                  disabled={actionBusy || unresolved || reloadRequired}
                  maxLength={2000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FormField>
              <FormCheckbox
                label={c.refundOutside}
                checked={confirmed}
                disabled={actionBusy || unresolved || reloadRequired}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
            </>
          ) : null}
          {action === "deliver" ? (
            <FormCheckbox
              label={c.deliveredConfirm}
              checked={confirmed}
              disabled={actionBusy || unresolved || reloadRequired}
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
                        disabled={actionBusy || unresolved || reloadRequired}
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
