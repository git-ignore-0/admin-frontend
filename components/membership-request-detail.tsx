"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { MembershipRequestStatusBadge } from "@/components/membership-status-badge";
import { useToast } from "@/components/toast-provider";
import { formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import type { MembershipRequest } from "@/lib/types";

type ConfirmedAction =
  "issue-payment-instruction" | "approve" | "return-payment-pending" | "reject";
type ImmediateAction = "contact";

export function MembershipRequestDetail({ requestId }: { requestId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const savingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [item, setItem] = useState<MembershipRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [action, setAction] = useState<ConfirmedAction | null>(null);
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
  const minimumStartDate = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const latest = await api<MembershipRequest>(`admin/membership-requests/${requestId}`);
      setItem(latest);
      setLoadError(null);
      return latest;
    } catch (caught) {
      setLoadError(() => caught);
      return null;
    } finally {
      setLoading(false);
    }
  }, [requestId]);
  useEffect(() => void load(), [load]);

  async function runImmediate(nextAction: ImmediateAction) {
    if (!item || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      const updated = await api<MembershipRequest>(
        `admin/membership-requests/${item.id}/${nextAction}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setItem(updated);
      toast(t.membershipRequests.actionSuccess[nextAction]);
    } catch (caught) {
      setActionError(requestErrorMessage(caught, t));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function openAction(nextAction: ConfirmedAction) {
    if (saving) return;
    setAction(nextAction);
    setReason("");
    setStartDate("");
    setActionError("");
  }
  function closeAction() {
    if (!saving) {
      setAction(null);
      setActionError("");
    }
  }

  async function confirmAction() {
    if (!item || !action || savingRef.current) return;
    if (action === "approve" && !startDate) {
      setActionError(t.membershipRequests.startDateRequired);
      return;
    }
    if (action === "approve" && startDate < minimumStartDate) {
      setActionError(t.membershipRequests.startDatePast);
      return;
    }
    if (["return-payment-pending", "reject"].includes(action) && !reason.trim()) {
      setActionError(t.membershipRequests.reasonRequired);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      const body =
        action === "approve"
          ? { start_date: startDate }
          : action === "issue-payment-instruction"
            ? {}
            : { reason: reason.trim() };
      const updated = await api<MembershipRequest>(
        `admin/membership-requests/${item.id}/${action}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      if (action === "issue-payment-instruction") {
        setItem(updated);
        setAction(null);
        toast(t.membershipRequests.actionSuccess[action]);
        return;
      }
      const latest = await load();
      if (latest) {
        setAction(null);
        toast(t.membershipRequests.actionSuccess[action]);
      }
    } catch (caught) {
      setActionError(requestErrorMessage(caught, t));
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
  if (!item) return <div className="panel">{t.membershipRequests.loadingDetail}</div>;

  const canContact = item.status === "consultation_requested";
  const canIssue = item.status === "consultation_requested" || item.status === "contacted";
  const canApprove = item.status === "payment_submitted";
  const canReturn = item.status === "payment_submitted";
  const canReject = [
    "consultation_requested",
    "contacted",
    "payment_pending",
    "payment_submitted",
  ].includes(item.status);
  const hasActions = canContact || canIssue || canApprove || canReturn || canReject;

  return (
    <>
      <DetailPageHeading
        backHref="/membership-requests"
        backLabel={t.membershipRequests.backLabel}
        description={`${item.user.name} · ${item.short_code}`}
        title={t.membershipRequests.detailTitle}
      />
      {loadError && (
        <div className="error-box retry-error" role="alert">
          <span>{requestErrorMessage(loadError, t)}</span>
          <button className="button secondary" disabled={loading} onClick={() => void load()}>
            {t.common.retry}
          </button>
        </div>
      )}
      {actionError && !action && (
        <p className="error-box" role="alert">
          {actionError}
        </p>
      )}
      <section className="membership-hero">
        <div>
          <MembershipRequestStatusBadge status={item.status} />
          <h2 ref={headingRef} tabIndex={-1}>
            {item.package.name}
          </h2>
          <p>
            {formatMembershipMoney(item.package.upfront_price, locale)} · {item.short_code}
          </p>
        </div>
        {hasActions && (
          <div className="membership-actions" aria-label={t.membershipRequests.actions}>
            {canContact && (
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => void runImmediate("contact")}
              >
                {t.membershipRequests.contact}
              </button>
            )}
            {canIssue && (
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => openAction("issue-payment-instruction")}
              >
                {t.membershipRequests.issueInstruction}
              </button>
            )}
            {canApprove && (
              <button className="button" disabled={saving} onClick={() => openAction("approve")}>
                {t.membershipRequests.approve}
              </button>
            )}
            {canReturn && (
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => openAction("return-payment-pending")}
              >
                {t.membershipRequests.returnPayment}
              </button>
            )}
            {canReject && (
              <button
                className="button danger"
                disabled={saving}
                onClick={() => openAction("reject")}
              >
                {t.membershipRequests.reject}
              </button>
            )}
          </div>
        )}
      </section>
      <div className="membership-detail-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>{t.membershipRequests.customer}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.users.name} value={item.user.name} />
            <DetailRow label={t.users.email} value={item.user.email} />
            <DetailRow label={t.users.phone} value={item.user.phone || "—"} />
            <DetailRow
              label={t.membershipRequests.createdAt}
              value={formatAdminDateTime(item.created_at)}
            />
          </dl>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t.membershipRequests.packageSnapshot}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.membershipRequests.package} value={item.package.name} />
            <DetailRow
              label={t.membershipRequests.price}
              value={formatMembershipMoney(item.package.upfront_price, locale)}
            />
            <DetailRow
              label={t.membershipRequests.duration}
              value={String(item.package.duration_months)}
            />
            <DetailRow
              label={t.membershipRequests.policy}
              value={
                item.package.quota_policy === "expire"
                  ? t.membershipCatalog.expire
                  : t.membershipCatalog.rollover
              }
            />
          </dl>
          <ProductSnapshot items={item.package.items} />
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t.membershipRequests.paymentInstruction}</h2>
          </div>
          {item.payment_instruction ? (
            <dl className="detail-list">
              <DetailRow
                label={t.membershipSettings.bankCode}
                value={
                  item.payment_instruction.bank_name ||
                  item.payment_instruction.bank_code ||
                  item.payment_instruction.bank_bin
                }
              />
              <DetailRow
                label={t.membershipSettings.accountNumber}
                value={item.payment_instruction.account_number}
              />
              <DetailRow
                label={t.membershipSettings.accountName}
                value={item.payment_instruction.account_name}
              />
              <DetailRow
                label={t.membershipRequests.amount}
                value={formatMembershipMoney(item.payment_instruction.amount, locale)}
              />
              <DetailRow
                label={t.membershipRequests.phoneSnapshot}
                value={item.payment_instruction.phone_snapshot}
              />
              <DetailRow
                label={t.membershipRequests.transferContent}
                value={item.payment_instruction.transfer_content}
              />
            </dl>
          ) : (
            <p className="muted-copy">{t.membershipRequests.noInstruction}</p>
          )}
          {(item.return_reason || item.rejection_reason) && (
            <div className="membership-reasons">
              {item.return_reason && (
                <p>
                  <strong>{t.membershipRequests.returnReason}</strong>
                  <span>{item.return_reason}</span>
                </p>
              )}
              {item.rejection_reason && (
                <p>
                  <strong>{t.membershipRequests.rejectionReason}</strong>
                  <span>{item.rejection_reason}</span>
                </p>
              )}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t.membershipRequests.timeline}</h2>
          </div>
          {!item.events?.length ? (
            <p className="muted-copy">{t.membershipRequests.noEvents}</p>
          ) : (
            <ol className="membership-timeline">
              {item.events.map((event) => (
                <li key={event.id}>
                  <div>
                    <strong>
                      {t.membershipRequests.eventLabels[
                        event.action as keyof typeof t.membershipRequests.eventLabels
                      ] ?? event.action}
                    </strong>
                    <span>{event.actor?.name || "—"}</span>
                    {event.reason && <p>{event.reason}</p>}
                  </div>
                  <time>{formatAdminDateTime(event.created_at)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {action && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={t.membershipRequests.processing}
          cancelLabel={t.membershipRequests.cancel}
          confirmDisabled={
            action === "approve"
              ? !startDate
              : action === "issue-payment-instruction"
                ? false
                : !reason.trim()
          }
          confirmLabel={t.membershipRequests.confirmAction[action]}
          danger={action === "reject"}
          error={actionError}
          fallbackFocusRef={headingRef}
          onCancel={closeAction}
          onConfirm={confirmAction}
          title={t.membershipRequests.actionTitle[action]}
        >
          <p>{t.membershipRequests.actionBody[action]}</p>
          {action === "approve" ? (
            <>
              <label className="field">
                <span>{t.membershipRequests.startDate} *</span>
                <input
                  autoFocus
                  className="input"
                  disabled={saving}
                  min={minimumStartDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
              </label>
              <p className="dialog-help">{t.membershipRequests.scheduledHelp}</p>
            </>
          ) : action !== "issue-payment-instruction" ? (
            <label className="field">
              <span>{t.membershipRequests.reason} *</span>
              <textarea
                autoFocus
                className="textarea"
                disabled={saving}
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </label>
          ) : null}
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
function ProductSnapshot({ items }: { items: MembershipRequest["package"]["items"] }) {
  const { t } = useAdminI18n();
  return (
    <div className="snapshot-list">
      <h3>{t.membershipRequests.products}</h3>
      {items.map((item) => (
        <div key={item.product_id}>
          <strong>{item.product_name}</strong>
          <span>
            {item.quota_units} {t.membershipRequests.unitsPerCycle} · {item.unit_size}{" "}
            {item.unit_label_vi}/{item.unit_label_en}
          </span>
        </div>
      ))}
    </div>
  );
}
