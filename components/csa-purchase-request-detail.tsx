"use client";

import {
  Alert,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Input,
  Paper,
  Radio,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { AdminDateInput } from "@/components/admin-date-input";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useAdminRecordScope } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { CSAPurchaseStatusBadge } from "@/components/csa-purchase-request-list";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { DataListPaper } from "@/components/data-list-paper";
import { ListState } from "@/components/list-state";
import { DataState, Section, Status } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import {
  adminDateInputToIso,
  adminTodayIso,
  formatAdminDate,
  formatAdminDateTime,
  isoDateToAdminInput,
} from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requireResponseEntity } from "@/lib/api-response";
import {
  apiErrorContext,
  isProtectedDataError,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import { formatVietnamPhone } from "@/lib/phone-number";
import type {
  CSAPurchasePayment,
  CSAPurchaseCustomerResolution,
  CSAPurchaseRequest,
  CSAPurchaseResolutionContext,
} from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";
import styles from "./csa-purchase-request-detail.module.css";

type Action = "approve" | "reject" | "mark-refunded";

export function CSAPurchaseRequestDetail({
  requestId,
  backHref = "/csa-purchase-requests",
}: {
  requestId: string;
  backHref?: string;
}) {
  return <PurchaseRequestRecord key={requestId} requestId={requestId} backHref={backHref} />;
}

function PurchaseRequestRecord({ requestId, backHref }: { requestId: string; backHref: string }) {
  const { locale, t } = useAdminI18n();
  const scope = useAdminRecordScope(requestId);
  const search = useSearchParams()?.toString();
  const copy = t.csaPurchases;
  const breadcrumbs = useMemo(
    () => [{ label: t.common.csaPurchaseRequests, href: backHref }, { label: copy.detailTitle }],
    [backHref, copy.detailTitle, t.common.csaPurchaseRequests],
  );
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

  const retire = useCallback(
    (caught: unknown) => {
      if (!isProtectedDataError(caught) && (caught as ClientApiError | null)?.status !== 404)
        return false;
      scope.retire();
      setItem(null);
      setAction(null);
      setResolutionContext(null);
      setPaymentAction(null);
      setPaymentAmount("");
      setPaymentNote("");
      setPaymentReason("");
      savingRef.current = false;
      paymentSavingRef.current = false;
      setSaving(false);
      setPaymentSaving(false);
      setLoading(false);
      setLoadError(requestErrorMessage(caught, t));
      return true;
    },
    [scope, t],
  );

  const load = useCallback(async () => {
    const { signal, current } = scope.beginRead();
    setLoading(true);
    try {
      const latest = requireResponseEntity(
        await api<CSAPurchaseRequest>(`admin/csa-purchase-requests/${requestId}`, { signal }),
        requestId,
      );
      if (!current()) return;
      setItem(latest);
      setLoadError("");
    } catch (caught) {
      if (current() && !retire(caught)) setLoadError(requestErrorMessage(caught, t));
    } finally {
      if (current()) setLoading(false);
    }
  }, [requestId, retire, scope, t]);

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
    const current = scope.capture();
    if (!current() || !item || !action || savingRef.current) return;
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
      if (!current()) return;
      setItem(requireResponseEntity(saved, requestId));
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
      if (!current() || retire(caught)) return;
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
      if (current()) {
        savingRef.current = false;
        setSaving(false);
      }
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
    const current = scope.capture();
    if (!current() || !item || !paymentAction || paymentSavingRef.current) return;
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
      if (!current()) return;
      setItem(requireResponseEntity(updated, requestId));
      setPaymentAction(null);
      await load();
      if (current())
        toast(paymentAction.kind === "confirm" ? labels.confirmSuccess : labels.rejectSuccess);
    } catch (caught) {
      if (!current() || retire(caught)) return;
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
      if (current()) {
        paymentSavingRef.current = false;
        setPaymentSaving(false);
      }
    }
  }

  const heading = (
    <>
      <AdminBreadcrumbForRoute
        pathname={`/csa-purchase-requests/${encodeURIComponent(requestId)}`}
        search={search}
        items={breadcrumbs}
      />
      <DetailPageHeading backHref={backHref} backLabel={copy.back} title={copy.detailTitle} />
    </>
  );

  if (!item) {
    return (
      <>
        {heading}
        {loadError ? (
          <RecoveryAlert
            message={loadError}
            retryLabel={t.common.retry}
            loading={loading}
            onRetry={() => void load()}
          />
        ) : (
          <Paper withBorder p="md">
            <DataState kind="loading" title={copy.loadingDetail} compact />
          </Paper>
        )}
      </>
    );
  }

  const canApprove = item.status === "payment_confirmed";
  const canReject = item.status === "pending" || item.status === "payment_confirmed";
  const canMarkRefunded = item.status === "rejected" && item.refund_status === "pending";
  const installmentCopy = copy.installments;
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
  const showInstallmentActions =
    item.status === "approved" && orderedPayments.some((payment) => payment.status === "reported");
  const formatAmount = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: item.currency,
    maximumFractionDigits: 0,
  }).format(Number(item.amount));
  const installmentColumns = [
    installmentCopy.installmentNumber.replace("{count}", "#"),
    installmentCopy.dueAmount,
    installmentCopy.paidAmount,
    installmentCopy.cycles,
    installmentCopy.dueAt,
    installmentCopy.paymentStatus,
    ...(showInstallmentActions ? [copy.actions] : []),
  ];

  return (
    <>
      {heading}
      <Stack gap="md" miw={0}>
        <Paper component="section" withBorder p="md">
          <Group align="flex-start" gap="md" justify="space-between">
            <Stack align="flex-start" gap={4} miw={0}>
              <CSAPurchaseStatusBadge status={item.status} />
              <Title order={2} size="h3" ref={headingRef} tabIndex={-1} className={styles.wrapText}>
                {item.request_code}
              </Title>
              <Text size="sm" c="dimmed" className={styles.wrapText}>
                {item.name} · {formatAmount}
              </Text>
            </Stack>
            {(canApprove || canReject || canMarkRefunded) && (
              <Group gap="xs" role="group" aria-label={copy.actions}>
                {canApprove && (
                  <Button disabled={saving} onClick={() => openAction("approve")} type="button">
                    {copy.approve}
                  </Button>
                )}
                {canReject && (
                  <Button
                    color="red"
                    variant="light"
                    disabled={saving}
                    onClick={() => openAction("reject")}
                    type="button"
                  >
                    {copy.reject}
                  </Button>
                )}
                {canMarkRefunded && (
                  <Button
                    variant="default"
                    disabled={saving}
                    onClick={() => openAction("mark-refunded")}
                    type="button"
                  >
                    {copy.markRefunded}
                  </Button>
                )}
              </Group>
            )}
          </Group>
        </Paper>
        {refundFeedback && (
          <Alert color="red" role="alert">
            {refundFeedback}
          </Alert>
        )}
        {paymentFeedback && (
          <Alert color="red" role="alert">
            {paymentFeedback}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Section title={copy.buyerInformation}>
            <RecordDetailFields>
              <RecordDetailField label={copy.name}>{item.name}</RecordDetailField>
              <RecordDetailField label={copy.phone}>
                {formatVietnamPhone(item.phone)}
              </RecordDetailField>
              <RecordDetailField label={copy.websiteAccount}>
                {item.user
                  ? [item.user.name, item.user.email].filter(Boolean).join(" · ")
                  : copy.guest}
              </RecordDetailField>
              <RecordDetailField label={copy.province}>{provinceName}</RecordDetailField>
              <RecordDetailField label={copy.ward}>{wardName}</RecordDetailField>
              <RecordDetailField label={copy.address}>{item.address}</RecordDetailField>
            </RecordDetailFields>
          </Section>
          <Section title={copy.packageSnapshot}>
            <RecordDetailFields>
              <RecordDetailField label={copy.package}>
                {item.package_snapshot.name}
              </RecordDetailField>
              <RecordDetailField label={copy.priceOption}>
                {item.price_option_snapshot.name}
              </RecordDetailField>
              <RecordDetailField label={copy.duration}>
                {copy.months.replace("{count}", String(item.price_option_snapshot.duration_months))}
              </RecordDetailField>
              <RecordDetailField label={copy.amount}>{formatAmount}</RecordDetailField>
              <RecordDetailField label={installmentCopy.method}>{paymentMethod}</RecordDetailField>
            </RecordDetailFields>
          </Section>
        </SimpleGrid>

        <Section title={installmentCopy.schedule}>
          {item.payment_summary && (
            <RecordDetailFields>
              <RecordDetailField label={copy.amount}>
                {formatMembershipMoney(item.payment_summary.total_amount, locale)}
              </RecordDetailField>
              <RecordDetailField label={installmentCopy.paid}>
                {formatMembershipMoney(item.payment_summary.paid_amount, locale)}
              </RecordDetailField>
              <RecordDetailField label={installmentCopy.remaining}>
                {formatMembershipMoney(item.payment_summary.remaining_amount, locale)}
              </RecordDetailField>
              <RecordDetailField label={installmentCopy.confirmedCount}>
                {`${item.payment_summary.confirmed_installments}/${item.payment_summary.installment_count}`}
              </RecordDetailField>
              <RecordDetailField label={installmentCopy.openedCycles}>
                {`${item.payment_summary.paid_cycles}/${item.payment_summary.total_cycles}`}
              </RecordDetailField>
            </RecordDetailFields>
          )}
          <DataListPaper>
            {orderedPayments.length ? (
              <Table.ScrollContainer
                aria-label={installmentCopy.schedule}
                minWidth={showInstallmentActions ? "55rem" : "43rem"}
                role="region"
                tabIndex={0}
                type="native"
              >
                <Table
                  aria-label={installmentCopy.schedule}
                  className={styles.installmentTable}

                  withRowBorders
                >
                  <Table.Thead>
                    <Table.Tr>
                      {installmentColumns.map((label) => (
                        <Table.Th key={label} scope="col">
                          {label}
                        </Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {orderedPayments.map((payment) => {
                      const paymentDetails = [
                        [
                          installmentCopy.confirmedAt,
                          payment.confirmed_at && formatAdminDateTime(payment.confirmed_at),
                        ],
                        [installmentCopy.confirmedBy, payment.confirmed_by?.name],
                        [
                          installmentCopy.rejectedAt,
                          payment.rejected_at && formatAdminDateTime(payment.rejected_at),
                        ],
                        [installmentCopy.rejectedBy, payment.rejected_by?.name],
                        [installmentCopy.rejectionReason, payment.rejection_reason],
                        [installmentCopy.note, payment.note],
                      ] as const;
                      return (
                        <Table.Tr key={payment.id}>
                          <Table.Th scope="row">
                            {installmentCopy.installmentNumber.replace(
                              "{count}",
                              String(payment.installment_sequence),
                            )}
                          </Table.Th>
                          <Table.Td>{formatMembershipMoney(payment.amount_due, locale)}</Table.Td>
                          <Table.Td>
                            {payment.amount_paid
                              ? formatMembershipMoney(payment.amount_paid, locale)
                              : "—"}
                          </Table.Td>
                          <Table.Td>{payment.cycle_count}</Table.Td>
                          <Table.Td>{formatAdminDateTime(payment.due_at)}</Table.Td>
                          <Table.Td>
                            <Stack gap={4} align="flex-start">
                              <Status
                                domain="installment"
                                status={payment.status}
                                label={installmentCopy.statuses[payment.status]}
                              />
                              {paymentDetails.map(
                                ([label, value]) =>
                                  value && (
                                    <Text key={label} component="span" size="xs" c="dimmed">
                                      {label}: {value}
                                    </Text>
                                  ),
                              )}
                            </Stack>
                          </Table.Td>
                          {showInstallmentActions && (
                            <Table.Td>
                              {payment.status === "reported" && (
                                <Group gap="xs">
                                  <Button
                                    variant="default"
                                    size="xs"
                                    disabled={paymentSaving}
                                    onClick={() => openPaymentAction(payment, "confirm")}
                                    type="button"
                                  >
                                    {installmentCopy.confirm}
                                  </Button>
                                  <Button
                                    color="red"
                                    variant="light"
                                    size="xs"
                                    disabled={paymentSaving}
                                    onClick={() => openPaymentAction(payment, "reject")}
                                    type="button"
                                  >
                                    {installmentCopy.reject}
                                  </Button>
                                </Group>
                              )}
                            </Table.Td>
                          )}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : (
              <ListState
                embedded
                empty={installmentCopy.noSchedule}
                error=""
                hasData
                isEmpty
                loading={false}
                loadingLabel={copy.loadingDetail}
                onRetry={() => undefined}
                retryLabel={t.common.retry}
              />
            )}
          </DataListPaper>
        </Section>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Section title={copy.transferInformation}>
            <RecordDetailFields>
              <RecordDetailField label={copy.bank}>
                {item.bank_name} ({item.bank_bin})
              </RecordDetailField>
              <RecordDetailField label={copy.accountNumber}>
                {item.account_number}
              </RecordDetailField>
              <RecordDetailField label={copy.accountName}>{item.account_name}</RecordDetailField>
              <RecordDetailField label={copy.transferContent}>
                {item.transfer_content}
              </RecordDetailField>
              <RecordDetailField label={copy.paymentVersion}>
                {String(item.payment_config_version)}
              </RecordDetailField>
            </RecordDetailFields>
          </Section>
          <Section title={copy.workflow}>
            <RecordDetailFields>
              <RecordDetailField label={copy.createdAt}>
                {formatAdminDateTime(item.created_at)}
              </RecordDetailField>
              <RecordDetailField label={copy.expiresAt}>
                {formatAdminDateTime(item.expires_at)}
              </RecordDetailField>
              {item.status === "expired" && (
                <>
                  <RecordDetailField label={copy.expiredAt}>
                    {formatAdminDateTime(item.expired_at)}
                  </RecordDetailField>
                  <RecordDetailField label={copy.expiredReason}>
                    {item.expired_reason === "request_expiry_elapsed"
                      ? copy.expiryElapsed
                      : item.expired_reason}
                  </RecordDetailField>
                </>
              )}
              <RecordDetailField label={copy.paymentConfirmedAt}>
                {formatAdminDateTime(item.payment_confirmed_at)}
              </RecordDetailField>
              <RecordDetailField label={copy.approvedAt}>
                {formatAdminDateTime(item.approved_at)}
              </RecordDetailField>
              <RecordDetailField label={copy.rejectedAt}>
                {formatAdminDateTime(item.rejected_at)}
              </RecordDetailField>
              <RecordDetailField label={copy.processedBy}>
                {item.approved_by?.name || item.rejected_by?.name}
              </RecordDetailField>
              <RecordDetailField label={copy.rejectionReason}>
                {item.rejection_reason}
              </RecordDetailField>
              {item.status === "rejected" && (
                <>
                  <RecordDetailField label={copy.refundStatus}>
                    {item.refund_status === "completed"
                      ? copy.refundCompleted
                      : item.refund_status === "pending"
                        ? copy.refundPending
                        : "—"}
                  </RecordDetailField>
                  {item.refund_status === "completed" && (
                    <>
                      <RecordDetailField label={copy.refundMarkedAt}>
                        {formatAdminDateTime(item.refund_marked_at)}
                      </RecordDetailField>
                      <RecordDetailField label={copy.refundMarkedBy}>
                        {item.refund_marked_by?.name}
                      </RecordDetailField>
                      <RecordDetailField label={copy.refundNote}>
                        {item.refund_note}
                      </RecordDetailField>
                    </>
                  )}
                </>
              )}
              <RecordDetailField label={copy.customerLink}>
                {item.customer_id && (
                  <Anchor
                    component={AdminNavigationLink}
                    href={`/csa-customers/${item.customer_id}`}
                  >
                    {item.customer_id}
                  </Anchor>
                )}
              </RecordDetailField>
              <RecordDetailField label={copy.membershipLink}>
                {item.membership_id && (
                  <Anchor
                    component={AdminNavigationLink}
                    href={`/memberships/${item.membership_id}`}
                  >
                    {item.membership_id}
                  </Anchor>
                )}
              </RecordDetailField>
              {item.status === "approved" && item.membership_id && item.contract && (
                <RecordDetailField label={copy.contractLink}>
                  <Anchor
                    component={AdminNavigationLink}
                    href={`/memberships/${item.membership_id}`}
                  >
                    {item.contract.reference_code}
                  </Anchor>
                </RecordDetailField>
              )}
            </RecordDetailFields>
          </Section>
        </SimpleGrid>
      </Stack>

      {action && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={
            action === "mark-refunded"
              ? copy.markingRefunded
              : action === "reject" || isConflictRejection
                ? copy.rejecting
                : copy.approving
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
              ? copy.confirmMarkRefunded
              : action === "reject" || isConflictRejection
                ? copy.confirmReject
                : copy.confirmApprove
          }
          danger={action === "reject" || resolution === "reject_conflict"}
          error={actionError}
          fallbackFocusRef={headingRef}
          onCancel={closeAction}
          onConfirm={() => void confirmAction()}
          title={
            action === "mark-refunded"
              ? copy.markRefundedTitle
              : action === "reject" || isConflictRejection
                ? copy.rejectTitle
                : copy.approveTitle
          }
        >
          {action === "mark-refunded" ? (
            <Textarea
              disabled={saving}
              id="purchase-refund-note"
              label={copy.refundNote}
              maxLength={1000}
              onChange={(event) => setRefundNote(event.currentTarget.value)}
              value={refundNote}
            />
          ) : (
            <>
              {action === "approve" && !isConflictRejection && (
                <Box>
                  <Input.Label htmlFor="purchase-start-date">{copy.startDate}</Input.Label>
                  <AdminDateInput
                    aria-describedby={
                      displayedStartDateError ? "purchase-start-date-error" : undefined
                    }
                    aria-invalid={Boolean(displayedStartDateError)}
                    disabled={saving}
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
                    <Input.Error
                      className="field-error"
                      id="purchase-start-date-error"
                      role="alert"
                      mt={4}
                    >
                      {displayedStartDateError}
                    </Input.Error>
                  )}
                </Box>
              )}
              {action === "approve" && resolutionContext && (
                <Stack
                  component="section"
                  gap="sm"
                  aria-labelledby="purchase-resolution-title"
                  miw={0}
                >
                  <Divider />
                  <Title order={3} size="sm" id="purchase-resolution-title">
                    {copy.resolutionTitle}
                  </Title>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    {(
                      [
                        [copy.existingCustomer, resolutionContext.customer],
                        [copy.requestCustomer, resolutionContext.request],
                      ] as const
                    ).map(([label, customer]) => (
                      <Paper withBorder p="sm" key={label} className={styles.wrapText}>
                        <Stack gap={4} miw={0}>
                          <Text size="sm" fw={600}>
                            {label}
                          </Text>
                          <Text size="sm">{customer.name}</Text>
                          <Text size="sm" c="dimmed">
                            {formatVietnamPhone(customer.phone)}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {customer.address}
                          </Text>
                        </Stack>
                      </Paper>
                    ))}
                  </SimpleGrid>
                  <Stack gap={4}>
                    <Text size="sm" fw={600}>
                      {copy.existingPackages}
                    </Text>
                    {resolutionContext.customer.memberships.length ? (
                      <Stack component="ul" gap={4} my={0} pl="md">
                        {resolutionContext.customer.memberships.map((membership) => (
                          <Text
                            component="li"
                            size="sm"
                            key={membership.id}
                            className={styles.wrapText}
                          >
                            {membership.package_name} · {formatAdminDate(membership.start_date)}–
                            {formatAdminDate(membership.end_date)}
                          </Text>
                        ))}
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed">
                        {copy.noExistingPackages}
                      </Text>
                    )}
                  </Stack>
                  <Stack gap="xs" role="radiogroup" aria-label={copy.resolutionTitle}>
                    {(
                      [
                        ["keep_existing", copy.keepExisting],
                        ["use_request_data", copy.useRequestData],
                        ["reject_conflict", copy.rejectConflict],
                      ] as const
                    ).map(([value, label]) => (
                      <Radio
                        key={value}
                        checked={resolution === value}
                        disabled={saving}
                        label={label}
                        name="customer-resolution"
                        onChange={() => {
                          setResolution(value);
                          setActionError("");
                          setFieldError("");
                        }}
                        value={value}
                      />
                    ))}
                  </Stack>
                </Stack>
              )}
              {(action === "reject" || isConflictRejection) && (
                <Textarea
                  aria-invalid={Boolean(fieldError)}
                  autoFocus
                  disabled={saving}
                  error={fieldError || undefined}
                  id={
                    isConflictRejection
                      ? "purchase-conflict-rejection-reason"
                      : "purchase-rejection-reason"
                  }
                  label={copy.rejectReason}
                  maxLength={1000}
                  onChange={(event) => {
                    setRejectionReason(event.currentTarget.value);
                    setFieldError("");
                  }}
                  value={rejectionReason}
                />
              )}
            </>
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
              <TextInput
                aria-invalid={Boolean(paymentFieldError)}
                disabled={paymentSaving}
                error={paymentFieldError || undefined}
                id="installment-amount-received"
                inputMode="numeric"
                label={installmentCopy.amountReceived}
                maxLength={19}
                onBlur={() => {
                  const value = paymentAmount.trim();
                  if (!/^[1-9]\d*$/u.test(value))
                    setPaymentFieldError(installmentCopy.amountRequired);
                  else if (BigInt(value) !== BigInt(selectedPayment.amount_due))
                    setPaymentFieldError(installmentCopy.amountMismatch);
                }}
                onChange={(event) => {
                  setPaymentAmount(event.currentTarget.value);
                  setPaymentFieldError("");
                }}
                value={paymentAmount}
              />
              <Textarea
                disabled={paymentSaving}
                id="installment-payment-note"
                label={installmentCopy.note}
                maxLength={1000}
                onChange={(event) => setPaymentNote(event.currentTarget.value)}
                value={paymentNote}
              />
            </>
          ) : (
            <Textarea
              aria-invalid={Boolean(paymentFieldError)}
              disabled={paymentSaving}
              error={paymentFieldError || undefined}
              id="installment-rejection-reason"
              label={installmentCopy.rejectionReason}
              maxLength={1000}
              onBlur={() => {
                if (!paymentReason.trim()) setPaymentFieldError(installmentCopy.reasonRequired);
              }}
              onChange={(event) => {
                setPaymentReason(event.currentTarget.value);
                setPaymentFieldError("");
              }}
              value={paymentReason}
            />
          )}
        </ConfirmationDialog>
      )}
    </>
  );
}
