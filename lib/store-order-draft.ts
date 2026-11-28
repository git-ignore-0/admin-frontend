import { adminDateInputToIso, adminTodayIso } from "@/lib/admin-date";
import type { AdminLocale } from "@/lib/admin-i18n";
import {
  MAX_ORDER_AMOUNT,
  MAX_ORDER_LINES,
  MAX_ORDER_QUANTITY,
  type StoreOrderGuest,
  type StoreOrderKind,
  type StoreOrderQuoteInput,
} from "@/lib/admin-store-order-api";
import { normalizeVietnamPhone } from "@/lib/phone-number";
import {
  parseNonNegativeBigInteger,
  parsePositiveBigInteger,
  parsePositiveInteger,
} from "@/lib/numeric-input";
import type { StoreProduct } from "@/lib/types";

export { MAX_ORDER_AMOUNT, MAX_ORDER_LINES, MAX_ORDER_QUANTITY };
// Public catalog's price ceiling also applies to active legacy products in Admin.
const MAX_PUBLIC_CATALOG_PRICE = 1_000_000_000n;
export type OrderBuyerType = "user" | "guest";
type DraftProduct = Pick<StoreProduct, "id" | "status" | "retail_price_vnd">;

export type StoreOrderDraft<P extends DraftProduct = DraftProduct> = {
  kind: StoreOrderKind;
  deliveryDate: string;
  buyerType: OrderBuyerType;
  userId: string | null;
  guest: StoreOrderGuest;
  lines: { product: P; quantity: string; unitPrice: string }[];
  shippingFee: string;
};

export function blankStoreOrderDraft<P extends DraftProduct = DraftProduct>(): StoreOrderDraft<P> {
  return {
    kind: "new",
    deliveryDate: "",
    buyerType: "user",
    userId: null,
    guest: { recipient_name: "", phone_number: "", province_code: "", ward_code: "", address: "" },
    lines: [],
    shippingFee: "",
  };
}

export function storeOrderDateRange(kind: StoreOrderKind, now = new Date()) {
  const today = adminTodayIso(now);
  const edge = new Date(`${today}T00:00:00Z`);
  edge.setUTCDate(edge.getUTCDate() + (kind === "new" ? 7 : -1));
  const max = edge.toISOString().slice(0, 10);
  return kind === "new" ? { min: today, max } : { max };
}

export function validStoreOrderDate(value: string, range: ReturnType<typeof storeOrderDateRange>) {
  const day = adminDateInputToIso(value);
  return day && (!range.min || day >= range.min) && day <= range.max ? day : null;
}

export function isStoreOrderProductSelectable(product: DraftProduct, kind: StoreOrderKind) {
  if (kind === "historical") {
    return product.status === "active" || product.status === "discontinued";
  }
  const price = parsePositiveBigInteger(product.retail_price_vnd).value;
  return product.status === "active" && price !== undefined && price <= MAX_PUBLIC_CATALOG_PRICE;
}

type GuestIssues = Partial<Record<keyof StoreOrderGuest, "required" | "invalid">>;
type LineIssues = { quantity?: boolean; unitPrice?: boolean; product?: boolean };
type DraftIssues = {
  deliveryDate?: boolean;
  products?: boolean;
  user?: boolean;
  shippingFee?: boolean;
  total?: boolean;
  guest: GuestIssues;
  lines: Record<string, LineIssues>;
};

function guestPayload(draft: StoreOrderGuest, errors: GuestIssues): StoreOrderGuest | null {
  const guest = {
    recipient_name: draft.recipient_name.trim(),
    phone_number: normalizeVietnamPhone(draft.phone_number) ?? "",
    province_code: draft.province_code,
    ward_code: draft.ward_code,
    address: draft.address.trim(),
  };
  for (const key of [
    "recipient_name",
    "phone_number",
    "province_code",
    "ward_code",
    "address",
  ] as const) {
    if (!draft[key].trim()) errors[key] = "required";
  }
  if (draft.phone_number && !guest.phone_number) errors.phone_number = "invalid";
  if (Array.from(guest.recipient_name).length > 200) errors.recipient_name = "invalid";
  if (!/^\d{2}$/.test(guest.province_code) && guest.province_code) errors.province_code = "invalid";
  if (!/^\d{5}$/.test(guest.ward_code) && guest.ward_code) errors.ward_code = "invalid";
  if (Array.from(guest.address).length > 500) errors.address = "invalid";
  return Object.keys(errors).length ? null : guest;
}

function parsedAmount(raw: string) {
  const parsed = parseNonNegativeBigInteger(raw);
  return parsed.value !== undefined && parsed.value <= MAX_ORDER_AMOUNT ? parsed.value : null;
}

export function validateStoreOrderDraft(
  draft: StoreOrderDraft,
  locale: AdminLocale,
  now = new Date(),
) {
  const errors: DraftIssues = { guest: {}, lines: {} };
  const deliveryDate = validStoreOrderDate(
    draft.deliveryDate,
    storeOrderDateRange(draft.kind, now),
  );
  if (!deliveryDate) errors.deliveryDate = true;

  const historical = draft.kind === "historical";
  const guest = draft.buyerType === "guest" ? guestPayload(draft.guest, errors.guest) : null;
  const buyer = guest
    ? { guest }
    : draft.buyerType === "user" && draft.userId
      ? { buyer_user_id: draft.userId }
      : null;
  if (draft.buyerType === "user" && !buyer) errors.user = true;

  if (
    !draft.lines.length ||
    draft.lines.length > MAX_ORDER_LINES ||
    new Set(draft.lines.map((line) => line.product.id)).size !== draft.lines.length
  )
    errors.products = true;

  const perLine = new Map<string, bigint | null>();
  const lines = [];
  const historicalLines = [];
  for (const { product, quantity, unitPrice } of draft.lines) {
    const issue: LineIssues = {};
    const count = parsePositiveInteger(quantity, { max: MAX_ORDER_QUANTITY }).value;
    const amount = parsedAmount(historical ? unitPrice : product.retail_price_vnd);
    if (count === undefined) issue.quantity = true;
    if (amount === null && historical) issue.unitPrice = true;
    if (!isStoreOrderProductSelectable(product, draft.kind)) issue.product = true;
    if (Object.keys(issue).length) errors.lines[product.id] = issue;
    const subtotal = count !== undefined && amount !== null ? BigInt(count) * amount : null;
    perLine.set(product.id, subtotal);
    if (count !== undefined) {
      lines.push({ product_id: product.id, quantity: count });
      if (amount !== null)
        historicalLines.push({
          product_id: product.id,
          quantity: count,
          unit_price_vnd: amount.toString(),
        });
    }
  }

  let subtotal: bigint | null = draft.lines.length ? 0n : null;
  for (const amount of perLine.values())
    subtotal = subtotal === null || amount === null ? null : subtotal + amount;
  const fee = historical ? parsedAmount(draft.shippingFee) : null;
  if (historical && fee === null) errors.shippingFee = true;
  const total = fee === null || subtotal === null ? null : subtotal + fee;
  if (
    (subtotal !== null && subtotal > MAX_ORDER_AMOUNT) ||
    (total !== null && total > MAX_ORDER_AMOUNT)
  )
    errors.total = true;

  let input: StoreOrderQuoteInput | null = null;
  if (
    deliveryDate &&
    buyer &&
    !errors.products &&
    !errors.total &&
    Object.keys(errors.lines).length === 0
  ) {
    const common = { ...buyer, delivery_date: deliveryDate, locale };
    if (!historical) input = { ...common, kind: "new", lines };
    else if (fee !== null) {
      input = {
        ...common,
        kind: "historical",
        lines: historicalLines,
        shipping_fee_vnd: fee.toString(),
      };
    }
  }
  return { input, errors, perLine, subtotal, fee, total };
}

export function storeOrderProductName(
  product: Pick<StoreProduct, "sku" | "translations">,
  locale: AdminLocale,
) {
  return (
    product.translations.find((entry) => entry.locale === locale)?.name.trim() ||
    product.translations.find((entry) => entry.name.trim())?.name.trim() ||
    product.sku
  );
}
