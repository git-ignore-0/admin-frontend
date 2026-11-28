"use client";

import { Alert, Box, Group, Stack, Text } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { formatAdminDate } from "@/lib/admin-date";
import type { StoreOrderQuote } from "@/lib/admin-store-order-api";
import { formatVietnamPhone } from "@/lib/phone-number";
import { storeOrderCreateCopy } from "@/lib/store-order-create-copy";
import { storeOrderProductName, type StoreOrderDraft } from "@/lib/store-order-draft";
import { formatStoreMoney } from "@/lib/store-orders";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import type { StoreProduct } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

export function OrderReviewFields({
  review,
  products,
}: {
  review: { quote: StoreOrderQuote; addressChanged: boolean };
  products: StoreOrderDraft<StoreProduct>["lines"];
}) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const copy = storeOrderCreateCopy(locale);
  const { quote, addressChanged } = review;
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
          <Box component="li" key={line.product_id}>
            <Group justify="space-between" align="flex-start" gap="xs">
              <Stack gap={2} miw={0} style={{ overflowWrap: "anywhere" }}>
                <Text fw={600}>{storeOrderProductName(products[index].product, locale)}</Text>
                <Text size="sm" c="dimmed">
                  {line.quantity} × {formatStoreMoney(line.unit_price_vnd, locale)}
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
              <Text fw={600}>{formatStoreMoney(line.subtotal_vnd, locale)}</Text>
            </Group>
          </Box>
        ))}
      </Stack>
      <RecordDetailFields>
        <RecordDetailField label={c.listedSubtotal}>
          {formatStoreMoney(quote.subtotal_vnd, locale)}
        </RecordDetailField>
        <RecordDetailField label={c.shippingFee}>
          {formatStoreMoney(quote.shipping_fee_vnd, locale)}
        </RecordDetailField>
        {quote.shipping_discount_reason && (
          <RecordDetailField label={c.shippingDiscount}>
            {c.shippingDiscountReasons[quote.shipping_discount_reason]}
          </RecordDetailField>
        )}
        <RecordDetailField label={c.total}>
          <Text component="span" fw={700}>
            {formatStoreMoney(quote.total_vnd, locale)}
          </Text>
        </RecordDetailField>
      </RecordDetailFields>
    </Stack>
  );
}
