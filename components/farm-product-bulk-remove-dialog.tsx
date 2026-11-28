"use client";

import { Alert, Anchor, Button, Fieldset, Group, List, Stack, Text } from "@mantine/core";
import type { RefObject } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RecoveryAlert } from "@/components/recovery-alert";
import { parseFarmSourceBlocker } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import type { FarmProduct } from "@/lib/types";
import type { useFarmProductBulkRemove } from "@/lib/use-farm-product-bulk-remove";

type Write = ReturnType<typeof useFarmProductBulkRemove>;

export function FarmProductBulkRemoveDialog({
  products,
  write,
  stale,
  confirmDisabled,
  onCancel,
  onConfirmed,
  returnFocusRef,
  fallbackFocusRef,
}: {
  products: readonly FarmProduct[];
  write: Write;
  stale: boolean;
  confirmDisabled: boolean;
  onCancel: () => void;
  onConfirmed: (count: number) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  fallbackFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { locale } = useAdminI18n();
  const c = farmsCopy(locale);
  const quantity = new Intl.NumberFormat(locale);
  const { failure } = write;
  const unknown = failure?.kind === "unknown";
  const needsReview = (!unknown && Boolean(failure)) || (stale && !write.intent);
  const rejectedItem = failure?.item;
  const rejectedProduct = products.find(
    (product) => product.product_id === rejectedItem?.productId,
  );
  const blocker = parseFarmSourceBlocker(rejectedItem);
  const confirm = !failure
    ? {
        confirmLabel: c.removeProducts,
        busyLabel: c.removingProducts,
        onConfirm: () => {
          if (!confirmDisabled && !stale) void write.submit(products, onConfirmed);
        },
      }
    : {};

  return (
    <ConfirmationDialog
      title={c.removeProducts}
      danger
      busy={write.pending}
      cancelLabel={needsReview ? c.closeAndReview : c.cancel}
      confirmDisabled={confirmDisabled || stale}
      onCancel={onCancel}
      returnFocusRef={returnFocusRef}
      fallbackFocusRef={fallbackFocusRef}
      {...confirm}
    >
      {failure ? null : <Text size="sm">{c.removeProductsBody}</Text>}
      <Text size="sm" fw={600}>
        {products.length === 1
          ? c.selectedOneProduct
          : c.selectedProducts.replace("{count}", quantity.format(products.length))}
      </Text>
      <List spacing="xs" size="sm" style={{ overflowWrap: "anywhere" }}>
        {products.map((product) => (
          <List.Item key={product.id}>
            <Text size="sm">{locale === "vi" ? product.name_vi : product.name_en}</Text>
            <Text size="xs" c="dimmed">
              {product.sku}
            </Text>
          </List.Item>
        ))}
      </List>
      {unknown ? (
        <Fieldset unstyled disabled={write.pending || write.blocked} miw={0}>
          <Stack gap="xs" align="flex-start">
            <RecoveryAlert
              message={failure.receiptNotFound ? c.linkReceiptMissing : c.removeProductsUnconfirmed}
              retryLabel={c.checkLinkReceipt}
              onRetry={() => void write.recover(onConfirmed)}
              loading={write.checking}
            />
            <Button
              type="button"
              variant="default"
              disabled={write.pending || write.blocked}
              loading={write.pending && !write.checking}
              onClick={() => void write.retry(onConfirmed)}
            >
              {c.retryLinkIntent}
            </Button>
          </Stack>
        </Fieldset>
      ) : failure?.kind === "idempotency_conflict" ? (
        <Alert color="danger" role="alert">
          {c.linkKeyConflict}
        </Alert>
      ) : failure ? (
        <Alert color="danger" role="alert">
          <Stack gap="xs">
            <Text size="sm">{c.removeProductsRejected}</Text>
            {rejectedProduct && (
              <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                {locale === "vi" ? rejectedProduct.name_vi : rejectedProduct.name_en} ·{" "}
                {rejectedProduct.sku}
              </Text>
            )}
            {blocker?.code === "farm_product_has_open_allocations" &&
            blocker.context &&
            "orders" in blocker.context ? (
              <>
                <Text size="sm">{c.openAllocations}</Text>
                <Group gap="sm">
                  {blocker.context.orders.map((order) => (
                    <Anchor
                      key={order.id}
                      component={AdminNavigationLink}
                      href={`/store-orders/${order.id}`}
                      size="sm"
                    >
                      {order.reference_code}
                    </Anchor>
                  ))}
                </Group>
                {blocker.context.has_more && <Text size="sm">{c.moreOrders}</Text>}
              </>
            ) : blocker?.code === "farm_product_supply_shortfall" &&
              blocker.context &&
              "required_units" in blocker.context ? (
              <Text size="sm">
                {c.supplyShortfall
                  .replace("{required}", quantity.format(blocker.context.required_units))
                  .replace("{remaining}", quantity.format(blocker.context.remaining_units))
                  .replace("{shortfall}", quantity.format(blocker.context.shortfall_units))}
              </Text>
            ) : (
              <Text size="sm">
                {rejectedItem?.code === "farm_product_has_open_allocations"
                  ? c.openAllocations
                  : rejectedItem?.code === "farm_product_supply_shortfall"
                    ? c.supplyShortfallUnavailable
                    : failure.kind === "conflict"
                      ? c.reviewRemovalSelection
                      : c.actionUnavailable}
              </Text>
            )}
          </Stack>
        </Alert>
      ) : needsReview ? (
        <Alert color="danger" role="alert">
          {c.reviewRemovalSelection}
        </Alert>
      ) : null}
    </ConfirmationDialog>
  );
}
