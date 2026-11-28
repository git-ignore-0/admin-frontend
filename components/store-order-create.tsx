"use client";

import { Alert, Box, Button, Group, Input, Paper, Radio, Stack, Text, Title } from "@mantine/core";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { AdminDateInput } from "@/components/admin-date-input";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useAdminRecordScope } from "@/components/admin-query-provider";
import { useAddressFields } from "@/components/address-fields";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { PageHeading } from "@/components/page-heading";
import { RecoveryAlert } from "@/components/recovery-alert";
import { StoreOrderBuyerFields, useStoreOrderBuyer } from "@/components/store-order-create-buyer";
import {
  StoreOrderCreatePricing,
  StoreOrderCreateProducts,
} from "@/components/store-order-create-products";
import { OrderReviewFields } from "@/components/store-order-create-review";
import { StoreOrderProductPicker } from "@/components/store-order-product-picker";
import { useToast } from "@/components/toast-provider";
import { adminTodayIso } from "@/lib/admin-date";
import {
  quoteAdminStoreOrder,
  type StoreOrderGuest,
  type StoreOrderQuote,
  type StoreOrderQuoteInput,
} from "@/lib/admin-store-order-api";
import {
  isProtectedDataError,
  isUncertainMutationError,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import { listStoreProducts } from "@/lib/commerce-api";
import { formatVietnamPhone } from "@/lib/phone-number";
import { findSupportedShippingLocation, supportedShippingAreasOptions } from "@/lib/shipping-areas";
import { storeOrderCreateCopy } from "@/lib/store-order-create-copy";
import { keepUnchangedOrderErrors, storeOrderCreateErrors } from "@/lib/store-order-create-errors";
import {
  blankStoreOrderDraft,
  MAX_ORDER_LINES,
  storeOrderDateRange,
  validStoreOrderDate,
  validateStoreOrderDraft,
  type StoreOrderDraft,
} from "@/lib/store-order-draft";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import type { StoreProduct } from "@/lib/types";
import { useStoreOrderCreation } from "@/lib/use-store-order-creation";

import styles from "./store-order-create.module.css";

const listPath = "/store-orders";
const routePath = `${listPath}/new`;

type OrderDraft = StoreOrderDraft<StoreProduct>;

function guestAreaKey({ province_code, ward_code }: StoreOrderGuest) {
  return `${province_code}:${ward_code}`;
}

function isUnsupportedAreaRejection(error: unknown) {
  return (
    error instanceof Error &&
    error.message === "store_shipping_area_unsupported" &&
    (error as ClientApiError).status !== 499 &&
    !isProtectedDataError(error) &&
    !isUncertainMutationError(error)
  );
}
type OrderReview = {
  input: StoreOrderQuoteInput;
  quote: StoreOrderQuote;
  addressChanged: boolean;
};

function useVietnamDay() {
  const [today, setToday] = useState(() => adminTodayIso());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      const day = adminTodayIso(now);
      setToday(day);
      const midnight = new Date(`${day}T00:00:00+07:00`);
      const nextDay = midnight.getTime() + 24 * 60 * 60 * 1000;
      timer = setTimeout(refresh, Math.max(nextDay - now.getTime(), 1));
    }
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}

function quoteChangedAddress(previous: StoreOrderGuest | null, next: StoreOrderGuest) {
  return (
    previous !== null &&
    (previous.recipient_name.trim() !== next.recipient_name ||
      formatVietnamPhone(previous.phone_number) !== formatVietnamPhone(next.phone_number) ||
      previous.address.trim() !== next.address ||
      previous.province_code !== next.province_code ||
      previous.ward_code !== next.ward_code)
  );
}

export function StoreOrderCreate() {
  const { locale, t } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const scope = useAdminRecordScope(routePath);
  const eligibilityScope = useAdminRecordScope(`${routePath}:products`);
  const [editableDraft, setDraft] = useState(() => blankStoreOrderDraft<StoreProduct>());
  const [showErrors, setShowErrors] = useState(false);
  const [picker, setPicker] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<unknown>();
  const [previousError, setPreviousError] = useState<{
    error: ClientApiError;
    draft: OrderDraft;
  }>();
  const [unavailableProducts, setUnavailableProducts] = useState<ReadonlySet<StoreProduct>>(
    () => new Set(),
  );
  const [review, setReview] = useState<OrderReview | null>(null);
  const [rejectedGuestArea, setRejectedGuestArea] = useState<string>();
  const quotingRef = useRef(false);
  const submit = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const lastFocusedAttempt = useRef(0);
  const feedback = useRef<HTMLDivElement>(null);
  const typeHeading = useId();
  const recipientHeading = useId();
  const dateId = useId();
  function resetDraft() {
    scope.retire();
    quotingRef.current = false;
    setQuoting(false);
    setDraft(blankStoreOrderDraft<StoreProduct>());
    setReview(null);
    setShowErrors(false);
    setPicker(false);
    setPreviousError(undefined);
    setRejectedGuestArea(undefined);
    setUnavailableProducts(new Set());
    eligibilityScope.retire();
  }

  const creation = useStoreOrderCreation({
    onConfirmed(id) {
      resetDraft();
      toast(copy.confirmed);
      router.replace(`${listPath}/${id}`);
    },
    onRejected(draft, issue) {
      setDraft(draft);
      setShowErrors(true);
      if (isUnsupportedAreaRejection(issue)) refreshRejectedArea(draft);
    },
    onAccessDenied: resetDraft,
  });

  const intent = creation.intent;
  const recovery = creation.unresolved;
  const draft = creation.draft ?? editableDraft;
  const currentDraft = useRef({ draft, locale });
  useLayoutEffect(() => {
    currentDraft.current = { draft, locale };
  }, [draft, locale]);
  const today = useVietnamDay();
  const day = new Date(`${today}T12:00:00+07:00`);
  const range = storeOrderDateRange(draft.kind, day);
  const preview = validateStoreOrderDraft(draft, locale, day);
  const buyer = useStoreOrderBuyer(draft.buyerType === "user" ? draft.userId : null);
  const activeReview =
    review && preview.input && JSON.stringify(preview.input) === JSON.stringify(review.input)
      ? review
      : null;
  const busy = intent?.phase === "pending";
  const protectedError = quoteError && isProtectedDataError(quoteError);
  const locked = Boolean(intent || recovery || protectedError);
  const guestAddress = useAddressFields(draft.guest, draft.buyerType === "guest" && !locked);
  const guestAreaRejected =
    draft.buyerType === "guest" && rejectedGuestArea === guestAreaKey(draft.guest);
  const storageError = creation.storage.status === "blocked" ? creation.storage.issue : undefined;

  function refreshRejectedArea(rejectedDraft: OrderDraft) {
    if (rejectedDraft.buyerType === "guest") {
      setRejectedGuestArea(guestAreaKey(rejectedDraft.guest));
    }
    void guestAddress.query.refetch({ cancelRefetch: false });
  }

  async function revalidateGuestArea(guest: StoreOrderGuest) {
    const options = supportedShippingAreasOptions(locale);
    if (
      !onlineManager.isOnline() ||
      queryClient.getQueryState(options.queryKey)?.fetchStatus === "paused"
    ) {
      setQuoteError(new Error("network_error"));
      return false;
    }
    try {
      // Force a network read even when the form's cache entry is still fresh.
      // TanStack shares any already pending read for this key.
      const areas = await queryClient.fetchQuery({ ...options, staleTime: 0 });
      return Boolean(findSupportedShippingLocation(areas, guest).ward);
    } catch {
      // The shared query exposes the read failure and retry on AddressFields.
      return false;
    }
  }

  function matchesCurrentInput(input: StoreOrderQuoteInput) {
    const latest = currentDraft.current;
    return (
      JSON.stringify(validateStoreOrderDraft(latest.draft, latest.locale).input) ===
      JSON.stringify(input)
    );
  }

  function update(change: (previous: OrderDraft) => OrderDraft) {
    if (!creation.canEdit() || protectedError) return;
    scope.retire();
    quotingRef.current = false;
    setQuoting(false);
    setReview(null);
    if (problem) setPreviousError({ error: problem, draft });
    setQuoteError(undefined);
    creation.clearIssue();
    setDraft(change);
  }

  function changeKind(kind: OrderDraft["kind"]) {
    if (!creation.canEdit() || protectedError || kind === draft.kind) return;
    update((previous) => ({
      ...previous,
      kind,
      deliveryDate: validStoreOrderDate(previous.deliveryDate, storeOrderDateRange(kind))
        ? previous.deliveryDate
        : "",
    }));
    setUnavailableProducts(new Set());
    const read = eligibilityScope.beginRead();
    const products = draft.lines.map(({ product }) => product);
    if (!products.length) return;
    void listStoreProducts(
      { order_kind: kind, product_ids: products.map(({ id }) => id) },
      read.signal,
    )
      .then(({ data }) => {
        if (!read.current()) return;
        const available = new Set(data.map(({ id }) => id));
        setUnavailableProducts(new Set(products.filter(({ id }) => !available.has(id))));
      })
      .catch((error: unknown) => {
        if (read.current() && isProtectedDataError(error)) {
          setQuoteError(error);
          resetDraft();
        }
        // A new quote also checks eligibility if this optional read fails.
      });
  }

  async function reviewOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creation.canSubmit() || quotingRef.current || protectedError) return;
    setShowErrors(true);
    setQuoteError(undefined);
    setPreviousError(undefined);
    eligibilityScope.retire();
    creation.clearIssue();
    setReview(null);
    const { input } = validateStoreOrderDraft(draft, locale);
    if (
      !input ||
      guestAreaRejected ||
      (draft.buyerType === "user" &&
        (!buyer.eligible || (draft.kind === "new" && buyer.address?.is_supported === false)))
    ) {
      setValidationAttempt((version) => version + 1);
      return;
    }
    const read = scope.beginRead();
    quotingRef.current = true;
    setQuoting(true);
    try {
      if (input.guest) {
        const supported = await revalidateGuestArea(input.guest);
        if (!read.current() || !matchesCurrentInput(input) || !creation.canSubmit()) return;
        if (!supported) {
          setValidationAttempt((version) => version + 1);
          return;
        }
      }
      const quote = await quoteAdminStoreOrder(input, read.signal);
      if (read.current() && matchesCurrentInput(input)) {
        if (input.guest) setRejectedGuestArea(undefined);
        setUnavailableProducts(new Set());
        setReview({
          input,
          quote,
          addressChanged: quoteChangedAddress(buyer.address, quote.shipping_address),
        });
      }
    } catch (error) {
      if (read.current()) {
        setQuoteError(error);
        if (isUnsupportedAreaRejection(error)) refreshRejectedArea(draft);
        if (isProtectedDataError(error)) {
          setDraft(blankStoreOrderDraft<StoreProduct>());
          setPicker(false);
        }
      }
    } finally {
      if (read.current()) {
        quotingRef.current = false;
        setQuoting(false);
      }
    }
  }

  function discardReview() {
    setReview(null);
    setShowErrors(true);
    setValidationAttempt((version) => version + 1);
  }

  async function create() {
    if (!activeReview || quotingRef.current || !creation.canSubmit()) return;
    const { input, quote } = activeReview;
    if (guestAreaRejected || !matchesCurrentInput(input)) {
      discardReview();
      return;
    }
    if (input.guest) {
      const current = scope.capture();
      quotingRef.current = true;
      setQuoting(true);
      try {
        const supported = await revalidateGuestArea(input.guest);
        if (!current()) return;
        if (!supported || !matchesCurrentInput(input) || !creation.canSubmit()) {
          discardReview();
          return;
        }
      } finally {
        if (current()) {
          quotingRef.current = false;
          setQuoting(false);
        }
      }
    }
    setReview(null);
    void creation.create(
      { ...input, confirmation: quote.confirmation, idempotency_key: crypto.randomUUID() },
      draft,
    );
  }

  const issue = creation.issue ?? quoteError;
  const problem: ClientApiError | undefined = issue instanceof Error ? issue : undefined;
  const issueCode = problem?.message ?? "";
  const validationError = problem ? { error: problem, draft } : previousError;
  const backendErrors = keepUnchangedOrderErrors(
    storeOrderCreateErrors(
      validationError?.error,
      validationError?.draft.lines.map(({ product }) => product.id) ?? [],
      copy.guestInvalid,
      copy.quantityError,
      copy.moneyError,
      copy.productUnavailable,
      copy.stockChanged,
    ),
    validationError?.draft,
    draft,
  );
  for (const { product } of draft.lines) {
    if (unavailableProducts.has(product)) {
      backendErrors.lines[product.id] = {
        ...backendErrors.lines[product.id],
        product: copy.productUnavailable,
      };
    }
  }
  const feedbackStage =
    intent?.phase ?? (recovery ? "unknown" : issue != null ? issueCode || "failed" : "");
  useLayoutEffect(() => {
    if (intent || recovery || protectedError) {
      feedback.current?.focus();
      return;
    }
    const attempted = validationAttempt !== lastFocusedAttempt.current;
    lastFocusedAttempt.current = validationAttempt;
    if (!attempted && !issue) return;
    const firstInvalid = form.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]:not([disabled]), [data-order-field-error]',
    );
    (firstInvalid ?? feedback.current)?.focus();
  }, [feedbackStage, intent, issue, protectedError, recovery, validationAttempt]);
  const businessErrors: Record<string, string> = {
    store_requote_required: copy.requote,
    store_creation_closed: copy.creationClosed,
    store_recovered_request_closed: copy.recoveredRequestClosed,
    store_stock_changed: copy.stockChanged,
    store_product_changed: copy.productUnavailable,
    store_shipping_area_unsupported: copy.shippingUnsupported,
    store_membership_frozen: copy.memberFrozen,
    store_buyer_not_found: copy.buyerInvalid,
    store_buyer_ineligible: copy.buyerInvalid,
    store_shipping_address_required: copy.buyerInvalid,
    store_shipping_address_invalid: copy.buyerInvalid,
    store_phone_invalid: copy.phoneInvalid,
    store_delivery_date_invalid:
      draft.kind === "new" ? copy.dateInvalidNew : copy.dateInvalidHistorical,
    store_order_amount_out_of_range: copy.totalError,
    store_duplicate_product: copy.productsRequired,
  };
  const guestErrors = { ...backendErrors.buyer };
  if (guestAreaRejected && guestAddress.ward) {
    guestErrors.ward_code ??= t.csaCustomers.shippingAreaUnsupported;
  }
  if (issueCode === "store_buyer_not_found" || issueCode === "store_buyer_ineligible") {
    guestErrors.user ??= copy.buyerInvalid;
  }
  if (showErrors) {
    for (const field of [
      "recipient_name",
      "phone_number",
      "province_code",
      "ward_code",
      "address",
    ] as const) {
      const fieldIssue = preview.errors.guest[field];
      if (fieldIssue && !guestErrors[field])
        guestErrors[field] =
          fieldIssue === "required"
            ? copy.guestRequired
            : field === "phone_number"
              ? copy.phoneInvalid
              : copy.guestInvalid;
    }
    if (preview.errors.user) guestErrors.user ??= copy.buyerRequired;
  }
  const dateError =
    showErrors && (preview.errors.deliveryDate || backendErrors.date)
      ? draft.kind === "new"
        ? copy.dateInvalidNew
        : copy.dateInvalidHistorical
      : undefined;
  const detailPath =
    intent?.phase === "confirmed" && "id" in intent.receipt
      ? `${listPath}/${intent.receipt.id}`
      : null;

  return (
    <Stack gap="md" miw={0}>
      <AdminBreadcrumbForRoute
        pathname={routePath}
        items={[{ label: t.common.storeOrders, href: listPath }, { label: c.createOrder }]}
      />
      <PageHeading title={c.createOrder} visuallyHiddenTitle />
      {storageError !== undefined && (
        <RecoveryAlert
          message={
            storageError instanceof Error && storageError.message === "store_recovery_corrupt"
              ? copy.recoveryCorrupt
              : copy.recoveryUnavailable
          }
          retryLabel={t.common.retry}
          onRetry={creation.refreshStorage}
        />
      )}
      {intent?.phase === "retired" || protectedError ? (
        <Alert ref={feedback} tabIndex={-1} color="danger" role="alert">
          {t.common.forbidden}
        </Alert>
      ) : detailPath ? (
        <Paper p="md" ref={feedback} tabIndex={-1}>
          <Stack gap="sm" align="flex-start">
            <Text role="status">
              {intent?.phase === "confirmed" &&
              "id" in intent.receipt &&
              intent.receipt.conflictingKey
                ? copy.conflictResolved
                : copy.confirmed}
            </Text>
            <Group gap="xs">
              <Button component={AdminNavigationLink} href={detailPath}>
                {copy.openOrder}
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={async () => {
                  if (await creation.startAnother()) resetDraft();
                }}
              >
                {copy.startAnother}
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : (
        <Box
          component="form"
          ref={form}
          noValidate
          onSubmit={reviewOrder}
          className={styles.container}
        >
          <Stack gap="md">
            {feedbackStage && (
              <Stack ref={feedback} tabIndex={-1} gap="xs">
                {recovery && creation.storage.status === "ready" && (
                  <Stack gap="xs" align="flex-start">
                    <RecoveryAlert
                      message={
                        issueCode === "create_receipt_not_found"
                          ? copy.creationMissing
                          : recovery.conflictingKey
                            ? copy.creationConflict
                            : issueCode === "store_payment_unavailable"
                              ? copy.paymentUnavailable
                              : issueCode === "store_requote_required" ||
                                  issueCode === "store_stock_changed"
                                ? copy.replayRequote
                                : recovery.submission
                                  ? copy.creationUnknown
                                  : copy.recoveryOnly
                      }
                      retryLabel={copy.check}
                      onRetry={() => void creation.recover()}
                    />
                    {!recovery.conflictingKey && (
                      <Group gap="xs">
                        {recovery.submission && (
                          <Button
                            type="button"
                            variant="default"
                            onClick={() => void creation.replay()}
                          >
                            {copy.replay}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="default"
                          onClick={() => void creation.close()}
                        >
                          {recovery.submission ? copy.closeRequest : copy.closeRecoveredRequest}
                        </Button>
                      </Group>
                    )}
                  </Stack>
                )}
                {busy && (
                  <Alert color="info" role="status">
                    {creation.operation === "recover"
                      ? copy.checking
                      : creation.operation === "close"
                        ? copy.closing
                        : copy.creating}
                  </Alert>
                )}
                {!intent && issue != null && (
                  <Alert color="warning" role="alert">
                    {businessErrors[issueCode] ??
                      requestErrorMessage(issue, t, {
                        kind: copy.orderType,
                        delivery_date: c.deliveryDate,
                        buyer_user_id: c.recipient,
                        recipient_name: c.recipientName,
                        phone_number: c.phone,
                        province_code: t.addressFields.province,
                        ward_code: t.addressFields.ward,
                        address: t.addressFields.address,
                        lines: c.productsTitle,
                        quantity: c.quantity,
                        unit_price_vnd: copy.unitPrice,
                        shipping_fee_vnd: c.shippingFee,
                      })}
                  </Alert>
                )}
              </Stack>
            )}
            <Paper component="section" aria-labelledby={typeHeading} p="md">
              <Stack gap="sm">
                <Title id={typeHeading} order={2} size="md" fw={600}>
                  {copy.order}
                </Title>
                <div className={styles.orderFields}>
                  <Radio.Group
                    error={backendErrors.orderKind ? copy.guestInvalid : undefined}
                    label={copy.orderType}
                    value={draft.kind}
                    onChange={(value) => {
                      if (value === "new" || value === "historical") changeKind(value);
                    }}
                  >
                    <Group gap="md" mt="xs">
                      <Radio
                        value="new"
                        label={copy.newOrder}
                        disabled={locked}
                        aria-invalid={backendErrors.orderKind || undefined}
                      />
                      <Radio value="historical" label={copy.historical} disabled={locked} />
                    </Group>
                  </Radio.Group>
                  <Input.Wrapper
                    id={dateId}
                    label={c.deliveryDate}
                    required
                    error={dateError}
                    maw="16rem"
                  >
                    <AdminDateInput
                      id={dateId}
                      required
                      disabled={locked}
                      value={draft.deliveryDate}
                      pickerLabel={copy.datePicker}
                      min={range.min}
                      max={range.max}
                      aria-invalid={Boolean(dateError)}
                      aria-describedby={dateError ? `${dateId}-error` : undefined}
                      onValueChange={(deliveryDate) =>
                        update((previous) => ({ ...previous, deliveryDate }))
                      }
                    />
                  </Input.Wrapper>
                </div>
              </Stack>
            </Paper>
            <div className={styles.sections}>
              <Paper component="section" aria-labelledby={recipientHeading} p="md" miw={0}>
                <Stack gap="sm">
                  <Title id={recipientHeading} order={2} size="md" fw={600}>
                    {c.recipient}
                  </Title>
                  <StoreOrderBuyerFields
                    kind={draft.kind}
                    userId={draft.userId}
                    onUserChange={(userId) => update((previous) => ({ ...previous, userId }))}
                    guest={draft.guest}
                    guestAddress={guestAddress}
                    onGuestChange={(guest) =>
                      update((previous) => ({
                        ...previous,
                        guest,
                        guestPhoneRejected:
                          previous.guest.phone_number === guest.phone_number &&
                          previous.guestPhoneRejected,
                      }))
                    }
                    guestPhoneRejected={draft.guestPhoneRejected}
                    onGuestPhoneRejectionChange={(guestPhoneRejected) =>
                      update((previous) => ({ ...previous, guestPhoneRejected }))
                    }
                    buyerType={draft.buyerType}
                    onBuyerTypeChange={(buyerType) =>
                      update((previous) => ({ ...previous, buyerType }))
                    }
                    lookup={buyer}
                    disabled={locked}
                    errors={guestErrors}
                  />
                </Stack>
              </Paper>
              <div className={styles.products}>
                <StoreOrderCreateProducts
                  kind={draft.kind}
                  lines={draft.lines}
                  preview={preview}
                  quote={activeReview?.quote}
                  showErrors={showErrors}
                  lineErrors={backendErrors.lines}
                  productsError={backendErrors.products ? copy.productsRequired : undefined}
                  disabled={locked}
                  onPicker={() => setPicker(true)}
                  onEdit={(id, values) =>
                    update((previous) => ({
                      ...previous,
                      lines: previous.lines.map((line) =>
                        line.product.id === id ? { ...line, ...values } : line,
                      ),
                    }))
                  }
                  onRemove={(id) =>
                    update((previous) => ({
                      ...previous,
                      lines: previous.lines.filter((line) => line.product.id !== id),
                    }))
                  }
                />
              </div>
              <StoreOrderCreatePricing
                kind={draft.kind}
                rawShipping={draft.shippingFee}
                shippingError={backendErrors.shipping}
                shippingFeeRejected={draft.shippingFeeRejected}
                disabled={locked}
                showErrors={showErrors}
                preview={preview}
                quote={activeReview?.quote}
                onShippingChange={(shippingFee, shippingFeeRejected) =>
                  update((previous) => ({ ...previous, shippingFee, shippingFeeRejected }))
                }
              />
            </div>
            <Group component="footer" justify="flex-end" gap="xs">
              <Button component={AdminNavigationLink} href={listPath} variant="default">
                {copy.cancel}
              </Button>
              <Button
                ref={submit}
                type="submit"
                loading={quoting || busy}
                disabled={
                  locked ||
                  creation.storage.status !== "ready" ||
                  (draft.buyerType === "user" &&
                    Boolean(draft.userId) &&
                    (!buyer.eligible ||
                      (draft.kind === "new" && buyer.address?.is_supported === false)))
                }
              >
                {quoting ? copy.quoting : c.createOrder}
              </Button>
            </Group>
          </Stack>
        </Box>
      )}
      <StoreOrderProductPicker
        opened={picker && !locked}
        onClose={() => setPicker(false)}
        kind={draft.kind}
        selected={draft.lines.map((line) => line.product)}
        onAdd={(products) => {
          update((previous) => {
            const ids = new Set(previous.lines.map((line) => line.product.id));
            const added = products.filter((product) => {
              if (ids.has(product.id) || ids.size >= MAX_ORDER_LINES) return false;
              ids.add(product.id);
              return true;
            });
            return {
              ...previous,
              lines: [
                ...previous.lines,
                ...added.map((product) => ({
                  product,
                  quantity: "1",
                  unitPrice: product.retail_price_vnd,
                })),
              ],
            };
          });
          setPicker(false);
        }}
      />
      {activeReview && !locked && (
        <ConfirmationDialog
          title={copy.confirmTitle}
          cancelLabel={copy.cancel}
          confirmLabel={copy.confirm}
          busyLabel={copy.quoting}
          busy={quoting}
          returnFocusRef={submit}
          fallbackFocusRef={feedback}
          onCancel={() => setReview(null)}
          onConfirm={create}
        >
          <OrderReviewFields review={activeReview} />
        </ConfirmationDialog>
      )}
    </Stack>
  );
}
