"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { useToast } from "@/components/toast-provider";
import { formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { RedemptionDetail, RedemptionStatus, RedemptionTransaction } from "@/lib/types";

type RedemptionAction = "mark-contacted" | "complete" | "reject";

export function RedemptionDetailView({ redemptionId }: { redemptionId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const savingRef = useRef(false);
  const summaryFocusRef = useRef<HTMLHeadingElement>(null);
  const [item, setItem] = useState<RedemptionDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<RedemptionAction | null>(null);
  const [internalNote, setInternalNote] = useState("");
  const [rejectionMessage, setRejectionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [actionsLocked, setActionsLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const latest = await api<RedemptionDetail>(`admin/redemptions/${redemptionId}`);
      setItem(latest);
      setLoadError(null);
      setActionsLocked(false);
      return latest;
    } catch (caught) {
      setLoadError(() => caught);
      return null;
    } finally {
      setLoading(false);
    }
  }, [redemptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openAction(nextAction: RedemptionAction) {
    if (actionsLocked) return;
    setAction(nextAction);
    setInternalNote("");
    setRejectionMessage("");
    setActionError("");
  }

  function closeAction() {
    if (saving) return;
    setAction(null);
    setActionError("");
    setStale(false);
  }

  async function confirmAction() {
    if (!item || !action || savingRef.current || stale) return;
    if (action === "reject" && !rejectionMessage.trim()) {
      setActionError(t.redemptions.rejectionRequired);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    const payload: Record<string, string> = {};
    if (internalNote.trim()) payload.internal_note = internalNote.trim();
    if (action === "reject") payload.rejection_message = rejectionMessage.trim();
    try {
      const result = await api<{ redemption: RedemptionDetail }>(
        `admin/redemptions/${item.id}/${action}`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      setItem(result.redemption);
      setAction(null);
      toast(t.redemptions.actionSuccess[action]);
    } catch (caught) {
      const apiError = caught as Error & { status?: number };
      if (apiError.status === 409) {
        setActionsLocked(true);
        const latest = await load();
        setStale(true);
        setActionsLocked(!latest);
        setActionError(latest ? t.redemptions.conflict : t.redemptions.conflictRefreshFailed);
      } else {
        setActionError(requestErrorMessage(caught, t));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loadError && !item)
    return (
      <div className="panel load-error-state">
        <p className="error-box" role="alert">
          {requestErrorMessage(loadError, t)}
        </p>
        <button className="button secondary" disabled={loading} onClick={() => void load()}>
          {t.common.retry}
        </button>
      </div>
    );
  if (!item) return <div className="panel">{t.redemptions.loadingDetail}</div>;

  const statusLabels: Record<RedemptionStatus, string> = t.redemptions.statuses;
  const rewardName = locale === "en" ? item.reward_name_en_snapshot : item.reward_name_vi_snapshot;
  const open = item.status === "pending" || item.status === "contacted";

  return (
    <>
      <DetailPageHeading
        backHref="/redemptions"
        backLabel={t.redemptions.backLabel}
        description={`${item.user.name} · ${rewardName}`}
        title={t.redemptions.detailTitle}
      />
      {loadError && (
        <div className="error-box retry-error" role="alert">
          <span>{requestErrorMessage(loadError, t)}</span>
          <button className="button secondary" disabled={loading} onClick={() => void load()}>
            {loading ? t.redemptions.refreshing : t.common.retry}
          </button>
        </div>
      )}

      <section className="redemption-hero" aria-labelledby="redemption-summary-title">
        <div>
          <span className={`badge redemption-status ${item.status}`}>
            {statusLabels[item.status]}
          </span>
          <h2 id="redemption-summary-title" ref={summaryFocusRef} tabIndex={-1}>
            {rewardName}
          </h2>
          <p>
            <strong>{item.point_cost_snapshot}</strong> {t.redemptions.pointsUnit}
          </p>
        </div>
        {open && (
          <div className="redemption-actions" aria-label={t.redemptions.actions}>
            {item.status === "pending" && (
              <button
                className="button secondary"
                disabled={saving || loading || actionsLocked}
                onClick={() => openAction("mark-contacted")}
                type="button"
              >
                {t.redemptions.markContacted}
              </button>
            )}
            <button
              className="button"
              disabled={saving || loading || actionsLocked}
              onClick={() => openAction("complete")}
              type="button"
            >
              {t.redemptions.complete}
            </button>
            <button
              className="button danger"
              disabled={saving || loading || actionsLocked}
              onClick={() => openAction("reject")}
              type="button"
            >
              {t.redemptions.reject}
            </button>
          </div>
        )}
      </section>

      <div className="redemption-detail-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>{t.redemptions.member}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.users.name} value={item.user.name} />
            <DetailRow label={t.users.email} value={item.user.email} />
            <DetailRow label={t.users.phone} value={item.user.phone || "—"} />
            <DetailRow label={t.users.balance} value={String(item.points_balance)} />
          </dl>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t.redemptions.timeline}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow
              label={t.redemptions.requestedAt}
              value={formatAdminDateTime(item.created_at)}
            />
            <DetailRow
              label={t.redemptions.contactedAt}
              value={formatAdminDateTime(item.contacted_at)}
            />
            <DetailRow
              label={t.redemptions.completedAt}
              value={formatAdminDateTime(item.completed_at)}
            />
            <DetailRow
              label={t.redemptions.rejectedAt}
              value={formatAdminDateTime(item.rejected_at)}
            />
            <DetailRow label={t.redemptions.contactedBy} value={item.contacted_by?.name || "—"} />
            <DetailRow label={t.redemptions.processedBy} value={item.processed_by?.name || "—"} />
          </dl>
        </section>

        <section className="panel redemption-transactions">
          <div className="panel-head">
            <h2>{t.redemptions.transactions}</h2>
          </div>
          <TransactionCard
            emptyLabel={t.redemptions.noDebit}
            item={item.debit_transaction}
            label={t.redemptions.debitTransaction}
          />
          <TransactionCard
            emptyLabel={t.redemptions.noRefund}
            item={item.refund_transaction}
            label={t.redemptions.refundTransaction}
          />
        </section>

        <section className="panel redemption-notes">
          <div className="panel-head">
            <h2>{t.redemptions.notes}</h2>
          </div>
          <div className="note-block">
            <strong>{t.redemptions.rejectionMessage}</strong>
            <p>{item.rejection_message || "—"}</p>
          </div>
          <div className="note-block private-note">
            <strong>{t.redemptions.internalNote}</strong>
            <span className="badge warm">{t.redemptions.private}</span>
            <p>{item.internal_note || "—"}</p>
          </div>
        </section>
      </div>

      {action && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={t.redemptions.processing}
          cancelLabel={t.redemptions.cancel}
          confirmDisabled={stale || (action === "reject" && !rejectionMessage.trim())}
          confirmLabel={t.redemptions.confirmAction[action]}
          danger={action === "reject"}
          error={actionError}
          fallbackFocusRef={summaryFocusRef}
          onCancel={closeAction}
          onConfirm={confirmAction}
          title={t.redemptions.actionTitle[action]}
        >
          <p>
            {t.redemptions.actionBody[action]
              .replace("{points}", String(item.point_cost_snapshot))
              .replace("{user}", item.user.name)}
          </p>
          {action === "reject" && (
            <label className="field">
              <span>{t.redemptions.rejectionMessage} *</span>
              <textarea
                autoFocus
                className="textarea"
                disabled={saving}
                maxLength={800}
                onChange={(event) => setRejectionMessage(event.target.value)}
                value={rejectionMessage}
              />
              <small className="muted-copy">{t.redemptions.rejectionVisibleHelp}</small>
            </label>
          )}
          <label className="field redemption-dialog-note">
            <span>{t.redemptions.internalNote}</span>
            <textarea
              className="textarea"
              disabled={saving}
              onChange={(event) => setInternalNote(event.target.value)}
              value={internalNote}
            />
            <small className="muted-copy">{t.redemptions.internalNoteHelp}</small>
          </label>
        </ConfirmationDialog>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TransactionCard({
  label,
  item,
  emptyLabel,
}: {
  label: string;
  item: RedemptionTransaction | null;
  emptyLabel: string;
}) {
  if (!item)
    return (
      <div className="transaction-card empty-transaction">
        <strong>{label}</strong>
        <span>{emptyLabel}</span>
      </div>
    );
  return (
    <div className="transaction-card">
      <div>
        <strong>{label}</strong>
        <span>{item.message}</span>
      </div>
      <div>
        <strong className={item.direction === "credit" ? "credit-value" : "debit-value"}>
          {item.direction === "credit" ? "+" : "−"}
          {item.amount}
        </strong>
        <time>{formatAdminDateTime(item.created_at)}</time>
      </div>
    </div>
  );
}
