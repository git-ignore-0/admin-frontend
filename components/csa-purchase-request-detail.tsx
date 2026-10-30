"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminDateInput } from "@/components/admin-date-input";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { CSAPurchaseStatusBadge } from "@/components/csa-purchase-request-list";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { useToast } from "@/components/toast-provider";
import {
  adminDateInputToIso,
  adminTodayIso,
  formatAdminDate,
  formatAdminDateTime,
  isoDateToAdminInput,
} from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { apiErrorContext, requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import type {
  CSAPurchasePayment,
  CSAPurchaseCustomerResolution,
  CSAPurchaseRequest,
  CSAPurchaseResolutionContext,
} from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

type Action = "approve" | "reject" | "mark-refunded";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

export function CSAPurchaseRequestDetail({ requestId }: { requestId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const savingRef = useRef(false);
  const [item, setItem] = useState<CSAPurchaseRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [startDateInput, setStartDateInput] = useState(() => isoDateToAdminInput(adminTodayIso()));
  const [rejectionReason, setRejectionReason] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundFeedback, setRefundFeedback] = useState("");
  const [resolution, setResolution] = useState<CSAPurchaseCustomerResolution | "">("");
  const [resolutionContext, setResolutionContext] = useState<CSAPurchaseResolutionContext | null>(
    null,
  );
  const [fieldError, setFieldError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const paymentSavingRef = useRef(false);
  const [paymentAction, setPaymentAction] = useState<{
    sequence: number;
    kind: "confirm" | "reject";
  } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentReason, setPaymentReason] = useState("");
  const [paymentFieldError, setPaymentFieldError] = useState("");
  const [paymentActionError, setPaymentActionError] = useState("");
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const { provinceName, wardName } = useAdministrativeUnitNames(
    item?.province_code ?? null,
    item?.ward_code ?? null,
    locale,
  );
  const startDate = adminDateInputToIso(startDateInput) ?? "";
  const startDateInvalid = startDateInput.length === 10 && !startDate;
  const startDateBeforeToday = Boolean(startDate && startDate < adminTodayIso());
  const clientStartDateError = startDateInvalid
    ? t.memberships.invalidStartDate
    : startDateBeforeToday
      ? t.csaPurchases.startDateError
      : "";
  const displayedStartDateError = fieldError || clientStartDateError;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItem(await api<CSAPurchaseRequest>(`admin/csa-purchase-requests/${requestId}`));
      setLoadError("");
    } catch (caught) {
      setLoadError(requestErrorMessage(caught, t));
    } finally {
      setLoading(false);
    }
  }, [requestId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const isConflictRejection = action === "approve" && resolution === "reject_conflict";

  function openAction(next: Action) {
    setAction(next);
    setFieldError("");
    setActionError("");
    setResolution("");
    setResolutionContext(null);
    setRejectionReason("");
    setRefundNote("");
    setRefundFeedback("");
  }

  function closeAction() {
    if (saving) return;
    setAction(null);
    setActionError("");
    setFieldError("");
    setResolutionContext(null);
  }

  async function confirmAction() {
    if (!item || !action || savingRef.current) return;
    if (
      action === "mark-refunded" &&
      (item.status !== "rejected" || item.refund_status !== "pending")
    )
      return;
    if (action === "approve" && !isConflictRejection) {
      if (!startDateInput) {
        setFieldError(t.csaPurchases.startDateRequired);
        return;
      }
      if (!startDate || startDateBeforeToday) {
        setFieldError(clientStartDateError || t.memberships.invalidStartDate);
        return;
      }
    }
    if ((action === "reject" || isConflictRejection) && !rejectionReason.trim()) {
      setFieldError(t.csaPurchases.rejectReasonRequired);
      return;
    }
    if (resolutionContext && !resolution) {
      setActionError(t.csaPurchases.resolutionRequired);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFieldError("");
    setActionError("");
    try {
      const payload =
        action === "reject"
          ? { rejection_reason: rejectionReason.trim() }
          : action === "mark-refunded"
            ? { refund_note: refundNote.trim() }
            : {
                start_date: startDate,
                ...(resolution ? { customer_resolution: resolution } : {}),
                ...(isConflictRejection ? { rejection_reason: rejectionReason.trim() } : {}),
              };
      const saved = await api<CSAPurchaseRequest>(
        `admin/csa-purchase-requests/${item.id}/${action}`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      setItem(saved);
      setAction(null);
      setResolutionContext(null);
      setRefundFeedback("");
      toast(
        action === "mark-refunded"
          ? t.csaPurchases.markRefundedSuccess
          : action === "reject" || isConflictRejection
            ? t.csaPurchases.rejectSuccess
            : t.csaPurchases.approveSuccess,
      );
      if (action === "mark-refunded") await load();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      if (action === "mark-refunded") {
        if (
          code === "csa_purchase_refund_state_conflict" ||
          code === "csa_purchase_request_expired"
        ) {
          setAction(null);
          setRefundFeedback(t.csaPurchases.markRefundedError);
          await load();
        } else {
          setActionError(t.csaPurchases.markRefundedError);
        }
      } else if (code === "csa_purchase_customer_resolution_required") {
        setResolutionContext(apiErrorContext<CSAPurchaseResolutionContext>(caught));
        setActionError(t.csaPurchases.resolutionRequired);
      } else if (code === "membership_overlap") {
        setFieldError(t.csaPurchases.overlapError);
      } else if (code === "csa_purchase_start_date_before_next_available") {
        setFieldError(t.csaPurchases.startDateError);
      } else if (code === "csa_purchase_request_state_conflict") {
        setActionError(t.csaPurchases.stateConflict);
        await load();
      } else if (code === "csa_purchase_request_expired") {
        setAction(null);
        setResolutionContext(null);
        toast(t.csaPurchases.expiredConflict);
        await load();
      } else if (code === "csa_purchase_customer_conflict") {
        setActionError(t.csaPurchases.customerConflict);
      } else if (code === "csa_purchase_customer_shipping_address_unavailable") {
        setActionError(t.csaPurchases.customerShippingAddressUnavailable);
      } else if (
        code === "csa_purchase_customer_incomplete" ||
        code === "csa_customer_incomplete"
      ) {
        setActionError(t.memberships.customerIncomplete);
      } else if (code === "package_unavailable") {
        setActionError(t.memberships.packageUnavailable);
      } else if (code === "price_option_unavailable") {
        setActionError(t.memberships.inactivePriceConflict);
      } else if (code === "csa_contract_pdf_snapshot_incomplete") {
        setActionError(t.csaPurchases.contractSnapshotError);
      } else if (code === "csa_contract_pdf_error" || code === "csa_contract_pdf_storage_error") {
        setActionError(t.csaPurchases.contractPdfError);
      } else {
        setActionError(requestErrorMessage(caught, t));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function openPaymentAction(payment: CSAPurchasePayment, kind: "confirm" | "reject") {
    if (item?.status !== "approved" || payment.status !== "reported") return;
    setPaymentAction({ sequence: payment.installment_sequence, kind });
    setPaymentAmount("");
    setPaymentNote("");
    setPaymentReason("");
    setPaymentFieldError("");
    setPaymentActionError("");
    setPaymentFeedback("");
  }

  async function submitPaymentAction() {
    if (!item || !paymentAction || paymentSavingRef.current) return;
    const payment = item.payments?.find(
      (entry) => entry.installment_sequence === paymentAction.sequence,
    );
    if (item.status !== "approved" || payment?.status !== "reported") return;
    const labels = t.csaPurchases.installments;
    const amount = paymentAmount.trim();
    if (paymentAction.kind === "confirm") {
      if (!/^[1-9]\d*$/u.test(amount)) {
        setPaymentFieldError(labels.amountRequired);
        return;
      }
      if (BigInt(amount) !== BigInt(payment.amount_due)) {
        setPaymentFieldError(labels.amountMismatch);
        return;
      }
    } else if (!paymentReason.trim()) {
      setPaymentFieldError(labels.reasonRequired);
      return;
    }
    paymentSavingRef.current = true;
    setPaymentSaving(true);
    setPaymentFieldError("");
    setPaymentActionError("");
    try {
      const payload =
        paymentAction.kind === "confirm"
          ? { amount_paid: amount, note: paymentNote.trim() }
          : { rejection_reason: paymentReason.trim() };
      const updated = await api<CSAPurchaseRequest>(
        `admin/csa-purchase-requests/${item.id}/payments/${payment.installment_sequence}/${paymentAction.kind}`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      setItem(updated);
      setPaymentAction(null);
      await load();
      toast(paymentAction.kind === "confirm" ? labels.confirmSuccess : labels.rejectSuccess);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      if (code === "csa_payment_state_conflict" || code === "csa_payment_unavailable") {
        setPaymentAction(null);
        setPaymentFeedback(labels.stateConflict);
        await load();
      } else if (code === "csa_payment_amount_mismatch") {
        setPaymentFieldError(labels.amountMismatch);
      } else {
        setPaymentActionError(labels.actionError);
      }
    } finally {
      paymentSavingRef.current = false;
      setPaymentSaving(false);
    }
  }

  if (!item) {
    return (
      <div className={loadError ? "error-box retry-error" : "panel"}>
        <span>{loadError || t.csaPurchases.loadingDetail}</span>
        {loadError && (
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            {t.common.retry}
          </button>
        )}
      </div>
    );
  }

  const canApprove = item.status === "payment_confirmed";
  const canReject = item.status === "pending" || item.status === "payment_confirmed";
  const canMarkRefunded = item.status === "rejected" && item.refund_status === "pending";
  const installmentCopy = t.csaPurchases.installments;
  const paymentMethod =
    item.payment_plan?.payment_type === "installment"
      ? installmentCopy.installment.replace("{count}", String(item.payment_plan.installment_count))
      : installmentCopy.full;
  const orderedPayments = [...(item.payments ?? [])].sort(
    (left, right) => left.installment_sequence - right.installment_sequence,
  );
  const selectedPayment = orderedPayments.find(
    (payment) => payment.installment_sequence === paymentAction?.sequence,
  );
  const formatAmount = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: item.currency,
    maximumFractionDigits: 0,
  }).format(Number(item.amount));

  return (
    <>
      <DetailPageHeading
        backHref="/csa-purchase-requests"
        backLabel={t.csaPurchases.back}
        title={t.csaPurchases.detailTitle}
      />
      <section className="panel csa-purchase-summary">
        <div>
          <CSAPurchaseStatusBadge status={item.status} />
          <h2 ref={headingRef} tabIndex={-1}>
            {item.request_code}
          </h2>
          <p>
            {item.name} · {formatAmount}
          </p>
        </div>
        {(canApprove || canReject || canMarkRefunded) && (
          <div className="detail-actions" aria-label={t.csaPurchases.actions}>
            {canApprove && (
              <button
                className="button"
                disabled={saving}
                onClick={() => openAction("approve")}
                type="button"
              >
                {t.csaPurchases.approve}
              </button>
            )}
            {canReject && (
              <button
                className="button danger"
                disabled={saving}
                onClick={() => openAction("reject")}
                type="button"
              >
                {t.csaPurchases.reject}
              </button>
            )}
            {canMarkRefunded && (
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => openAction("mark-refunded")}
                type="button"
              >
                {t.csaPurchases.markRefunded}
              </button>
            )}
          </div>
        )}
      </section>
      {refundFeedback && (
        <p className="error-box" role="alert">
          {refundFeedback}
        </p>
      )}
      {paymentFeedback && (
        <p className="error-box" role="alert">
          {paymentFeedback}
        </p>
      )}

      <div className="csa-purchase-detail-sections">
        <section className="panel">
          <div className="panel-head">
            <h2>{t.csaPurchases.buyerInformation}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.csaPurchases.name} value={item.name} />
            <DetailRow label={t.csaPurchases.phone} value={item.phone} />
            <DetailRow
              label={t.csaPurchases.websiteAccount}
              value={item.user ? `${item.user.name} · ${item.user.email}` : t.csaPurchases.guest}
            />
            <DetailRow label={t.csaPurchases.province} value={provinceName} />
            <DetailRow label={t.csaPurchases.ward} value={wardName} />
            <DetailRow label={t.csaPurchases.address} value={item.address} />
          </dl>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t.csaPurchases.packageSnapshot}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.csaPurchases.package} value={item.package_snapshot.name} />
            <DetailRow label={t.csaPurchases.priceOption} value={item.price_option_snapshot.name} />
            <DetailRow
              label={t.csaPurchases.duration}
              value={t.csaPurchases.months.replace(
                "{count}",
                String(item.price_option_snapshot.duration_months),
              )}
            />
            <DetailRow label={t.csaPurchases.amount} value={formatAmount} />
            <DetailRow label={installmentCopy.method} value={paymentMethod} />
          </dl>
        </section>
        <section className="panel csa-installment-section">
          <div className="panel-head">
            <h2>{installmentCopy.schedule}</h2>
          </div>
          {item.payment_summary && (
            <dl className="detail-list csa-installment-summary">
              <DetailRow
                label={t.csaPurchases.amount}
                value={formatMembershipMoney(item.payment_summary.total_amount, locale)}
              />
              <DetailRow
                label={installmentCopy.paid}
                value={formatMembershipMoney(item.payment_summary.paid_amount, locale)}
              />
              <DetailRow
                label={installmentCopy.remaining}
                value={formatMembershipMoney(item.payment_summary.remaining_amount, locale)}
              />
              <DetailRow
                label={installmentCopy.confirmedCount}
                value={`${item.payment_summary.confirmed_installments}/${item.payment_summary.installment_count}`}
              />
              <DetailRow
                label={installmentCopy.openedCycles}
                value={`${item.payment_summary.paid_cycles}/${item.payment_summary.total_cycles}`}
              />
            </dl>
          )}
          {orderedPayments.length ? (
            <div className="table-wrap csa-installment-wrap">
              <table className="table csa-installment-table">
                <thead>
                  <tr>
                    <th>{installmentCopy.installmentNumber.replace("{count}", "#")}</th>
                    <th>{installmentCopy.dueAmount}</th>
                    <th>{installmentCopy.paidAmount}</th>
                    <th>{installmentCopy.cycles}</th>
                    <th>{installmentCopy.dueAt}</th>
                    <th>{installmentCopy.paymentStatus}</th>
                    <th>{t.csaPurchases.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedPayments.map((payment) => (
                    <tr key={payment.id}>
                      <th
                        data-label={installmentCopy.installmentNumber.replace("{count}", "#")}
                        scope="row"
                      >
                        {installmentCopy.installmentNumber.replace(
                          "{count}",
                          String(payment.installment_sequence),
                        )}
                      </th>
                      <td data-label={installmentCopy.dueAmount}>
                        {formatMembershipMoney(payment.amount_due, locale)}
                      </td>
                      <td data-label={installmentCopy.paidAmount}>
                        {payment.amount_paid
                          ? formatMembershipMoney(payment.amount_paid, locale)
                          : "—"}
                      </td>
                      <td data-label={installmentCopy.cycles}>{payment.cycle_count}</td>
                      <td data-label={installmentCopy.dueAt}>
                        {formatAdminDateTime(payment.due_at)}
                      </td>
                      <td data-label={installmentCopy.paymentStatus}>
                        <span className={`badge csa-installment-status ${payment.status}`}>
                          {installmentCopy.statuses[payment.status]}
                        </span>
                        {payment.confirmed_at && (
                          <small className="table-secondary">
                            {installmentCopy.confirmedAt}:{" "}
                            {formatAdminDateTime(payment.confirmed_at)}
                          </small>
                        )}
                        {payment.confirmed_by?.name && (
                          <small className="table-secondary">
                            {installmentCopy.confirmedBy}: {payment.confirmed_by.name}
                          </small>
                        )}
                        {payment.rejected_at && (
                          <small className="table-secondary">
                            {installmentCopy.rejectedAt}: {formatAdminDateTime(payment.rejected_at)}
                          </small>
                        )}
                        {payment.rejected_by?.name && (
                          <small className="table-secondary">
                            {installmentCopy.rejectedBy}: {payment.rejected_by.name}
                          </small>
                        )}
                        {payment.rejection_reason && (
                          <small className="table-secondary">
                            {installmentCopy.rejectionReason}: {payment.rejection_reason}
                          </small>
                        )}
                        {payment.note && (
                          <small className="table-secondary">
                            {installmentCopy.note}: {payment.note}
                          </small>
                        )}
                      </td>
                      <td data-label={t.csaPurchases.actions}>
                        {item.status === "approved" && payment.status === "reported" && (
                          <div className="detail-actions csa-installment-actions">
                            <button
                              className="button secondary"
                              disabled={paymentSaving}
                              onClick={() => openPaymentAction(payment, "confirm")}
                              type="button"
                            >
                              {installmentCopy.confirm}
                            </button>
                            <button
                              className="button danger"
                              disabled={paymentSaving}
                              onClick={() => openPaymentAction(payment, "reject")}
                              type="button"
                            >
                              {installmentCopy.reject}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{installmentCopy.noSchedule}</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t.csaPurchases.transferInformation}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.csaPurchases.bank} value={`${item.bank_name} (${item.bank_bin})`} />
            <DetailRow label={t.csaPurchases.accountNumber} value={item.account_number} />
            <DetailRow label={t.csaPurchases.accountName} value={item.account_name} />
            <DetailRow label={t.csaPurchases.transferContent} value={item.transfer_content} />
            <DetailRow
              label={t.csaPurchases.paymentVersion}
              value={String(item.payment_config_version)}
            />
          </dl>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t.csaPurchases.workflow}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow
              label={t.csaPurchases.createdAt}
              value={formatAdminDateTime(item.created_at)}
            />
            <DetailRow
              label={t.csaPurchases.expiresAt}
              value={formatAdminDateTime(item.expires_at)}
            />
            {item.status === "expired" && (
              <>
                <DetailRow
                  label={t.csaPurchases.expiredAt}
                  value={formatAdminDateTime(item.expired_at)}
                />
                <DetailRow
                  label={t.csaPurchases.expiredReason}
                  value={
                    item.expired_reason === "request_expiry_elapsed"
                      ? t.csaPurchases.expiryElapsed
                      : item.expired_reason
                  }
                />
              </>
            )}
            <DetailRow
              label={t.csaPurchases.paymentConfirmedAt}
              value={formatAdminDateTime(item.payment_confirmed_at)}
            />
            <DetailRow
              label={t.csaPurchases.approvedAt}
              value={formatAdminDateTime(item.approved_at)}
            />
            <DetailRow
              label={t.csaPurchases.rejectedAt}
              value={formatAdminDateTime(item.rejected_at)}
            />
            <DetailRow
              label={t.csaPurchases.processedBy}
              value={item.approved_by?.name || item.rejected_by?.name}
            />
            <DetailRow label={t.csaPurchases.rejectionReason} value={item.rejection_reason} />
            {item.status === "rejected" && (
              <>
                <DetailRow
                  label={t.csaPurchases.refundStatus}
                  value={
                    item.refund_status === "completed"
                      ? t.csaPurchases.refundCompleted
                      : item.refund_status === "pending"
                        ? t.csaPurchases.refundPending
                        : "—"
                  }
                />
                {item.refund_status === "completed" && (
                  <>
                    <DetailRow
                      label={t.csaPurchases.refundMarkedAt}
                      value={formatAdminDateTime(item.refund_marked_at)}
                    />
                    <DetailRow
                      label={t.csaPurchases.refundMarkedBy}
                      value={item.refund_marked_by?.name}
                    />
                    <DetailRow label={t.csaPurchases.refundNote} value={item.refund_note} />
                  </>
                )}
              </>
            )}
            <DetailRow
              label={t.csaPurchases.customerLink}
              value={
                item.customer_id ? (
                  <Link href={`/csa-customers/${item.customer_id}`}>{item.customer_id}</Link>
                ) : (
                  "—"
                )
              }
            />
            <DetailRow
              label={t.csaPurchases.membershipLink}
              value={
                item.membership_id ? (
                  <Link href={`/memberships/${item.membership_id}`}>{item.membership_id}</Link>
                ) : (
                  "—"
                )
              }
            />
            {item.status === "approved" && item.membership_id && item.contract && (
              <DetailRow
                label={t.csaPurchases.contractLink}
                value={
                  <Link href={`/memberships/${item.membership_id}`}>
                    {item.contract.reference_code}
                  </Link>
                }
              />
            )}
          </dl>
        </section>
      </div>

      {action && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={
            action === "mark-refunded"
              ? t.csaPurchases.markingRefunded
              : action === "reject" || isConflictRejection
                ? t.csaPurchases.rejecting
                : t.csaPurchases.approving
          }
          cancelLabel={t.memberships.cancel}
          confirmDisabled={
            action === "mark-refunded"
              ? false
              : action === "reject" || isConflictRejection
                ? !rejectionReason.trim()
                : !startDate || startDateBeforeToday || Boolean(resolutionContext && !resolution)
          }
          confirmLabel={
            action === "mark-refunded"
              ? t.csaPurchases.confirmMarkRefunded
              : action === "reject" || isConflictRejection
                ? t.csaPurchases.confirmReject
                : t.csaPurchases.confirmApprove
          }
          danger={action === "reject" || resolution === "reject_conflict"}
          error={actionError}
          fallbackFocusRef={headingRef}
          onCancel={closeAction}
          onConfirm={() => void confirmAction()}
          title={
            action === "mark-refunded"
              ? t.csaPurchases.markRefundedTitle
              : action === "reject" || isConflictRejection
                ? t.csaPurchases.rejectTitle
                : t.csaPurchases.approveTitle
          }
        >
          {action === "mark-refunded" ? (
            <label className="field" htmlFor="purchase-refund-note">
              <span>{t.csaPurchases.refundNote}</span>
              <textarea
                className="textarea"
                disabled={saving}
                id="purchase-refund-note"
                maxLength={1000}
                onChange={(event) => setRefundNote(event.target.value)}
                value={refundNote}
              />
            </label>
          ) : action === "approve" ? (
            <>
              {!isConflictRejection && (
                <div className="field">
                  <label htmlFor="purchase-start-date">{t.csaPurchases.startDate}</label>
                  <AdminDateInput
                    aria-describedby={
                      displayedStartDateError ? "purchase-start-date-error" : undefined
                    }
                    aria-invalid={Boolean(displayedStartDateError)}
                    className="input"
                    id="purchase-start-date"
                    onValueChange={(value) => {
                      setStartDateInput(value);
                      setFieldError("");
                    }}
                    pickerLabel={t.memberships.openStartDatePicker}
                    pickerMin={adminTodayIso()}
                    value={startDateInput}
                  />
                  {displayedStartDateError && (
                    <small className="field-error" id="purchase-start-date-error" role="alert">
                      {displayedStartDateError}
                    </small>
                  )}
                </div>
              )}
              {resolutionContext && (
                <section
                  className="purchase-resolution"
                  aria-labelledby="purchase-resolution-title"
                >
                  <h3 id="purchase-resolution-title">{t.csaPurchases.resolutionTitle}</h3>
                  <div className="resolution-comparison">
                    <div>
                      <strong>{t.csaPurchases.existingCustomer}</strong>
                      <p>
                        {resolutionContext.customer.name}
                        <br />
                        {resolutionContext.customer.phone}
                        <br />
                        {resolutionContext.customer.address}
                      </p>
                    </div>
                    <div>
                      <strong>{t.csaPurchases.requestCustomer}</strong>
                      <p>
                        {resolutionContext.request.name}
                        <br />
                        {resolutionContext.request.phone}
                        <br />
                        {resolutionContext.request.address}
                      </p>
                    </div>
                  </div>
                  <strong>{t.csaPurchases.existingPackages}</strong>
                  {resolutionContext.customer.memberships.length ? (
                    <ul className="compact-list">
                      {resolutionContext.customer.memberships.map((membership) => (
                        <li key={membership.id}>
                          {membership.package_name} · {formatAdminDate(membership.start_date)}–
                          {formatAdminDate(membership.end_date)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t.csaPurchases.noExistingPackages}</p>
                  )}
                  <div className="resolution-options">
                    {(["keep_existing", "use_request_data", "reject_conflict"] as const).map(
                      (value) => (
                        <label className="radio-option" key={value}>
                          <input
                            checked={resolution === value}
                            name="customer-resolution"
                            onChange={() => {
                              setResolution(value);
                              setActionError("");
                              setFieldError("");
                            }}
                            type="radio"
                            value={value}
                          />
                          {value === "keep_existing"
                            ? t.csaPurchases.keepExisting
                            : value === "use_request_data"
                              ? t.csaPurchases.useRequestData
                              : t.csaPurchases.rejectConflict}
                        </label>
                      ),
                    )}
                  </div>
                  {isConflictRejection && (
                    <label className="field" htmlFor="purchase-conflict-rejection-reason">
                      <span>{t.csaPurchases.rejectReason}</span>
                      <textarea
                        aria-describedby={
                          fieldError ? "purchase-conflict-rejection-error" : undefined
                        }
                        aria-invalid={Boolean(fieldError)}
                        autoFocus
                        className="textarea"
                        id="purchase-conflict-rejection-reason"
                        maxLength={1000}
                        onChange={(event) => {
                          setRejectionReason(event.target.value);
                          setFieldError("");
                        }}
                        value={rejectionReason}
                      />
                      {fieldError && (
                        <small className="field-error" id="purchase-conflict-rejection-error">
                          {fieldError}
                        </small>
                      )}
                    </label>
                  )}
                </section>
              )}
            </>
          ) : (
            <label className="field" htmlFor="purchase-rejection-reason">
              <span>{t.csaPurchases.rejectReason}</span>
              <textarea
                aria-describedby={fieldError ? "purchase-rejection-error" : undefined}
                aria-invalid={Boolean(fieldError)}
                autoFocus
                className="textarea"
                id="purchase-rejection-reason"
                maxLength={1000}
                onChange={(event) => {
                  setRejectionReason(event.target.value);
                  setFieldError("");
                }}
                value={rejectionReason}
              />
              {fieldError && (
                <small className="field-error" id="purchase-rejection-error">
                  {fieldError}
                </small>
              )}
            </label>
          )}
        </ConfirmationDialog>
      )}
      {paymentAction && selectedPayment && (
        <ConfirmationDialog
          busy={paymentSaving}
          busyLabel={
            paymentAction.kind === "confirm"
              ? installmentCopy.confirming
              : installmentCopy.rejecting
          }
          cancelLabel={t.memberships.cancel}
          confirmDisabled={
            paymentAction.kind === "confirm"
              ? !/^[1-9]\d*$/u.test(paymentAmount.trim()) ||
                BigInt(paymentAmount.trim() || "0") !== BigInt(selectedPayment.amount_due)
              : !paymentReason.trim()
          }
          confirmLabel={
            paymentAction.kind === "confirm" ? installmentCopy.confirm : installmentCopy.reject
          }
          danger={paymentAction.kind === "reject"}
          error={paymentActionError}
          fallbackFocusRef={headingRef}
          onCancel={() => {
            if (!paymentSaving) setPaymentAction(null);
          }}
          onConfirm={() => void submitPaymentAction()}
          title={
            paymentAction.kind === "confirm"
              ? installmentCopy.confirmTitle
              : installmentCopy.rejectTitle
          }
        >
          {paymentAction.kind === "confirm" ? (
            <>
              <label className="field" htmlFor="installment-amount-received">
                <span>{installmentCopy.amountReceived}</span>
                <input
                  aria-describedby={
                    paymentFieldError ? "installment-payment-field-error" : undefined
                  }
                  aria-invalid={Boolean(paymentFieldError)}
                  className="input"
                  disabled={paymentSaving}
                  id="installment-amount-received"
                  inputMode="numeric"
                  maxLength={19}
                  onBlur={() => {
                    const value = paymentAmount.trim();
                    if (!/^[1-9]\d*$/u.test(value))
                      setPaymentFieldError(installmentCopy.amountRequired);
                    else if (BigInt(value) !== BigInt(selectedPayment.amount_due))
                      setPaymentFieldError(installmentCopy.amountMismatch);
                  }}
                  onChange={(event) => {
                    setPaymentAmount(event.target.value);
                    setPaymentFieldError("");
                  }}
                  value={paymentAmount}
                />
              </label>
              <label className="field" htmlFor="installment-payment-note">
                <span>{installmentCopy.note}</span>
                <textarea
                  className="textarea"
                  disabled={paymentSaving}
                  id="installment-payment-note"
                  maxLength={1000}
                  onChange={(event) => setPaymentNote(event.target.value)}
                  value={paymentNote}
                />
              </label>
            </>
          ) : (
            <label className="field" htmlFor="installment-rejection-reason">
              <span>{installmentCopy.rejectionReason}</span>
              <textarea
                aria-describedby={paymentFieldError ? "installment-payment-field-error" : undefined}
                aria-invalid={Boolean(paymentFieldError)}
                className="textarea"
                disabled={paymentSaving}
                id="installment-rejection-reason"
                maxLength={1000}
                onBlur={() => {
                  if (!paymentReason.trim()) setPaymentFieldError(installmentCopy.reasonRequired);
                }}
                onChange={(event) => {
                  setPaymentReason(event.target.value);
                  setPaymentFieldError("");
                }}
                value={paymentReason}
              />
            </label>
          )}
          {paymentFieldError && (
            <small className="field-error" id="installment-payment-field-error" role="alert">
              {paymentFieldError}
            </small>
          )}
        </ConfirmationDialog>
      )}
    </>
  );
}
