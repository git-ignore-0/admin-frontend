"use client";

import { Alert, Box, Divider, Group, Stack, Text } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import {
  StoreOrderAmounts,
  StoreOrderProspectiveStatus,
} from "@/components/store-order-create-products";
import { formatAdminDate } from "@/lib/admin-date";
import type { StoreOrderKind, StoreOrderQuote } from "@/lib/admin-store-order-api";
import { formatDecimalInput } from "@/lib/numeric-input";
import { formatVietnamPhone } from "@/lib/phone-number";
import { storeOrderCreateCopy } from "@/lib/store-order-create-copy";
import { formatStoreMoney } from "@/lib/store-orders";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

export function OrderReviewFields({
  review,
}: {
  review: { quote: StoreOrderQuote; addressChanged: boolean; input: { kind: StoreOrderKind } };
}) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);
  const {
    quote,
    addressChanged,
    input: { kind },
  } = review;
  const address = quote.shipping_address;
  const { provinceName, wardName } = useAdministrativeUnitNames(
    address.province_code,
    address.ward_code,
    locale,
  );
  return (
    <Stack gap="md">
      {addressChanged && (
        <Alert color="warning" role="alert">
          {copy.addressChanged}
        </Alert>
      )}
      <RecordDetailFields>
        <RecordDetailField label={copy.orderType}>
          {kind === "new" ? copy.newOrder : copy.historical}
        </RecordDetailField>
        <RecordDetailField label={c.deliveryDate}>
          {formatAdminDate(quote.delivery_date)}
        </RecordDetailField>
        <RecordDetailField label={c.recipientName}>{address.recipient_name}</RecordDetailField>
        <RecordDetailField label={c.phone}>
          {formatVietnamPhone(address.phone_number)}
        </RecordDetailField>
        <RecordDetailField label={c.address}>
          {[
            address.address,
            wardName ?? address.ward_code,
            provinceName ?? address.province_code,
          ].join(", ")}
        </RecordDetailField>
      </RecordDetailFields>
      <Stack gap="xs" component="ul" role="list" m={0} p={0} style={{ listStyle: "none" }}>
        {quote.lines.map((line, index) => (
          <Box component="li" key={line.product_id} miw={0}>
            {index > 0 && <Divider mb="xs" />}
            <Group justify="space-between" align="flex-start" gap="xs">
              <Stack gap={2} miw={0} style={{ overflowWrap: "anywhere" }}>
                <Text fw={600}>{line.name}</Text>
                <Text size="sm" c="dimmed">
                  {line.sku} · {formatDecimalInput(line.unit_size)} {line.unit_label}
                </Text>
                {line.available_quantity !== null && (
                  <Text size="sm" c="dimmed">
                    {copy.availableQuantity.replace(
                      "{count}",
                      new Intl.NumberFormat(locale).format(line.available_quantity),
                    )}
                  </Text>
                )}
              </Stack>
              <Stack gap={2} ms="auto" ta="end" miw={0} maw="100%">
                <Text fw={600}>{formatStoreMoney(line.subtotal_vnd, locale)}</Text>
                <Text size="sm" c="dimmed">
                  {line.quantity} × {formatStoreMoney(line.unit_price_vnd, locale)}
                </Text>
              </Stack>
            </Group>
          </Box>
        ))}
      </Stack>
      <Stack gap="sm">
        <StoreOrderAmounts
          subtotal={quote.subtotal_vnd}
          shipping={quote.shipping_fee_vnd}
          total={quote.total_vnd}
          authoritative
          shippingDiscountReason={quote.shipping_discount_reason}
        />
        <StoreOrderProspectiveStatus kind={kind} total={quote.total_vnd} />
      </Stack>
    </Stack>
  );
}
