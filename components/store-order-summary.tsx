import { useAdminI18n } from "@/components/admin-i18n-provider";
import { formatStoreMoney } from "@/lib/store-orders";
import { storeOrdersCopy } from "@/lib/store-orders-copy";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";
import type { StoreOrder } from "@/lib/types";

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

export function StoreOrderTotals({ order }: { order: StoreOrder }) {
  const { locale } = useAdminI18n();
  const c = storeOrdersCopy(locale);
  const rows = [
    [c.listedSubtotal, listedSubtotal(order)],
    [c.shippingFee, order.shipping_fee_vnd],
  ] as const;
  return (
    <dl className="store-order-totals">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{formatStoreMoney(value, locale)}</dd>
        </div>
      ))}
      {BigInt(quotaCovered(order)) > 0n ? (
        <div>
          <dt>{c.quotaCovered}</dt>
          <dd>−{formatStoreMoney(quotaCovered(order), locale)}</dd>
        </div>
      ) : null}
      <div className="store-order-total-due">
        <dt>{c.total}</dt>
        <dd>{formatStoreMoney(order.total_vnd, locale)}</dd>
      </div>
    </dl>
  );
}

export function StoreRecipientSummary({ order }: { order: StoreOrder }) {
  const { locale } = useAdminI18n();
  const { provinceName, wardName } = useAdministrativeUnitNames(
    order.shipping_address.province_code,
    order.shipping_address.ward_code,
    locale,
  );
  return (
    <div className="store-order-recipient">
      <div className="store-order-recipient-contact">
        <strong>{order.shipping_address.recipient_name}</strong>
        <a href={`tel:${order.shipping_address.phone_number}`}>
          {order.shipping_address.phone_number}
        </a>
      </div>
      <p>
        {order.shipping_address.address} · {wardName || order.shipping_address.ward_code} ·{" "}
        {provinceName || order.shipping_address.province_code}
      </p>
    </div>
  );
}
