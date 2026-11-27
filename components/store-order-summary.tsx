import { Anchor, Box, Divider, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useId, type ReactNode } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { Status } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { formatVietnamPhone } from "@/lib/phone-number";
import {
  formatStoreDeliveryDate,
  formatStoreMoney,
  formatStoreShippingBenefitDate,
} from "@/lib/store-orders";
import { storeOrdersCopy, storeShippingDiscountReason } from "@/lib/store-orders-copy";
import type { StoreOrder, StorePaymentStatus } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

const paymentStatusColors = {
  not_required: "neutral",
  unconfirmed: "pending",
  received: "success",
  refund_required: "warning",
  refunded: "success",
} satisfies Record<StorePaymentStatus, string>;

function listedSubtotal(order: StoreOrder) {
  return order.lines
    .reduce((total, line) => total + BigInt(line.unit_price_vnd) * BigInt(line.quantity), 0n)
    .toString();
}

function quotaCovered(order: StoreOrder) {
  return order.lines
    .reduce((total, line) => total + BigInt(line.unit_price_vnd) * BigInt(line.quota_quantity), 0n)
    .toString();
}

function PaymentRow({
  label,
  children,
  emphasis = false,
}: {
  label: string;
  children: ReactNode;
  emphasis?: boolean;
}) {
  const weight = emphasis ? 600 : undefined;
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
      <Text component="dt" size="sm" c={emphasis ? undefined : "dimmed"} fw={weight}>
        {label}
      </Text>
      <Text component="dd" m={0} miw={0} ta="end" fw={weight} style={{ overflowWrap: "anywhere" }}>
        {children}
      </Text>
    </Group>
  );
}

function StoreOrderTotals({ order }: { order: StoreOrder }) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const covered = quotaCovered(order);
  const voucherCode = order.coupon?.code;
  const discount = order.discount_amount_vnd ?? "0";
  const hasVoucher = Boolean(voucherCode) || BigInt(discount) > 0n;
  const shippingBenefit =
    order.shipping_discount_reason === "csa_companion_delivery" && order.shipping_benefit;

  return (
    <>
      <Box component="dl" m={0}>
        <RecordDetailField label={c.paymentStatus}>
          <Status
            status={order.payment_status}
            color={paymentStatusColors[order.payment_status]}
            label={c.paymentStatuses[order.payment_status]}
          />
        </RecordDetailField>
      </Box>
      <Stack component="dl" m={0} gap="xs">
        <PaymentRow label={c.listedSubtotal}>
          {formatStoreMoney(listedSubtotal(order), locale)}
        </PaymentRow>
        {BigInt(covered) > 0n && (
          <PaymentRow label={c.quotaCovered}>−{formatStoreMoney(covered, locale)}</PaymentRow>
        )}
        {hasVoucher && (
          <>
            <PaymentRow label={c.cashSubtotalBeforeDiscount}>
              {formatStoreMoney(order.subtotal_vnd, locale)}
            </PaymentRow>
            {voucherCode && <PaymentRow label={c.voucherCode}>{voucherCode}</PaymentRow>}
            <PaymentRow label={c.voucherDiscount}>−{formatStoreMoney(discount, locale)}</PaymentRow>
          </>
        )}
        <PaymentRow label={c.shippingFee}>
          {formatStoreMoney(order.shipping_fee_vnd, locale)}
        </PaymentRow>
      </Stack>
      {order.shipping_discount_reason && (
        <Box component="dl" m={0}>
          <RecordDetailField label={c.shippingDiscount}>
            <Stack gap="xs">
              <Text>{storeShippingDiscountReason(order.shipping_discount_reason, locale)}</Text>
              {shippingBenefit && (
                <Group gap="sm">
                  <Anchor
                    component={AdminNavigationLink}
                    href={`/csa-rounds/${shippingBenefit.round_id}`}
                    size="sm"
                    title={formatStoreShippingBenefitDate(order)}
                  >
                    {c.sourceRound}
                  </Anchor>
                  <Anchor
                    component={AdminNavigationLink}
                    href={`/store-orders/${shippingBenefit.csa_order_id}`}
                    size="sm"
                  >
                    {c.sourceOrder}
                  </Anchor>
                </Group>
              )}
            </Stack>
          </RecordDetailField>
        </Box>
      )}
      <Divider />
      <Box component="dl" m={0}>
        <PaymentRow label={c.total} emphasis>
          {formatStoreMoney(order.total_vnd, locale)}
        </PaymentRow>
      </Box>
    </>
  );
}

function StoreRecipientSummary({ order }: { order: StoreOrder }) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const address = order.shipping_address;
  const { provinceName, wardName } = useAdministrativeUnitNames(
    address.province_code,
    address.ward_code,
    locale,
  );
  return (
    <RecordDetailFields>
      <RecordDetailField label={c.recipientName}>{address.recipient_name}</RecordDetailField>
      <RecordDetailField label={c.phone}>
        {address.phone_number && (
          <Anchor href={`tel:${address.phone_number}`}>
            {formatVietnamPhone(address.phone_number)}
          </Anchor>
        )}
      </RecordDetailField>
      <RecordDetailField label={c.address}>{address.address}</RecordDetailField>
      <RecordDetailField label={c.ward}>{wardName || address.ward_code}</RecordDetailField>
      <RecordDetailField label={c.province}>
        {provinceName || address.province_code}
      </RecordDetailField>
      {!order.csa && (
        <RecordDetailField label={c.deliveryDate}>
          {order.delivery_date ? (
            <time dateTime={order.delivery_date}>{formatStoreDeliveryDate(order)}</time>
          ) : (
            formatStoreDeliveryDate(order)
          )}
        </RecordDetailField>
      )}
    </RecordDetailFields>
  );
}

export function StoreOrderSummary({ order }: { order: StoreOrder }) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const headingId = useId();
  const { payment } = order;

  return (
    <Paper component="aside" aria-labelledby={headingId} p="md" miw={0}>
      <Stack gap="md">
        <Stack gap="sm">
          <Title id={headingId} order={2} size="md" fw={600}>
            {c.paymentSummary}
          </Title>
          <StoreOrderTotals order={order} />
        </Stack>
        <Divider />
        <Stack gap="sm">
          <Title order={2} size="md" fw={600}>
            {c.recipientTitle}
          </Title>
          <StoreRecipientSummary order={order} />
        </Stack>
        {payment && (
          <>
            <Divider />
            <Stack gap="sm">
              <Title order={2} size="md" fw={600}>
                {c.transferTitle}
              </Title>
              <RecordDetailFields>
                <RecordDetailField label={c.bank}>{payment.bank_name}</RecordDetailField>
                <RecordDetailField label={c.bankBin}>{payment.bank_bin}</RecordDetailField>
                <RecordDetailField label={c.account}>{payment.account_number}</RecordDetailField>
                <RecordDetailField label={c.accountName}>{payment.account_name}</RecordDetailField>
                <RecordDetailField label={c.transferContent}>
                  {payment.transfer_content}
                </RecordDetailField>
              </RecordDetailFields>
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}
