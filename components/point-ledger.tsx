"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
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
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const [items, setItems] = useState<PointTransaction[] | null>(null);
  const [meta, setMeta] = useState<PointHistoryMeta | null>(null);
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<PointDirection>("credit");
  const [amount, setAmount] = useState(100);
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
    if (!message.trim()) {
      setError(t.points.messageRequired);
      return;
    }
    if (direction === "debit" && meta && amount > meta.balance) {
      setError(t.points.insufficient);
      return;
    }
    setPendingTransaction({ direction, amount, message: message.trim() });
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
        <form className="form-grid one" onSubmit={submit}>
          <label className="field">
            <span>{t.points.direction}</span>
            <select
              className="input"
              value={direction}
              onChange={(event) => setDirection(event.target.value as PointDirection)}
            >
              <option value="credit">{t.points.credit}</option>
              <option value="debit">{t.points.debit}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.points.amount}</span>
            <input
              className="input"
              type="number"
              min="1"
              required
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>{t.points.message} *</span>
            <textarea
              className="textarea"
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={saving} type="submit">
            {t.points.create}
          </button>
        </form>
      </div>
      <div className="panel ledger-history">
        <div className="panel-head">
          <h2>{t.points.history}</h2>
        </div>
        {!items ? (
          <p>{t.users.loading}</p>
        ) : items.length === 0 ? (
          <div className="empty">{t.points.empty}</div>
        ) : (
          <div className="table-wrap">
            <table className="table point-table">
              <thead>
                <tr>
                  <th>{t.points.message}</th>
                  <th>{t.points.amount}</th>
                  <th>{t.points.actor}</th>
                  <th>{t.points.date}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.message}</td>
                    <td className={item.direction === "credit" ? "credit-value" : "debit-value"}>
                      {item.direction === "credit" ? "+" : "−"}
                      {item.amount}
                    </td>
                    <td>{item.actor?.name ?? "—"}</td>
                    <td>
                      {new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        <div className="confirmation-backdrop" role="presentation">
          <section
            aria-labelledby={`confirm-points-${userId}`}
            aria-modal="true"
            className="confirmation-dialog"
            role="dialog"
          >
            <h2 id={`confirm-points-${userId}`}>{t.points.confirmTitle}</h2>
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
            <div className="confirmation-actions">
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => setPendingTransaction(null)}
                type="button"
              >
                {t.points.cancel}
              </button>
              <button
                className="button"
                disabled={saving}
                onClick={confirmTransaction}
                type="button"
              >
                {saving ? t.points.creating : t.points.confirm}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
