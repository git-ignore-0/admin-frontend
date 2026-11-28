"use client";

import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  type TextInputProps,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useId } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListPaper } from "@/components/data-list-paper";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { StoreOrderStatusBadge } from "@/components/store-order-status";
import type { StoreOrderKind, StoreOrderQuote } from "@/lib/admin-store-order-api";
import {
  formatStoreMoney,
  storeQuantityInputValue,
  storeQuantityPasteReplacement,
} from "@/lib/store-orders";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import { storeOrderCreateCopy } from "@/lib/store-order-create-copy";
import {
  MAX_ORDER_LINES,
  storeOrderProductName,
  type StoreOrderDraft,
  type validateStoreOrderDraft,
} from "@/lib/store-order-draft";
import type { StoreProduct } from "@/lib/types";

type Lines = StoreOrderDraft<StoreProduct>["lines"];
type Preview = ReturnType<typeof validateStoreOrderDraft>;

function money(value: bigint | string | null | undefined, locale: "vi" | "en") {
  return value == null ? "—" : formatStoreMoney(String(value), locale);
}

function OrderIntegerInput({
  value,
  onValueChange,
  ...props
}: Omit<TextInputProps, "value" | "onChange" | "inputMode"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <TextInput
      {...props}
      inputMode="numeric"
      value={value.replace(/[\r\n]+/gu, " ")}
      onInput={(event) =>
        onValueChange(storeQuantityInputValue(event.currentTarget, event.nativeEvent))
      }
      onChange={(event) => {
        if (event.nativeEvent.type !== "input") onValueChange(event.currentTarget.value);
      }}
      onPaste={(event) => {
        const replacement = storeQuantityPasteReplacement(
          event.currentTarget,
          event.clipboardData.getData("text/plain"),
          value,
        );
        if (replacement === null) return;
        event.preventDefault();
        onValueChange(replacement);
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
  onPicker: () => void;
  onEdit: (id: string, values: Partial<Pick<Lines[number], "quantity" | "unitPrice">>) => void;
  onRemove: (id: string) => void;
}) {
  const heading = useId();
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);
  const historical = kind === "historical";
  const quotedLines = new Map(quote?.lines.map((line) => [line.product_id, line]));
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
        {showErrors && preview.errors.products && (
          <Text size="sm" c="danger" role="alert">
            {copy.productsRequired}
          </Text>
        )}
        {lines.length > 0 && (
          <Stack component="ul" role="list" gap={0} m={0} p={0} style={{ listStyle: "none" }}>
            {lines.map(({ product, quantity, unitPrice }, index) => {
              const name = storeOrderProductName(product, locale);
              const errors = preview.errors.lines[product.id];
              const quoted = quotedLines.get(product.id);
              const removeLabel = copy.removeProduct.replace("{product}", name);
              return (
                <Box component="li" key={product.id} miw={0}>
                  {index > 0 && <Divider my="md" aria-hidden />}
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start" gap="xs">
                      <Stack gap={2} miw={0} style={{ overflowWrap: "anywhere" }}>
                        <Text fw={600}>{name}</Text>
                        <Text size="sm" c="dimmed">
                          {product.sku} · {product.unit_size}{" "}
                          {locale === "vi" ? product.unit_label_vi : product.unit_label_en}
                        </Text>
                      </Stack>
                      <Stack gap={2} ms="auto" ta="end" maw="100%">
                        <Text size="xs" c="dimmed">
                          {copy.amount}
                        </Text>
                        <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                          {money(quoted?.subtotal_vnd ?? preview.perLine.get(product.id), locale)}
                        </Text>
                      </Stack>
                    </Group>
                    {errors?.product && (
                      <Text size="sm" c="danger" role="alert">
                        {copy.productUnavailable}
                      </Text>
                    )}
                    <Group gap="xs" align="flex-start">
                      <OrderIntegerInput
                        label={c.quantity}
                        aria-label={`${c.quantity} · ${name}`}
                        required
                        value={quantity}
                        disabled={disabled}
                        error={showErrors && errors?.quantity ? copy.quantityError : undefined}
                        style={{ flex: "1 1 6rem", minWidth: 0 }}
                        onValueChange={(quantity) => onEdit(product.id, { quantity })}
                      />
                      {historical ? (
                        <OrderIntegerInput
                          label={copy.unitPrice}
                          aria-label={`${copy.unitPrice} · ${name}`}
                          required
                          value={unitPrice}
                          disabled={disabled}
                          error={showErrors && errors?.unitPrice ? copy.moneyError : undefined}
                          style={{ flex: "1 1 9rem", minWidth: 0 }}
                          onValueChange={(unitPrice) => onEdit(product.id, { unitPrice })}
                        />
                      ) : (
                        <Stack
                          gap={2}
                          style={{ flex: "1 1 9rem", minWidth: 0, overflowWrap: "anywhere" }}
                        >
                          <Text size="sm">{quoted ? copy.unitPrice : copy.referenceUnitPrice}</Text>
                          <Text fw={500}>
                            {money(quoted?.unit_price_vnd ?? product.retail_price_vnd, locale)}
                          </Text>
                        </Stack>
                      )}
                      <Tooltip label={removeLabel}>
                        <ActionIcon
                          mt="lg"
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
                    </Group>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
        {lines.length > 0 && (
          <Group justify="space-between" gap="xs">
            <Text>{c.listedSubtotal}</Text>
            <Text fw={600}>{money(quote?.subtotal_vnd ?? preview.subtotal, locale)}</Text>
          </Group>
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
  onShippingChange,
}: {
  kind: StoreOrderKind;
  rawShipping: string;
  disabled: boolean;
  showErrors: boolean;
  preview: Preview;
  quote?: StoreOrderQuote;
  onShippingChange: (value: string) => void;
}) {
  const heading = useId();
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);
  const historical = kind === "historical";
  return (
    <Paper component="section" aria-labelledby={heading} p="md">
      <Stack gap="sm">
        <Title id={heading} order={2} size="md" fw={600}>
          {c.paymentSummary}
        </Title>
        {historical && (
          <OrderIntegerInput
            label={c.shippingFee}
            required
            value={rawShipping}
            disabled={disabled}
            onValueChange={onShippingChange}
            error={showErrors && preview.errors.shippingFee ? copy.moneyError : undefined}
          />
        )}
        <RecordDetailFields>
          <RecordDetailField label={c.listedSubtotal}>
            {money(quote?.subtotal_vnd ?? preview.subtotal, locale)}
          </RecordDetailField>
          {!historical && (
            <RecordDetailField label={c.shippingFee}>
              {quote ? money(quote.shipping_fee_vnd, locale) : copy.pendingQuote}
            </RecordDetailField>
          )}
          {quote?.shipping_discount_reason && (
            <RecordDetailField label={c.shippingDiscount}>
              {c.shippingDiscountReasons[quote.shipping_discount_reason]}
            </RecordDetailField>
          )}
          <RecordDetailField label={c.total}>
            <Text component="span" fw={700}>
              {money(quote?.total_vnd ?? preview.total, locale)}
            </Text>
          </RecordDetailField>
          <RecordDetailField label={copy.expectedStatus}>
            <StoreOrderStatusBadge
              order={{
                status: historical ? "delivered" : "pending_review",
                workflow_version: 2,
                refund_status: null,
                payment_status: historical
                  ? preview.total === 0n
                    ? "not_required"
                    : "received"
                  : "unconfirmed",
              }}
            />
          </RecordDetailField>
        </RecordDetailFields>
        {showErrors && preview.errors.total && (
          <Text size="sm" c="danger" role="alert">
            {copy.totalError}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
