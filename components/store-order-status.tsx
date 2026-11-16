"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Status } from "@/components/nfv-controls";
import { getStoreOrderDisplayStatus } from "@/lib/store-orders";
import { storeOrderStatusLabel, storeRefundStatusLabel } from "@/lib/store-orders-copy";
import type { StoreOrder } from "@/lib/types";

export function StoreOrderStatusBadge({
  order,
}: {
  order: Pick<
    StoreOrder,
    "status" | "workflow_version" | "refund_status" | "csa" | "payment_status"
  >;
}) {
  const { locale } = useAdminI18n();
  const status = getStoreOrderDisplayStatus(order);
  return (
    <span className="store-order-status-group">
      <Status
        className="store-order-status"
        status={status === "payment_review" ? "pending_review" : status}
        label={storeOrderStatusLabel(status, locale, order)}
      />
      {order.status === "cancelled" && order.refund_status ? (
        <Status
          className="store-order-refund-status"
          status={order.refund_status === "pending" ? "refund_required" : "refunded"}
          label={storeRefundStatusLabel(order.refund_status, locale, order)}
        />
      ) : null}
    </span>
  );
}
