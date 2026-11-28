"use client";

import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Grid,
  Group,
  List,
  Paper,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { CSAOrderPanel } from "@/components/csa-order-panel";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FormSelect } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { StoreOrderProducts } from "@/components/store-order-products";
import { StoreOrderStatusBadge } from "@/components/store-order-status";
import { StoreOrderSummary } from "@/components/store-order-summary";
import { useToast } from "@/components/toast-provider";
import { useAcknowledgeStoreOrderCreation } from "@/lib/use-store-order-creation";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { useAdminMutationIntent } from "@/lib/admin-mutation-intent";
import {
  isProtectedDataError,
  isUncertainMutationError,
  requestErrorMessage,
} from "@/lib/client-error";
import {
  formatStoreMoney,
  getStoreOrder,
  getStoreOrderActions,
  getStoreOrderPrimaryAction,
  IdempotencyKeyStore,
  inspectStoreFarmDraft,
  MAX_STORE_QUANTITY,
  mutateStoreOrder,
  parseStoreQuantity,
  reconcileStoreFarmDraft,
  reflectsStoreOrderAction,
  storeDeadlineRemainingMs,
  storeOrderHasDeadline,
  storeQuantityDisplayValue,
  storeQuantityInputValue,
  storeQuantityPasteReplacement,
  type StoreFarmDraft,
  type StoreOrderConfirmation,
} from "@/lib/store-orders";
import {
  storeCancellationReason,
  storeOrderActionLabel,
  storeOrderActionTitle,
  storeOrderConflictMessage,
  storeOrderDeadlineLabel,
  storeOrderCountdown,
  storeOrdersCopy,
  storeRefundStatusLabel,
  storeRestockUnavailableReason,
} from "@/lib/store-orders-copy";
import type {
  StoreApprovalSource,
  StoreOrder,
  StoreOrderAction,
  StoreOrderAllocationDraft,
} from "@/lib/types";
import styles from "./store-order-detail.module.css";

type StoreRestockAllocation = { allocation_id: string; quantity: number };

type StoreOrderActionPayload = {
  reason?: string;
  note?: string;
  reconciliation_note?: string;
  amount_vnd?: string;
  sources?: StoreApprovalSource[];
  // Previously submitted approvals may still contain the ordered legacy allocations.
  allocations?: StoreOrderAllocationDraft[] | StoreRestockAllocation[];
};

type StoreOrderIntent = {
  orderId: string;
  action: StoreOrderAction;
  payload: StoreOrderActionPayload & { idempotency_key: string };
  confirmation: StoreOrderConfirmation;
};

const STORE_REASON_MAX_LENGTH = 1000;
const STORE_NOTE_MAX_LENGTH = 2000;

function trimActionText(value: string) {
  // Keep the existing UI trim and account for whitespace stripped by DRF.
  return value
    .trim()
    .replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu, "");
}

function actionTextError(
  value: string,
  max: number,
  copy: ReturnType<typeof storeOrdersCopy>,
  requiredMessage?: string,
) {
  const text = trimActionText(value);
  if (text.includes("\0") || /\p{Cs}/u.test(text)) return copy.actionTextInvalid;
  if (!text) return requiredMessage;
  if (Array.from(text).length > max) {
    return copy.actionTextTooLong.replace("{max}", String(max));
  }
}

function restockMaximum(row: NonNullable<StoreOrder["allocations"]>[number]) {
  return row.restock_eligible ? Math.min(MAX_STORE_QUANTITY, row.restock_remaining_quantity) : 0;
}

function parseRestockQuantity(raw: string, max: number) {
  return raw === "" ? 0 : parseStoreQuantity(raw, 0, max);
}

export function StoreOrderDetail({ orderId }: { orderId: string }) {
  const routeId = orderId.toLowerCase();
  return <StoreOrderDetailContent key={routeId} orderId={routeId} />;
}

function StoreOrderDetailContent({ orderId }: { orderId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const c = storeOrdersCopy(locale);
  const { ref: layoutRef, width: contentWidth } = useElementSize();
  const historyHeading = useId();
  const isSessionCurrent = useIsAdminQueryScopeCurrent();
  const latestCopy = useRef({ t, c, locale });
  latestCopy.current = { t, c, locale };
  const mounted = useRef(false);
  const isMounted = useCallback(() => mounted.current && isSessionCurrent(), [isSessionCurrent]);
  const { intent: savedIntent, controls } = useAdminMutationIntent<
    StoreOrderIntent,
    StoreOrderConfirmation
  >("store-order", orderId);
  const pendingIntent = savedIntent?.phase === "unknown" ? savedIntent.payload : null;
  const unresolved = pendingIntent !== null;
  const approvalInFlight =
    (savedIntent?.phase === "pending" || savedIntent?.phase === "unknown") &&
    savedIntent.payload.action === "approve";
  const [order, setOrder] = useState<StoreOrder | null>(null);
  useAcknowledgeStoreOrderCreation(order?.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<StoreFarmDraft>(() => new Map());
  const [tick, setTick] = useState(0);
  const csaRevision = useRef<string | null>(null);
  const receivedAt = useRef(performance.now());
  const requestId = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const refreshControl = useRef<HTMLButtonElement>(null);
  const initialRead = useRef(false);
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
  const [reloadConflictGate, setReloadConflictGate] = useState(false);
  const confirmedAction = savedIntent?.phase === "confirmed" ? savedIntent.receipt : null;
  const intentRetired = savedIntent?.phase === "retired";
  const reloadRequired = reloadConflictGate || confirmedAction !== null || intentRetired;
  const actionBusy = savedIntent?.phase === "pending";
  const [restock, setRestock] = useState<Record<string, string>>({});
  const restockLedgerAtOpen = useRef<Record<string, number>>({});

  const applyOrder = useCallback((next: StoreOrder) => {
    const selection = next.csa?.selection;
    const revision = selection ? `${selection.id}:${selection.revision}:${selection.state}` : null;
    const preserveDraft = revision === csaRevision.current;
    csaRevision.current = revision;
    receivedAt.current = performance.now();
    setOrder(next);
    setDraft((previous) => reconcileStoreFarmDraft(next, preserveDraft ? previous : undefined));
  }, []);

  const retireOrder = useCallback(
    (discardIntent: boolean) => {
      setOrder(null);
      setDraft(new Map());
      csaRevision.current = null;
      expiryReloaded.current = null;
      setAction(null);
      setActionError("");
      setActionConflict(false);
      setReconciliationDialog(false);
      setReconciliationChoice(null);
      setConfirmed(false);
      setReason("");
      setNote("");
      setRestock({});
      restockLedgerAtOpen.current = {};
      idempotencyKeys.current = new IdempotencyKeyStore();
      if (discardIntent) {
        controls.retire();
      }
      setReloadConflictGate(true);
    },
    [controls],
  );

  const load = useCallback(async () => {
    const latestIntent = controls.read();
    if (!isMounted() || submitting.current || latestIntent?.phase === "pending") return;
    const confirmation = latestIntent?.phase === "confirmed" ? latestIntent.receipt : null;
    const current = ++requestId.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const isCurrent = () =>
      isMounted() && !controller.signal.aborted && current === requestId.current;
    setLoading(true);
    try {
      const next = await getStoreOrder(orderId, controller.signal, {
        shouldRedirectToLogin: isCurrent,
      });
      if (!isCurrent()) return;
      if (confirmation && !reflectsStoreOrderAction(next, confirmation)) {
        setError("");
        return;
      }
      applyOrder(next);
      setError("");
      setReloadConflictGate(false);
      if (confirmation) controls.clear();
    } catch (caught) {
      if (!isCurrent()) return;
      const { message, status } = (caught ?? {}) as { message?: string; status?: number };
      if (isProtectedDataError(caught) || status === 404) retireOrder(true);
      else if (message === "invalid_response") retireOrder(false);
      setError(requestErrorMessage(caught, latestCopy.current.t));
    } finally {
      if (readController.current === controller) readController.current = null;
      if (isCurrent()) setLoading(false);
    }
  }, [applyOrder, controls, isMounted, orderId, retireOrder]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
      readController.current?.abort();
      initialRead.current = false;
    };
  }, []);
  useEffect(() => {
    if (actionBusy || initialRead.current) return;
    initialRead.current = true;
    void load();
  }, [actionBusy, load]);

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
      reloadRequired ||
      expiryReloaded.current === order.expires_at
    )
      return;
    expiryReloaded.current = order.expires_at;
    void load();
  }, [load, order, reloadRequired, remaining, tick]);

  const refreshOrder = () => {
    if (!loading && !actionBusy && !readController.current) void load();
  };

  if (!order) {
    return (
      <Stack gap="md" miw={0} ref={layoutRef}>
        <VisuallyHidden component="h1">{t.breadcrumb.orderDetails}</VisuallyHidden>
        {loading ? (
          <>
            <Stack gap="xs" aria-hidden>
              <Skeleton height="var(--mantine-h1-font-size)" width="12rem" maw="100%" />
              <Skeleton height="var(--mantine-font-size-sm)" width="8rem" maw="100%" />
            </Stack>
            <Grid
              gutter="md"
              className={styles.layout}
              classNames={
                contentWidth >= 880
                  ? { inner: styles.desktopGrid, col: styles.desktopColumn }
                  : undefined
              }
            >
              <Grid.Col className={styles.products} miw={0}>
                <StoreOrderProducts />
              </Grid.Col>
              {contentWidth >= 880 && (
                <Grid.Col className={styles.information} miw={0}>
                  <Paper p="md" aria-hidden>
                    <Stack gap="sm">
                      <Skeleton height="var(--mantine-font-size-md)" width="7rem" />
                      <Skeleton height="var(--mantine-font-size-sm)" />
                      <Skeleton height="var(--mantine-font-size-sm)" />
                    </Stack>
                  </Paper>
                </Grid.Col>
              )}
            </Grid>
          </>
        ) : (
          <RecoveryAlert
            message={confirmedAction ? c.mutationConfirmedReload : error}
            retryLabel={t.common.retry}
            onRetry={refreshOrder}
          />
        )}
      </Stack>
    );
  }

  const currentOrder = order;
  const historical = currentOrder.creation?.origin === "admin_historical";
  const recordedAtLabel = historical ? c.historicalRecordedAt : c.createdAt;
  const deadlineLabel = storeOrderDeadlineLabel(currentOrder, locale);
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
    !historical && pendingIntent && !visibleActions.includes(pendingIntent.action)
      ? pendingIntent.action
      : null;
  const replaying = pendingIntent?.orderId === orderId && pendingIntent.action === action;
  const recoveryDialog =
    action !== null && (recoveryAction === action || (action === "approve" && replaying));
  const primaryAction = getStoreOrderPrimaryAction(actions);
  visibleActions.sort((a, b) => Number(a === primaryAction) - Number(b === primaryAction));
  const farmDraft =
    !approvalInFlight && actions.includes("approve")
      ? inspectStoreFarmDraft(currentOrder, draft)
      : null;
  const actionLocked = loading || Boolean(error) || reloadRequired || actionBusy;
  const fieldsLocked = actionLocked || unresolved;
  const showCancelNote =
    action === "cancel" && (currentOrder.workflow_version !== 2 || Boolean(currentOrder.csa));
  const reasonRequired =
    action === "cancel"
      ? c.cancelReasonRequired
      : action === "close-refund-request"
        ? c.closeRefundReasonRequired
        : undefined;
  const reasonError = reasonRequired
    ? actionTextError(reason, STORE_REASON_MAX_LENGTH, c, reasonRequired)
    : undefined;
  const noteError =
    action === "refund" || action === "record-payment" || showCancelNote
      ? actionTextError(
          note,
          STORE_NOTE_MAX_LENGTH,
          c,
          action === "refund" ? c.refundNoteRequired : undefined,
        )
      : undefined;
  const orderAllocations = action === "restock" ? (currentOrder.allocations ?? []) : [];
  const allocationsById = new Map(orderAllocations.map((row) => [row.id, row]));
  const restockLines = new Map(
    (action === "restock" ? order.lines : []).map((line) => [line.id, line]),
  );
  const restockAllocationPayload =
    action === "restock" && !replaying ? parseRestockAllocations() : null;
  const restockRows =
    action === "restock"
      ? orderAllocations.filter((row) => row.restock_remaining_quantity > 0)
      : [];
  const restockProductHeaders = new Map<string, string>();
  for (const row of restockRows) {
    if (!restockProductHeaders.has(row.line_id)) restockProductHeaders.set(row.line_id, row.id);
  }
  const showNote =
    showCancelNote ||
    action === "refund" ||
    (action === "record-payment" && (!reconciliationDialog || reconciliationChoice !== null));
  const timeline = [
    { label: recordedAtLabel, value: order.created_at },
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
    if (
      !isMounted() ||
      historical ||
      currentOrder.id.toLowerCase() !== orderId ||
      loading ||
      error ||
      reloadRequired ||
      actionBusy ||
      submitting.current
    )
      return;
    if (pendingIntent) {
      if (pendingIntent.orderId !== orderId || pendingIntent.action !== next) return;
      const {
        reason: sentReason,
        note: sentNote,
        reconciliation_note,
        allocations,
      } = pendingIntent.payload;
      setReason(sentReason ?? "");
      setNote(sentNote ?? reconciliation_note ?? "");
      if (next === "restock") {
        setRestock(
          Object.fromEntries(
            (allocations ?? []).flatMap((row) =>
              "allocation_id" in row ? [[row.allocation_id, String(row.quantity)]] : [],
            ),
          ),
        );
      }
      setAction(next);
      setActionError(next === "approve" ? c.approvalUncertain : c.mutationUncertain);
      return;
    }
    if (!actions.includes(next) || (next === "approve" && !farmDraft?.sources)) return;
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
          .map((row) => [row.id, "0"]),
      ),
    );
  }

  function actionPayload(): StoreOrderActionPayload | null {
    if (!action) return null;
    if (action === "approve") return farmDraft?.sources ? { sources: farmDraft.sources } : null;
    if (action === "cancel")
      return currentOrder.workflow_version === 2 && !currentOrder.csa
        ? { reason: trimActionText(reason) }
        : { reason: trimActionText(reason), reconciliation_note: trimActionText(note) };
    if (action === "close-refund-request") return { reason: trimActionText(reason) };
    if (action === "record-payment") return { note: trimActionText(note) };
    if (action === "refund")
      return { amount_vnd: currentOrder.total_vnd, note: trimActionText(note) };
    if (action === "restock")
      return restockAllocationPayload ? { allocations: restockAllocationPayload } : null;
    return {};
  }

  function parseRestockAllocations(): StoreRestockAllocation[] | null {
    const allocations: StoreRestockAllocation[] = [];
    // The draft is keyed by allocation ID, so one ID cannot produce multiple rows.
    for (const [allocation_id, raw] of Object.entries(restock)) {
      const row = allocationsById.get(allocation_id);
      if (!row) return null;
      const quantity = parseRestockQuantity(raw, restockMaximum(row));
      if (quantity === null) return null;
      if (quantity > 0) allocations.push({ allocation_id, quantity });
    }
    return allocations.length ? allocations : null;
  }

  function validateActionInput() {
    if (replaying) return undefined;
    if (reasonError || noteError) return reasonError ?? noteError;
    if (action === "approve" && !farmDraft?.sources) return c.approveSourcesInvalid;
    if (action === "restock" && !restockAllocationPayload) return c.restockInvalid;
  }

  function actionDisabled() {
    if (!action || loading || error || reloadRequired || (!actions.includes(action) && !replaying))
      return true;
    if (replaying) return false;
    return Boolean(
      (reconciliationDialog && !reconciliationChoice) ||
      ((action === "refund" || action === "deliver") && !confirmed) ||
      validateActionInput(),
    );
  }

  function discardPendingReads() {
    // Mutation results (including conflicts) supersede every older GET response.
    requestId.current += 1;
    readController.current?.abort();
    setLoading(false);
  }

  async function submitAction() {
    if (
      !isMounted() ||
      historical ||
      !action ||
      currentOrder.id.toLowerCase() !== orderId ||
      actionBusy ||
      submitting.current ||
      loading ||
      error ||
      reloadRequired ||
      (pendingIntent ? !replaying : !actions.includes(action))
    )
      return;
    const expiredNow =
      storeOrderHasDeadline(currentOrder) &&
      storeDeadlineRemainingMs(currentOrder, receivedAt.current, performance.now()) === 0;
    if (
      !pendingIntent &&
      !getStoreOrderActions(currentOrder, { expired: expiredNow }).includes(action)
    ) {
      expiryReloaded.current = currentOrder.expires_at;
      void load();
      return;
    }
    const inputError = validateActionInput();
    if (inputError) {
      setActionError(inputError);
      return;
    }
    if (actionDisabled()) return;
    const payload = pendingIntent?.payload ?? actionPayload();
    if (!payload) return;
    // Compare the ledger captured when opening this intent, not a background refresh.
    // Reopening after a confirmed restock creates a new key; retries retain their key.
    const newRestockAllocations = pendingIntent ? null : restockAllocationPayload;
    const restockRevision = newRestockAllocations
      ? Object.fromEntries(
          newRestockAllocations.map(({ allocation_id }) => [
            allocation_id,
            restockLedgerAtOpen.current[allocation_id],
          ]),
        )
      : undefined;
    const intent = pendingIntent ?? {
      orderId,
      action,
      payload: {
        idempotency_key: idempotencyKeys.current.forPayload(action, payload, restockRevision),
        ...payload,
      },
      confirmation: {
        action,
        refundRequestedAt:
          action === "close-refund-request" && currentOrder.workflow_version === 1
            ? currentOrder.refund_requested_at
            : undefined,
        minimumRestocked: newRestockAllocations
          ? Object.fromEntries(
              newRestockAllocations.map(({ allocation_id, quantity }) => [
                allocation_id,
                allocationsById.get(allocation_id)!.restocked_quantity + quantity,
              ]),
            )
          : undefined,
      },
    };
    const attempt = controls.begin(intent);
    if (!attempt) return;
    discardPendingReads();
    submitting.current = true;
    setActionError("");
    setActionConflict(false);
    try {
      const sent = attempt.payload;
      const updated = await mutateStoreOrder(sent.orderId, sent.action, sent.payload, {
        shouldRedirectToLogin: isMounted,
      });
      const usable = updated && reflectsStoreOrderAction(updated, sent.confirmation);
      if (
        !isSessionCurrent() ||
        !controls.settle(
          attempt,
          usable && isMounted()
            ? null
            : {
                phase: "confirmed",
                receipt: sent.confirmation,
              },
        ) ||
        !isMounted()
      )
        return;
      discardPendingReads();
      idempotencyKeys.current.clear(action);
      setAction(null);
      setError("");
      if (updated && usable) {
        applyOrder(updated);
        setReloadConflictGate(false);
        toast(latestCopy.current.c.mutationSuccess);
      }
    } catch (caught) {
      const { message, status } = (caught ?? {}) as { message?: string; status?: number };
      const denied =
        (message !== "csrf_rejected" && isProtectedDataError(caught)) || status === 404;
      const unknownResult =
        !denied && (isUncertainMutationError(caught) || (replaying && message === "csrf_rejected"));
      if (
        !isSessionCurrent() ||
        !controls.settle(
          attempt,
          denied ? { phase: "retired" } : unknownResult ? { ...attempt, phase: "unknown" } : null,
        ) ||
        !isMounted()
      )
        return;
      discardPendingReads();
      if (denied) {
        retireOrder(true);
        setError(requestErrorMessage(caught, latestCopy.current.t));
        return;
      }
      if (!unknownResult && status === 409) {
        setReloadConflictGate(true);
        setActionConflict(true);
        setActionError(storeOrderConflictMessage(message, latestCopy.current.locale));
      } else {
        const { t: dictionary, c: copy } = latestCopy.current;
        const feedback =
          status === 408
            ? dictionary.common.requestTimeout
            : requestErrorMessage(caught, dictionary);
        const uncertain = action === "approve" ? copy.approvalUncertain : copy.mutationUncertain;
        setActionError(unknownResult ? `${feedback} ${uncertain}` : feedback);
      }
    } finally {
      submitting.current = false;
    }
  }

  async function reloadConflict() {
    setAction(null);
    setActionError("");
    setActionConflict(false);
    if (action) idempotencyKeys.current.clear(action);
    await load();
  }

  const feedback = confirmedAction
    ? c.mutationConfirmedReload
    : intentRetired
      ? c.mutationUncertain
      : error
        ? `${error} ${c.staleSnapshot}`
        : c.conflictReloadRequired;
  const hasPendingWork =
    order.status === "cancelled" &&
    (order.refund_status === "pending" || actions.includes("restock"));

  return (
    <Stack gap="md" miw={0} ref={layoutRef}>
      <Group component="header" justify="space-between" align="flex-start" gap="md">
        <Stack gap="xs" miw={0} style={{ overflowWrap: "anywhere" }}>
          <Title order={1}>{order.reference_code}</Title>
          <Group gap="sm">
            <StoreOrderStatusBadge order={order} />
            {historical && <Text size="sm">{c.historicalOrder}</Text>}
            <Text size="sm" c="dimmed">
              {recordedAtLabel}{" "}
              <time dateTime={order.created_at}>{formatAdminDateTime(order.created_at)}</time>
            </Text>
          </Group>
          {order.expires_at && storeOrderHasDeadline(order) && (
            <Group gap="sm">
              <Text size="sm" c="dimmed">
                {deadlineLabel}{" "}
                <time dateTime={order.expires_at}>{formatAdminDateTime(order.expires_at)}</time>
              </Text>
              <Text size="sm" fw={600}>
                {storeOrderCountdown(remaining, locale)}
              </Text>
            </Group>
          )}
        </Stack>
        <Group gap="sm" align="center">
          <Tooltip label={c.refresh}>
            <ActionIcon
              ref={refreshControl}
              variant="default"
              type="button"
              aria-label={c.refresh}
              aria-busy={loading}
              loading={loading}
              disabled={actionBusy}
              onClick={refreshOrder}
            >
              <IconRefresh size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
          {recoveryAction && (
            <Button
              variant="default"
              disabled={actionLocked}
              onClick={() => openAction(recoveryAction)}
              type="button"
            >
              {c.retryRequest}
            </Button>
          )}
          {visibleActions.length > 0 && (
            <Group role="group" aria-label={c.actions} gap="sm">
              {visibleActions.map((item) => (
                <Button
                  variant={
                    item === primaryAction ? "filled" : item === "cancel" ? "outline" : "default"
                  }
                  color={item === "cancel" || item === "refund" ? "danger" : undefined}
                  disabled={
                    actionLocked ||
                    (pendingIntent !== null && pendingIntent.action !== item) ||
                    (!unresolved && item === "approve" && !farmDraft?.sources)
                  }
                  key={item}
                  onClick={() => openAction(item)}
                  type="button"
                >
                  {item === "approve" && pendingIntent?.action === "approve"
                    ? c.retryRequest
                    : storeOrderActionLabel(order, item, locale)}
                </Button>
              ))}
            </Group>
          )}
        </Group>
      </Group>
      {!action &&
        (error || (reloadRequired && !loading)) &&
        (loading ? (
          <Alert color="danger" role="alert">
            {feedback}
          </Alert>
        ) : (
          <RecoveryAlert message={feedback} retryLabel={t.common.retry} onRetry={refreshOrder} />
        ))}
      {order.cancellation_reason && (
        <Alert color="neutral" role="note" title={c.cancellationReason}>
          <Text size="sm" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
            {storeCancellationReason(order.cancellation_reason, locale)}
          </Text>
        </Alert>
      )}
      {hasPendingWork && (
        <Alert color="warning" role="note">
          <List size="sm">
            {order.refund_status === "pending" && (
              <List.Item>{storeRefundStatusLabel(order.refund_status, locale, order)}</List.Item>
            )}
            {actions.includes("restock") && <List.Item>{c.restockPending}</List.Item>}
          </List>
        </Alert>
      )}
      {unresolved && !action && (
        <Alert color="warning">
          {approvalInFlight ? c.approvalUncertain : c.mutationUncertain}
        </Alert>
      )}
      <CSAOrderPanel
        order={order}
        disabled={fieldsLocked}
        onReload={() => {
          // The reopen result supersedes any GET started before it completed.
          void load();
        }}
        onAccessDenied={(caught) => {
          requestId.current += 1;
          readController.current?.abort();
          retireOrder(true);
          setLoading(false);
          setError(requestErrorMessage(caught, t));
        }}
      />
      <Grid
        columns={12}
        gutter="md"
        align="start"
        className={styles.layout}
        classNames={
          contentWidth >= 880 ? { inner: styles.desktopGrid, col: styles.desktopColumn } : undefined
        }
      >
        <Grid.Col className={styles.products} miw={0}>
          <StoreOrderProducts
            order={order}
            farms={
              farmDraft
                ? {
                    selections: farmDraft.selections,
                    onChange: (lineId, farmId) => {
                      if (fieldsLocked) return;
                      setDraft((previous) => new Map(previous).set(lineId, farmId));
                    },
                    disabled: fieldsLocked,
                  }
                : undefined
            }
          />
        </Grid.Col>
        <Grid.Col className={styles.information} miw={0}>
          <StoreOrderSummary order={order} />
        </Grid.Col>
        <Grid.Col className={styles.history} miw={0}>
          <Paper component="section" aria-labelledby={historyHeading} p="md">
            <Stack gap="md">
              <Title id={historyHeading} order={2} size="md" fw={600}>
                {c.timelineTitle}
              </Title>
              <RecordDetailFields>
                {timeline.map((event) => (
                  <RecordDetailField key={event.label} label={event.label}>
                    <time dateTime={event.value!}>{formatAdminDateTime(event.value!)}</time>
                  </RecordDetailField>
                ))}
                {[
                  [c.reconciliationNote, order.reconciliation_note],
                  [c.refundRequestClosedReason, order.refund_request_closed_reason],
                  [c.refundNote, order.refund_note],
                ].map(([label, value]) =>
                  value ? (
                    <RecordDetailField key={label} label={label!}>
                      <Text component="span" style={{ whiteSpace: "pre-wrap" }}>
                        {value}
                      </Text>
                    </RecordDetailField>
                  ) : null,
                )}
              </RecordDetailFields>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      {action ? (
        <ConfirmationDialog
          busy={actionBusy}
          busyLabel={c.saving}
          cancelLabel={c.cancelButton}
          confirmDisabled={actionDisabled()}
          confirmLabel={
            recoveryDialog
              ? c.retryRequest
              : reconciliationDialog
                ? c.confirmReconciliation
                : storeOrderActionLabel(order, action, locale)
          }
          danger={action === "cancel" || action === "refund"}
          error={actionError}
          fallbackFocusRef={refreshControl}
          alternateLabel={actionConflict ? c.reloadAfterConflict : undefined}
          onAlternate={actionConflict ? () => void reloadConflict() : undefined}
          onCancel={() => !actionBusy && setAction(null)}
          onConfirm={() => void submitAction()}
          title={
            action === "approve" && actionBusy
              ? c.approvalSubmitting
              : recoveryDialog
                ? c.retryRequest
                : reconciliationDialog
                  ? c.reconcile
                  : storeOrderActionTitle(order, action, locale)
          }
        >
          {loading ? (
            <Text size="sm" c="dimmed" role="status">
              {c.detailLoading}
            </Text>
          ) : error ? (
            <RecoveryAlert message={error} retryLabel={t.common.retry} onRetry={refreshOrder} />
          ) : null}
          <RecordDetailFields>
            <RecordDetailField label={c.reference}>{order.reference_code}</RecordDetailField>
            {action === "restock" || action === "deliver" ? (
              <RecordDetailField label={c.quantity}>
                {String(
                  action === "restock"
                    ? Object.values(restock).reduce(
                        (total, raw) =>
                          total + (parseRestockQuantity(raw, MAX_STORE_QUANTITY) ?? 0),
                        0,
                      )
                    : order.lines.reduce((total, line) => total + line.quantity, 0),
                )}
              </RecordDetailField>
            ) : (
              <RecordDetailField label={action === "refund" ? c.refundAmount : c.total}>
                {formatStoreMoney(order.total_vnd, locale)}
              </RecordDetailField>
            )}
          </RecordDetailFields>
          {reconciliationDialog && (
            <FormSelect
              label={c.reconciliationDecision}
              disabled={fieldsLocked}
              value={reconciliationChoice ?? ""}
              onChange={(choice) => {
                if (fieldsLocked) return;
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
          )}
          {action === "approve" && !approvalInFlight && !farmDraft?.sources && (
            <Text size="sm">{c.approveSourcesInvalid}</Text>
          )}
          {reasonRequired && (
            <Textarea
              label={action === "cancel" ? c.cancelReason : c.closeRefundReason}
              required
              withAsterisk={false}
              disabled={fieldsLocked}
              error={replaying ? undefined : reasonError}
              value={reason}
              onChange={(event) => {
                setReason(event.currentTarget.value);
                setActionError("");
              }}
            />
          )}
          {action === "refund" && <Text size="sm">{c.refundHint}</Text>}
          {showNote && (
            <Textarea
              label={action === "refund" ? c.refundNote : c.note}
              required={action === "refund"}
              withAsterisk={false}
              disabled={fieldsLocked}
              error={replaying ? undefined : noteError}
              value={note}
              onChange={(event) => {
                setNote(event.currentTarget.value);
                setActionError("");
              }}
            />
          )}
          {(action === "refund" || action === "deliver") && (
            <Checkbox
              label={action === "refund" ? c.refundOutside : c.deliveredConfirm}
              checked={confirmed}
              disabled={fieldsLocked}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />
          )}
          {restockRows.map((row) => {
            const line = restockLines.get(row.line_id);
            const product = line?.name ?? row.product_id;
            const sku = line?.sku ?? row.product_id;
            const label = c.restockQuantity
              .replace("{product}", product)
              .replace("{sku}", sku)
              .replace("{farm}", row.farm_name)
              .replace("{batch}", row.batch_id);
            const max = restockMaximum(row);
            const raw = restock[row.id] ?? "0";
            const invalidQuantity = parseRestockQuantity(raw, max) === null;
            const updateQuantity = (quantity: string) => {
              setRestock((current) => ({ ...current, [row.id]: quantity }));
              setActionError("");
            };
            return (
              <Stack gap="xs" key={row.id} miw={0} style={{ overflowWrap: "anywhere" }}>
                {restockProductHeaders.get(row.line_id) === row.id && (
                  <Text fw={600}>{product}</Text>
                )}
                <Text size="sm" c="dimmed">
                  {sku}
                  {line ? ` · ${line.unit_size} ${line.unit_label}` : ""}
                </Text>
                <Text size="sm" c="dimmed">
                  {row.farm_name} · {formatAdminDate(row.start_date)} –{" "}
                  {formatAdminDate(row.end_date)}
                </Text>
                <Text size="sm" c="dimmed">
                  {c.restockBatch.replace("{batch}", row.batch_id)}
                </Text>
                <Text size="sm" c="dimmed">
                  {c.restockAllocation
                    .replace("{allocated}", String(row.quantity))
                    .replace("{restocked}", String(row.restocked_quantity))}
                  {" · "}
                  {row.restock_eligible && row.restock_remaining_quantity > 0
                    ? c.restockableQuantity.replace(
                        "{count}",
                        String(row.restock_remaining_quantity),
                      )
                    : row.restock_remaining_quantity === 0
                      ? c.fullyRestocked
                      : c.restockUnavailable}
                </Text>
                {!row.restock_eligible && (
                  <Text size="sm" c="danger">
                    {storeRestockUnavailableReason(row.restock_unavailable_reason, locale)}
                  </Text>
                )}
                <TextInput
                  label={label}
                  type="text"
                  inputMode="numeric"
                  disabled={fieldsLocked}
                  error={
                    !replaying && invalidQuantity
                      ? c.restockQuantityRange.replace("{max}", String(max))
                      : undefined
                  }
                  value={storeQuantityDisplayValue(raw)}
                  onInput={(event) =>
                    updateQuantity(storeQuantityInputValue(event.currentTarget, event.nativeEvent))
                  }
                  onChange={(event) => {
                    if (event.nativeEvent.type !== "input") {
                      updateQuantity(
                        storeQuantityInputValue(event.currentTarget, event.nativeEvent),
                      );
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      raw &&
                      !event.currentTarget.value &&
                      !event.nativeEvent.isComposing &&
                      (event.key === "Backspace" || event.key === "Delete")
                    ) {
                      updateQuantity("");
                    }
                  }}
                  onPaste={(event) => {
                    const replacement = storeQuantityPasteReplacement(
                      event.currentTarget,
                      event.clipboardData.getData("text/plain"),
                      raw,
                    );
                    if (replacement !== null) {
                      event.preventDefault();
                      updateQuantity(replacement);
                    }
                  }}
                />
              </Stack>
            );
          })}
        </ConfirmationDialog>
      ) : null}
    </Stack>
  );
}
