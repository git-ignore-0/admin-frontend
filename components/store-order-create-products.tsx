"use client";

import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Input,
  Paper,
  Stack,
  Text,
  TextInput,
  type TextInputProps,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { PaymentRow, StoreOrderPaymentStatus } from "@/components/store-order-summary";
import { StoreOrderStatusBadge } from "@/components/store-order-status";
import {
  MAX_ORDER_AMOUNT,
  MAX_ORDER_LINES,
  MAX_ORDER_QUANTITY,
  type StoreOrderKind,
  type StoreOrderQuote,
} from "@/lib/admin-store-order-api";
import { formatDecimalInput, parsePositiveInteger } from "@/lib/numeric-input";
import { storeOrderCreateCopy } from "@/lib/store-order-create-copy";
import {
  storeOrderProductName,
  type StoreOrderDraft,
  type validateStoreOrderDraft,
} from "@/lib/store-order-draft";
import { formatStoreMoney } from "@/lib/store-orders";
import { storeOrdersCopy, storeShippingDiscountReason } from "@/lib/store-orders-copy";
import type { StoreProduct } from "@/lib/types";
import classes from "./store-order-create-products.module.css";

type Lines = StoreOrderDraft<StoreProduct>["lines"];
type Preview = ReturnType<typeof validateStoreOrderDraft>;
type Amount = bigint | string | null;
type LineError = Partial<Record<"product" | "quantity" | "unitPrice", string>>;

const invalidIntegerCharacter = /[^0-9]/u;

function money(value: Amount | undefined, locale: "vi" | "en") {
  return value == null ? "—" : formatStoreMoney(String(value), locale);
}

function acceptsOrderInteger(candidate: string, allowZero: boolean) {
  if (invalidIntegerCharacter.test(candidate)) return false;
  if (!candidate || (allowZero && /^0+$/u.test(candidate))) return true;
  return (
    parsePositiveInteger(candidate, {
      max: allowZero ? Number(MAX_ORDER_AMOUNT) : MAX_ORDER_QUANTITY,
    }).value !== undefined
  );
}

function selection(input: HTMLInputElement) {
  return {
    start: input.selectionStart ?? input.value.length,
    end: input.selectionEnd ?? input.value.length,
  };
}

function replacement(input: HTMLInputElement, inserted: string) {
  const { start, end } = selection(input);
  return input.value.slice(0, start) + inserted + input.value.slice(end);
}

function OrderIntegerInput({
  value,
  allowZero = false,
  onValueChange,
  ...props
}: Omit<TextInputProps, "value" | "onChange" | "inputMode"> & {
  value: string;
  allowZero?: boolean;
  onValueChange: (value: string) => void;
}) {
  const compositionSelection = useRef<ReturnType<typeof selection> | null>(null);
  const [compositionValue, setCompositionValue] = useState<string | null>(null);

  return (
    <TextInput
      {...props}
      inputMode="numeric"
      value={compositionValue ?? value}
      onKeyDown={(event) => {
        if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.nativeEvent.isComposing &&
          !acceptsOrderInteger(replacement(event.currentTarget, event.key), allowZero)
        ) {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        const pasted = event.clipboardData.getData("text/plain");
        if (pasted && !acceptsOrderInteger(replacement(event.currentTarget, pasted), allowZero)) {
          event.preventDefault();
        }
      }}
      onCompositionStart={(event) => {
        compositionSelection.current = selection(event.currentTarget);
      }}
      onCompositionEnd={(event) => {
        const input = event.currentTarget;
        const prior = compositionSelection.current;
        compositionSelection.current = null;
        setCompositionValue(null);
        if (!prior) return;
        const candidate = value.slice(0, prior.start) + event.data + value.slice(prior.end);
        if (event.data && acceptsOrderInteger(candidate, allowZero)) {
          if (input.value !== candidate) input.value = candidate;
          const caret = prior.start + event.data.length;
          input.setSelectionRange(caret, caret);
          onValueChange(candidate);
        } else {
          input.value = value;
          input.setSelectionRange(prior.start, prior.end);
        }
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        if (compositionSelection.current) {
          setCompositionValue(input.value);
          return;
        }
        // A text input can strip line breaks before its value reaches React.
        const inserted = event.nativeEvent instanceof InputEvent ? event.nativeEvent.data : null;
        if (
          !invalidIntegerCharacter.test(inserted ?? "") &&
          acceptsOrderInteger(input.value, allowZero)
        ) {
          onValueChange(input.value);
        } else {
          const caret = Math.max(0, selection(input).start - (inserted?.length ?? 0));
          input.value = value;
          input.setSelectionRange(caret, caret);
        }
      }}
    />
  );
}

export function StoreOrderCreateProducts({
  kind,
  lines,
  preview,
  quote,
  showErrors,
  disabled,
  productsError,
  lineErrors,
  onPicker,
  onEdit,
  onRemove,
}: {
  kind: StoreOrderKind;
  lines: Lines;
  preview: Preview;
  quote?: StoreOrderQuote;
  showErrors: boolean;
  disabled: boolean;
  productsError?: string;
  lineErrors?: Record<string, LineError>;
  onPicker: () => void;
  onEdit: (id: string, values: Partial<Pick<Lines[number], "quantity" | "unitPrice">>) => void;
  onRemove: (id: string) => void;
}) {
  const heading = useId();
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);
  const historical = kind === "historical";
  const estimated = !historical && !quote;
  const quotedLines = new Map(quote?.lines.map((line) => [line.product_id, line]));
  const listError =
    productsError ?? (showErrors && preview.errors.products ? copy.productsRequired : undefined);
  const listErrorId = `${heading}-error`;
  return (
    <DataListPaper component="section" aria-labelledby={heading} p="md">
      <Stack gap="md">
        <Group justify="space-between" gap="xs">
          <Title id={heading} order={2} size="md" fw={600}>
            {c.productsTitle}
          </Title>
          <Button
            type="button"
            size="sm"
            variant="default"
            leftSection={<IconPlus size={16} aria-hidden />}
            disabled={disabled || lines.length >= MAX_ORDER_LINES}
            aria-invalid={listError ? true : undefined}
            aria-describedby={listError ? listErrorId : undefined}
            onClick={onPicker}
          >
            {copy.addProduct}
          </Button>
        </Group>
        {!lines.length && (
          <Text size="sm" c="dimmed">
            {copy.noProducts}
          </Text>
        )}
        {listError && (
          <Text
            id={listErrorId}
            size="sm"
            c="danger"
            role="alert"
            tabIndex={-1}
            data-order-field-error
          >
            {listError}
          </Text>
        )}
        {lines.length > 0 && (
          <Stack component="ul" role="list" gap={0} m={0} p={0} className={classes.productList}>
            {lines.map(({ product, quantity, unitPrice }, index) => {
              const name = storeOrderProductName(product, locale);
              const productLabel = `${heading}-${product.id}`;
              const errors = preview.errors.lines[product.id];
              const serverErrors = lineErrors?.[product.id];
              const quoted = quotedLines.get(product.id);
              const removeLabel = copy.removeProduct.replace("{product}", name);
              return (
                <Box component="li" key={product.id} miw={0} aria-labelledby={productLabel}>
                  {index > 0 && <Divider my="sm" aria-hidden />}
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                      <Stack gap={4} miw={0}>
                        <Text id={productLabel} size="md" fw={600}>
                          {name}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {product.sku} · {formatDecimalInput(product.unit_size)}{" "}
                          {locale === "vi" ? product.unit_label_vi : product.unit_label_en}
                        </Text>
                      </Stack>
                      <Stack gap={4} miw={0} maw="45%" ms="auto" ta="end">
                        <Text size="md" fw={600} className={classes.numeric}>
                          {money(quoted?.subtotal_vnd ?? preview.perLine.get(product.id), locale)}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {estimated ? copy.estimatedAmount : copy.amount}
                        </Text>
                      </Stack>
                    </Group>
                    {(serverErrors?.product || errors?.product) && (
                      <Text size="sm" c="danger" role="alert" tabIndex={-1} data-order-field-error>
                        {serverErrors?.product ?? copy.productUnavailable}
                      </Text>
                    )}
                    <Box className={classes.productControls}>
                      <OrderIntegerInput
                        label={c.quantity}
                        aria-label={`${c.quantity} · ${name}`}
                        required
                        value={quantity}
                        disabled={disabled}
                        error={
                          serverErrors?.quantity ??
                          (showErrors && errors?.quantity ? copy.quantityError : undefined)
                        }
                        onValueChange={(quantity) => onEdit(product.id, { quantity })}
                      />
                      {historical ? (
                        <OrderIntegerInput
                          label={copy.unitPrice}
                          aria-label={`${copy.unitPrice} · ${name}`}
                          allowZero
                          required
                          value={unitPrice}
                          disabled={disabled}
                          error={
                            serverErrors?.unitPrice ??
                            (showErrors && errors?.unitPrice ? copy.moneyError : undefined)
                          }
                          onValueChange={(unitPrice) => onEdit(product.id, { unitPrice })}
                        />
                      ) : (
                        <Input.Wrapper
                          label={quoted ? copy.unitPrice : copy.referenceUnitPrice}
                          labelElement="div"
                        >
                          <Text size="sm" fw={500} className={classes.referencePrice}>
                            {money(quoted?.unit_price_vnd ?? product.retail_price_vnd, locale)}
                          </Text>
                        </Input.Wrapper>
                      )}
                      <Tooltip label={removeLabel}>
                        <ActionIcon
                          className={classes.removeProduct}
                          aria-label={removeLabel}
                          type="button"
                          variant="subtle"
                          color="danger"
                          disabled={disabled}
                          onClick={() => onRemove(product.id)}
                        >
                          <IconTrash size={17} aria-hidden />
                        </ActionIcon>
                      </Tooltip>
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
        {lines.length > 0 && (
          <>
            <Divider />
            <Box component="dl" m={0}>
              <PaymentRow label={estimated ? copy.estimatedSubtotal : c.listedSubtotal} emphasis>
                {money(quote?.subtotal_vnd ?? preview.subtotal, locale)}
              </PaymentRow>
            </Box>
          </>
        )}
      </Stack>
    </DataListPaper>
  );
}

export function StoreOrderCreatePricing({
  kind,
  rawShipping,
  disabled,
  showErrors,
  preview,
  quote,
  shippingError,
  onShippingChange,
}: {
  kind: StoreOrderKind;
  rawShipping: string;
  disabled: boolean;
  showErrors: boolean;
  preview: Preview;
  quote?: StoreOrderQuote;
  shippingError?: string;
  onShippingChange: (value: string) => void;
}) {
  const heading = useId();
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);
  const historical = kind === "historical";
  const total = quote?.total_vnd ?? preview.total;

  return (
    <Paper component="section" aria-labelledby={heading} p="md">
      <Stack gap="sm">
        <Title id={heading} order={2} size="md" fw={600}>
          {c.paymentSummary}
        </Title>
        <StoreOrderAmounts
          subtotal={quote?.subtotal_vnd ?? preview.subtotal}
          shipping={quote?.shipping_fee_vnd ?? preview.fee}
          total={total}
          authoritative={Boolean(quote) || historical}
          shippingDiscountReason={quote?.shipping_discount_reason}
          shippingEditor={
            historical && !quote ? (
              <OrderIntegerInput
                aria-label={c.shippingFee}
                allowZero
                required
                miw={0}
                w="11rem"
                maw="100%"
                value={rawShipping}
                disabled={disabled}
                onValueChange={onShippingChange}
                error={
                  shippingError ??
                  (showErrors && preview.errors.shippingFee ? copy.moneyError : undefined)
                }
              />
            ) : undefined
          }
        />
        <StoreOrderProspectiveStatus kind={kind} total={total} />
        {showErrors && preview.errors.total && (
          <Text size="sm" c="danger" role="alert" tabIndex={-1} data-order-field-error>
            {copy.totalError}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

export function StoreOrderAmounts({
  subtotal,
  shipping,
  total,
  authoritative,
  shippingDiscountReason,
  shippingEditor,
}: {
  subtotal: Amount;
  shipping: Amount;
  total: Amount;
  authoritative: boolean;
  shippingDiscountReason?: StoreOrderQuote["shipping_discount_reason"];
  shippingEditor?: ReactNode;
}) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);

  return (
    <Stack gap="xs">
      <Stack component="dl" m={0} gap="xs">
        <PaymentRow label={authoritative ? c.listedSubtotal : copy.estimatedSubtotal}>
          {money(subtotal, locale)}
        </PaymentRow>
        <PaymentRow label={c.shippingFee}>
          {shippingEditor ?? (authoritative ? money(shipping, locale) : copy.pendingQuote)}
        </PaymentRow>
        {shippingDiscountReason && (
          <PaymentRow label={c.shippingDiscount}>
            {storeShippingDiscountReason(shippingDiscountReason, locale)}
          </PaymentRow>
        )}
      </Stack>
      <Divider />
      <Box component="dl" m={0}>
        <PaymentRow label={c.total} emphasis>
          {authoritative ? money(total, locale) : copy.pendingQuote}
        </PaymentRow>
      </Box>
    </Stack>
  );
}

export function StoreOrderProspectiveStatus({
  kind,
  total,
}: {
  kind: StoreOrderKind;
  total: Amount;
}) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);
  const historical = kind === "historical";
  const paymentStatus =
    total === null
      ? null
      : BigInt(total) === 0n
        ? "not_required"
        : historical
          ? "received"
          : "unconfirmed";

  return (
    <Stack component="dl" m={0} gap="xs">
      <PaymentRow label={copy.expectedStatus}>
        <StoreOrderStatusBadge
          order={{
            status: historical ? "delivered" : "pending_review",
            workflow_version: 2,
            refund_status: null,
            payment_status: paymentStatus ?? "unconfirmed",
          }}
        />
      </PaymentRow>
      <PaymentRow label={c.detailPaymentStatus}>
        {paymentStatus ? <StoreOrderPaymentStatus status={paymentStatus} /> : "—"}
      </PaymentRow>
    </Stack>
  );
}
