"use client";
import { DataState } from "@/components/nfv-controls";

import { FormInput, FormTextarea, FormSelect, FormField } from "@/components/nfv-controls";

import { Button, Table, Alert } from "@mantine/core";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Pagination } from "@/components/pagination";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { formatAdminDateTime } from "@/lib/admin-date";
import { useAdminMutationIntent } from "@/lib/admin-mutation-intent";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { apiEnvelope } from "@/lib/client-api";
import { requirePaginatedList, requireResponseEntity } from "@/lib/api-response";
import {
  invalidApiResponse,
  isApiObject,
  isProtectedDataError,
  isUncertainMutationError,
  requestErrorMessage,
} from "@/lib/client-error";
import {
  numericInputErrorMessage,
  parsePositiveInteger,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import type { PointDirection, PointHistoryMeta, PointTransaction } from "@/lib/types";

type PendingTransaction = {
  direction: PointDirection;
  amount: number;
  message: string;
};

export function PointLedger({
  userId,
  userName,
  onBalanceChange,
  onAccessLost,
}: {
  userId: string;
  userName: string;
  onBalanceChange?: (balance: number) => void;
  onAccessLost?: (error: unknown) => void;
}) {
  const { t } = useAdminI18n();
  const toast = useToast();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const { intent, controls } = useAdminMutationIntent<
    PendingTransaction & { idempotency_key: string }
  >("points", userId);
  const replay = intent?.phase === "unknown" ? intent.payload : null;
  const mounted = useRef(false);
  const [items, setItems] = useState<PointTransaction[] | null>(null);
  const [meta, setMeta] = useState<PointHistoryMeta | null>(null);
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<PointDirection>("credit");
  const [amount, setAmount] = useState("100");
  const [amountError, setAmountError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingTransaction, setPendingTransaction] = useState<PendingTransaction | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [targetProtected, setTargetProtected] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const historyRequest = useRef<AbortController | null>(null);
  const canAdjustPoints = meta?.can_adjust_points === true && !targetProtected;
  const busy = saving || intent?.phase === "pending";

  const retire = useCallback(
    (caught: unknown) => {
      controls.retire();
      historyRequest.current?.abort();
      setItems(null);
      setMeta(null);
      setPendingTransaction(null);
      setMessage("");
      onAccessLost?.(caught);
    },
    [controls, onAccessLost],
  );

  const load = useCallback(() => {
    if (!isCurrent()) return;
    historyRequest.current?.abort();
    const request = new AbortController();
    historyRequest.current = request;
    setItems(null);
    setLoadError("");
    apiEnvelope<PointTransaction[], PointHistoryMeta>(`admin/users/${userId}/points?page=${page}`, {
      signal: request.signal,
    })
      .then((payload) => {
        if (request.signal.aborted || !mounted.current || !isCurrent()) return;
        const { data, meta } = requirePaginatedList(payload, requireResponseEntity);
        setItems(data);
        setMeta(meta);
        if (meta.can_adjust_points !== true) setPendingTransaction(null);
      })
      .catch((caught) => {
        if (request.signal.aborted || !mounted.current || !isCurrent()) return;
        if (isProtectedDataError(caught)) retire(caught);
        setMeta(null);
        setPendingTransaction(null);
        setLoadError(requestErrorMessage(caught, t));
      });
  }, [isCurrent, page, retire, t, userId]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      historyRequest.current?.abort();
    };
  }, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canAdjustPoints || savingRef.current || !isCurrent()) return;
    setError("");
    if (replay) {
      setPendingTransaction(replay);
      setError(t.points.adjustmentUncertain);
      return;
    }
    if (controls.read()) return;
    const parsedAmount = parsePositiveInteger(amount);
    if (parsedAmount.error) {
      setAmountError(numericInputErrorMessage(parsedAmount.error, t.common.numericInput));
      return;
    }
    setAmountError("");
    if (!message.trim()) {
      setError(t.points.messageRequired);
      return;
    }
    if (direction === "debit" && meta && parsedAmount.value > meta.balance) {
      setError(t.points.insufficient);
      return;
    }
    setPendingTransaction({ direction, amount: parsedAmount.value, message: message.trim() });
  }

  async function confirmTransaction() {
    if (!canAdjustPoints || !pendingTransaction || savingRef.current || !isCurrent()) return;
    const attempt = controls.begin(
      replay ?? { ...pendingTransaction, idempotency_key: crypto.randomUUID() },
    );
    if (!attempt) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const { data, meta: responseMeta } = await apiEnvelope<{
        transaction: PointTransaction;
        balance: number;
      }>(
        `admin/users/${userId}/points`,
        {
          method: "POST",
          body: JSON.stringify(attempt.payload),
        },
        { allowMissingData: true, shouldRedirectToLogin: () => mounted.current && isCurrent() },
      );
      const receipt = responseMeta?.action_receipt;
      if (
        !isApiObject(receipt) ||
        receipt.action !== "adjust_points" ||
        receipt.user_id !== userId ||
        receipt.idempotency_key !== attempt.payload.idempotency_key ||
        typeof receipt.transaction_id !== "string" ||
        !UUID_PATH_SEGMENT.test(receipt.transaction_id)
      ) {
        throw invalidApiResponse();
      }
      if (!isCurrent() || !controls.settle(attempt, null) || !mounted.current) return;
      setMessage("");
      if (
        data?.transaction?.id === receipt.transaction_id &&
        Number.isSafeInteger(data.balance) &&
        data.balance >= 0
      ) {
        setMeta((current) => (current ? { ...current, balance: data.balance } : current));
        onBalanceChange?.(data.balance);
      }
      setPendingTransaction(null);
      if (page === 1) load();
      else setPage(1);
      toast(t.points.created);
    } catch (caught) {
      if (!isCurrent()) return;
      const apiError = caught instanceof Error ? caught : null;
      const denied = isProtectedDataError(caught);
      const unknown =
        isUncertainMutationError(caught) || (replay && apiError?.message === "csrf_rejected");
      if (
        !controls.settle(
          attempt,
          denied ? { phase: "retired" } : unknown ? { ...attempt, phase: "unknown" } : null,
        ) ||
        !mounted.current
      )
        return;
      if (denied) retire(caught);
      if (apiError?.message === "account_target_protected") {
        setTargetProtected(true);
        setPendingTransaction(null);
        setError(t.users.accountActions.protected);
        return;
      }
      setError(
        apiError?.message === "insufficient_points"
          ? t.points.insufficient
          : unknown
            ? t.points.adjustmentUncertain
            : requestErrorMessage(caught, t),
      );
    } finally {
      savingRef.current = false;
      if (mounted.current && isCurrent()) setSaving(false);
    }
  }

  return (
    <section className="ledger-grid" aria-labelledby={`points-${userId}`}>
      {canAdjustPoints && (
        <div className="panel ledger-form">
          <div className="panel-head">
            <div>
              <h2>{t.points.newTransaction}</h2>
              <p className="muted-copy">
                {t.users.balance}: {meta?.balance ?? "—"}
              </p>
            </div>
          </div>
          <form className="form-grid one" noValidate onSubmit={submit}>
            <FormField className="field" label={t.points.direction}>
              <FormSelect
                value={direction}
                onChange={(value) => setDirection((value ?? "credit") as PointDirection)}
                data={[
                  { value: "credit", label: t.points.credit },
                  { value: "debit", label: t.points.debit },
                ]}
              />
            </FormField>
            <label className="field">
              <span>{t.points.amount}</span>
              <FormInput
                aria-invalid={Boolean(amountError)}
                inputMode="numeric"
                onChange={(event) => {
                  setAmount(sanitizeIntegerInput(event.target.value));
                  setAmountError("");
                }}
                required
                type="text"
                value={amount}
              />
              {amountError ? (
                <small className="field-error" role="alert">
                  {amountError}
                </small>
              ) : null}
            </label>
            <label className="field">
              <span>{t.points.message} *</span>
              <FormTextarea
                required
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            <Button disabled={busy || intent?.phase === "retired"} type="submit">
              {replay ? t.points.retryAdjustment : t.points.create}
            </Button>
          </form>
        </div>
      )}
      <div className="panel ledger-history">
        <div className="panel-head">
          <div>
            <h2 id={`points-${userId}`}>{t.points.history}</h2>
            {!canAdjustPoints && meta && (
              <p className="muted-copy">
                {t.users.balance}: {meta.balance}
              </p>
            )}
          </div>
        </div>
        {!canAdjustPoints && error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        {loadError ? (
          <RecoveryAlert message={loadError} retryLabel={t.common.retry} onRetry={load} />
        ) : !items ? (
          <DataState kind="loading" title={t.users.loading} />
        ) : items.length === 0 ? (
          <DataState kind="empty" title={t.points.empty} />
        ) : (
          <Table.ScrollContainer type="native" minWidth={700} className="table-wrap">
            <Table aria-label={t.points.history} tabularNums>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t.points.message}</Table.Th>
                  <Table.Th ta="right">{t.points.amount}</Table.Th>
                  <Table.Th>{t.points.actor}</Table.Th>
                  <Table.Th>{t.points.date}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>{item.message}</Table.Td>
                    <Table.Td
                      ta="right"
                      className={item.direction === "credit" ? "credit-value" : "debit-value"}
                    >
                      {item.direction === "credit" ? "+" : "−"}
                      {item.amount}
                    </Table.Td>
                    <Table.Td>{item.actor?.name ?? "—"}</Table.Td>
                    <Table.Td>{formatAdminDateTime(item.created_at)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {meta && (
          <Pagination
            page={meta.page}
            total={meta.total}
            pageSize={meta.page_size}
            onPage={setPage}
            previousLabel={t.common.previous}
            nextLabel={t.common.next}
            summary={t.common.pagination}
          />
        )}
      </div>
      {canAdjustPoints && pendingTransaction && (
        <ConfirmationDialog
          busy={busy}
          busyLabel={t.points.creating}
          cancelLabel={t.points.cancel}
          confirmLabel={t.points.confirm}
          error={error}
          onCancel={() => setPendingTransaction(null)}
          onConfirm={confirmTransaction}
          title={t.points.confirmTitle}
        >
          <p>
            {t.points.confirmBody
              .replace("{user}", userName)
              .replace(
                "{direction}",
                pendingTransaction.direction === "credit" ? t.points.credit : t.points.debit,
              )
              .replace("{amount}", String(pendingTransaction.amount))}
          </p>
          <p className="muted-copy">{pendingTransaction.message}</p>
        </ConfirmationDialog>
      )}
    </section>
  );
}
