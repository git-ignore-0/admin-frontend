"use client";

import { Alert, Box, Button, Group, Input, Paper, Radio, Stack, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { AdminDateInput } from "@/components/admin-date-input";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useAdminRecordScope } from "@/components/admin-query-provider";
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
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import { formatVietnamPhone } from "@/lib/phone-number";
import { storeOrderCreateCopy } from "@/lib/store-order-create-copy";
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
  const scope = useAdminRecordScope(routePath);
  const [editableDraft, setDraft] = useState(() => blankStoreOrderDraft<StoreProduct>());
  const [showErrors, setShowErrors] = useState(false);
  const [picker, setPicker] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<unknown>();
  const [review, setReview] = useState<OrderReview | null>(null);
  const quotingRef = useRef(false);
  const submit = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const typeHeading = useId();
  const recipientHeading = useId();
  const dateId = useId();
  function resetDraft() {
    setDraft(blankStoreOrderDraft<StoreProduct>());
    setReview(null);
    setShowErrors(false);
    setPicker(false);
  }

  const creation = useStoreOrderCreation({
    onConfirmed(id) {
      resetDraft();
      toast(copy.confirmed);
      router.replace(`${listPath}/${id}`);
    },
    onRejected: setDraft,
    onAccessDenied: resetDraft,
  });

  const intent = creation.intent;
  const draft =
    intent?.phase === "pending" || intent?.phase === "unknown"
      ? intent.payload.draft
      : editableDraft;
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
  const locked = Boolean(intent || protectedError);

  function update(change: (previous: OrderDraft) => OrderDraft) {
    if (!creation.canEdit() || protectedError) return;
    scope.retire();
    quotingRef.current = false;
    setQuoting(false);
    setReview(null);
    setQuoteError(undefined);
    creation.clearIssue();
    setDraft(change);
  }

  async function reviewOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creation.canEdit() || quotingRef.current || protectedError) return;
    setShowErrors(true);
    setQuoteError(undefined);
    creation.clearIssue();
    setReview(null);
    const { input } = validateStoreOrderDraft(draft, locale);
    if (!input) return;
    if (
      draft.buyerType === "user" &&
      (!buyer.eligible || (draft.kind === "new" && buyer.address?.is_supported === false))
    )
      return;
    const read = scope.beginRead();
    quotingRef.current = true;
    setQuoting(true);
    try {
      const quote = await quoteAdminStoreOrder(input, read.signal);
      if (read.current()) {
        setReview({
          input,
          quote,
          addressChanged: quoteChangedAddress(buyer.address, quote.shipping_address),
        });
      }
    } catch (error) {
      if (read.current()) {
        setQuoteError(error);
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

  function create() {
    if (!activeReview || !creation.canEdit()) return;
    const now = validateStoreOrderDraft(draft, locale);
    if (JSON.stringify(now.input) !== JSON.stringify(activeReview.input)) {
      setReview(null);
      setShowErrors(true);
      return;
    }
    const { input, quote } = activeReview;
    setReview(null);
    void creation.create(
      { ...input, confirmation: quote.confirmation, idempotency_key: crypto.randomUUID() },
      draft,
    );
  }

  const issue = creation.issue ?? quoteError;
  const problem: ClientApiError | undefined = issue instanceof Error ? issue : undefined;
  const issueCode = problem?.message ?? "";
  const invalidField = issueCode === "validation_error" ? problem?.field : undefined;
  const feedbackStage = intent?.phase ?? (issue != null ? issueCode || "failed" : "");
  useLayoutEffect(() => {
    if (feedbackStage) feedback.current?.focus();
  }, [feedbackStage]);
  const businessErrors: Record<string, string> = {
    store_requote_required: copy.requote,
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
  const guestErrors: Partial<Record<keyof StoreOrderGuest | "user", string>> = {};
  if (showErrors) {
    for (const field of [
      "recipient_name",
      "phone_number",
      "province_code",
      "ward_code",
      "address",
    ] as const) {
      const fieldIssue = preview.errors.guest[field];
      if (invalidField === field) guestErrors[field] = copy.guestInvalid;
      else if (fieldIssue)
        guestErrors[field] =
          fieldIssue === "required"
            ? copy.guestRequired
            : field === "phone_number"
              ? copy.phoneInvalid
              : copy.guestInvalid;
    }
    if (invalidField === "buyer_user_id") guestErrors.user = copy.buyerInvalid;
    else if (preview.errors.user) guestErrors.user = copy.buyerRequired;
  }
  const dateError =
    showErrors && (preview.errors.deliveryDate || invalidField === "delivery_date")
      ? draft.kind === "new"
        ? copy.dateInvalidNew
        : copy.dateInvalidHistorical
      : undefined;
  const detailPath = intent?.phase === "confirmed" ? `${listPath}/${intent.receipt.id}` : null;

  return (
    <Stack gap="md" miw={0}>
      <AdminBreadcrumbForRoute
        pathname={routePath}
        items={[{ label: t.common.storeOrders, href: listPath }, { label: c.createOrder }]}
      />
      <PageHeading title={c.createOrder} visuallyHiddenTitle />
      {intent?.phase === "retired" || protectedError ? (
        <Alert ref={feedback} tabIndex={-1} color="danger" role="alert">
          {t.common.forbidden}
        </Alert>
      ) : detailPath ? (
        <Paper p="md" ref={feedback} tabIndex={-1}>
          <Stack gap="sm" align="flex-start">
            <Text role="status">
              {intent?.phase === "confirmed" && intent.receipt.conflictingKey
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
                onClick={() => {
                  if (creation.startAnother()) resetDraft();
                }}
              >
                {copy.startAnother}
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : (
        <Box component="form" noValidate onSubmit={reviewOrder} className={styles.container}>
          <Stack gap="md">
            {feedbackStage && (
              <Stack ref={feedback} tabIndex={-1} gap="xs">
                {intent?.phase === "unknown" && (
                  <Stack gap="xs" align="flex-start">
                    <RecoveryAlert
                      message={
                        issueCode === "create_receipt_not_found"
                          ? copy.creationMissing
                          : intent.payload.conflictingKey
                            ? copy.creationConflict
                            : issueCode === "store_payment_unavailable"
                              ? copy.paymentUnavailable
                              : issueCode === "store_requote_required" ||
                                  issueCode === "store_stock_changed"
                                ? copy.replayRequote
                                : copy.creationUnknown
                      }
                      retryLabel={copy.check}
                      onRetry={() => void creation.recover()}
                    />
                    {!intent.payload.conflictingKey && (
                      <Button
                        type="button"
                        variant="default"
                        onClick={() => void creation.replay()}
                      >
                        {copy.replay}
                      </Button>
                    )}
                  </Stack>
                )}
                {busy && (
                  <Alert color="info" role="status">
                    {creation.operation === "recover" ? copy.checking : copy.creating}
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
                        province_code: c.province,
                        ward_code: c.ward,
                        address: c.address,
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
                <Radio.Group
                  label={copy.orderType}
                  value={draft.kind}
                  onChange={(value) => {
                    if (value !== "new" && value !== "historical") return;
                    update((previous) => ({
                      ...previous,
                      kind: value,
                      deliveryDate: validStoreOrderDate(
                        previous.deliveryDate,
                        storeOrderDateRange(value),
                      )
                        ? previous.deliveryDate
                        : "",
                    }));
                  }}
                >
                  <Group gap="md" mt="xs">
                    <Radio value="new" label={copy.newOrder} disabled={locked} />
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
                    onGuestChange={(guest) => update((previous) => ({ ...previous, guest }))}
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
                disabled={locked}
                showErrors={showErrors}
                preview={preview}
                quote={activeReview?.quote}
                onShippingChange={(shippingFee) =>
                  update((previous) => ({ ...previous, shippingFee }))
                }
              />
            </div>
            <Group justify="flex-end" gap="xs">
              <Button component={AdminNavigationLink} href={listPath} variant="default">
                {copy.cancel}
              </Button>
              <Button
                ref={submit}
                type="submit"
                loading={quoting || busy}
                disabled={
                  locked ||
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
                ...added.map((product) => ({ product, quantity: "1", unitPrice: "" })),
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
          busyLabel={copy.creating}
          busy={false}
          returnFocusRef={submit}
          fallbackFocusRef={feedback}
          onCancel={() => setReview(null)}
          onConfirm={create}
        >
          <OrderReviewFields review={activeReview} products={draft.lines} />
        </ConfirmationDialog>
      )}
    </Stack>
  );
}
