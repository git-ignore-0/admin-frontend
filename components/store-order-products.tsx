"use client";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Section } from "@/components/nfv-controls";
import { formatAdminDate } from "@/lib/admin-date";
import { formatStoreMoney } from "@/lib/store-orders";
import { storeOrdersCopy, storeRestockUnavailableReason } from "@/lib/store-orders-copy";
import type { StoreOrder, StoreOrderLine } from "@/lib/types";

export function StoreOrderProductSummary({ line }: { line: StoreOrderLine }) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  return (
    <div className="store-order-product-summary">
      <div>
        <strong>{line.name}</strong>
        <span>{line.sku}</span>
        <span>
          {line.unit_size} {line.unit_label} · {c.quantity}: {line.quantity}
        </span>
      </div>
      <div className="store-order-product-price">
        <strong>{formatStoreMoney(line.cash_subtotal_vnd, locale)}</strong>
        {line.quota_units > 0 ? (
          <span>
            {c.quotaCovered}: {line.quota_units}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function StoreOrderProducts({ order }: { order: StoreOrder }) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  return (
    <Section title={c.productsSources}>
      {order.lines.map((line) => (
        <div className="store-allocation-line" key={line.id}>
          <StoreOrderProductSummary line={line} />
          {(order.allocations ?? [])
            .filter((row) => row.line_id === line.id)
            .map((row) => (
              <div className="store-order-source-snapshot" key={row.id}>
                <div>
                  <strong>{row.farm_name}</strong>
                  <span>
                    {formatAdminDate(row.start_date)} – {formatAdminDate(row.end_date)}
                  </span>
                </div>
                <div>
                  {order.status === "cancelled" &&
                  row.restock_remaining_quantity > 0 &&
                  !row.restock_eligible ? (
                    <span>
                      {storeRestockUnavailableReason(row.restock_unavailable_reason, locale)}
                    </span>
                  ) : null}
                  <span>
                    {c.allocatedQuantity}: {row.quantity}
                  </span>
                  <span>
                    {c.restockLedger
                      .replace("{restocked}", String(row.restocked_quantity))
                      .replace("{remaining}", String(row.restock_remaining_quantity))}
                  </span>
                </div>
              </div>
            ))}
        </div>
      ))}
    </Section>
  );
}
