"use client";
import { DataState } from "@/components/nfv-controls";

import { FormInput, FormTextarea, FormSelect, FormField } from "@/components/nfv-controls";

import { Button, Table, Alert } from "@mantine/core";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast-provider";
import { formatAdminDateTime } from "@/lib/admin-date";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
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
}: {
  userId: string;
  userName: string;
  onBalanceChange?: (balance: number) => void;
}) {
  const { t } = useAdminI18n();
  const toast = useToast();
  const [items, setItems] = useState<PointTransaction[] | null>(null);
  const [meta, setMeta] = useState<PointHistoryMeta | null>(null);
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<PointDirection>("credit");
  const [amount, setAmount] = useState("100");
  const [amountError, setAmountError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingTransaction, setPendingTransaction] = useState<PendingTransaction | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const load = useCallback(() => {
    setItems(null);
    apiEnvelope<PointTransaction[], PointHistoryMeta>(`admin/users/${userId}/points?page=${page}`)
      .then((payload) => {
        setItems(payload.data);
        setMeta(payload.meta ?? null);
      })
      .catch((caught) => setError(requestErrorMessage(caught, t)));
  }, [page, t, userId]);

  useEffect(load, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
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
    if (!pendingTransaction || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ transaction: PointTransaction; balance: number }>(
        `admin/users/${userId}/points`,
        {
          method: "POST",
          body: JSON.stringify(pendingTransaction),
        },
      );
      setMessage("");
      setMeta((current) => (current ? { ...current, balance: result.balance } : current));
      onBalanceChange?.(result.balance);
      setPendingTransaction(null);
      if (page === 1) load();
      else setPage(1);
      toast(t.points.created);
    } catch (caught) {
      const apiError = caught as Error & { payload?: { errors?: Array<{ detail?: string }> } };
      setError(
        apiError.payload?.errors?.[0]?.detail?.includes("Insufficient")
          ? t.points.insufficient
          : requestErrorMessage(caught, t),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="ledger-grid" aria-labelledby={`points-${userId}`}>
      <div className="panel ledger-form">
        <div className="panel-head">
          <div>
            <h2 id={`points-${userId}`}>{t.points.newTransaction}</h2>
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
          <Button disabled={saving} type="submit">
            {t.points.create}
          </Button>
        </form>
      </div>
      <div className="panel ledger-history">
        <div className="panel-head">
          <h2>{t.points.history}</h2>
        </div>
        {!items ? (
          <DataState kind="loading" title={t.users.loading} />
        ) : items.length === 0 ? (
          <DataState kind="empty" title={t.points.empty} />
        ) : (
          <div className="table-wrap">
            <Table className="point-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t.points.message}</Table.Th>
                  <Table.Th>{t.points.amount}</Table.Th>
                  <Table.Th>{t.points.actor}</Table.Th>
                  <Table.Th>{t.points.date}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>{item.message}</Table.Td>
                    <Table.Td
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
          </div>
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
      {pendingTransaction && (
        <ConfirmationDialog
          busy={saving}
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
