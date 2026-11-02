"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Status } from "@/components/nfv-controls";
import { getStoreOrderDisplayStatus } from "@/lib/store-orders";
import { storeOrderStatusLabel } from "@/lib/store-orders-copy";
import type { StoreOrder } from "@/lib/types";

export function StoreOrderStatusBadge({
  order,
}: {
  order: Pick<StoreOrder, "status" | "payment_status">;
}) {
  const { locale } = useAdminI18n();
  const status = getStoreOrderDisplayStatus(order);
  return (
    <Status
      className="store-order-status"
      status={status}
      label={storeOrderStatusLabel(status, locale)}
    />
  );
}
