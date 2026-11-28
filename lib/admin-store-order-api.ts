import type { AdminLocale } from "@/lib/admin-i18n";
import { MAX_ORDER_LINES, PROVINCE_CODE, UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { api, apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import { requireCreationReceipt } from "@/lib/creation-receipt";
import { parseNonNegativeBigInteger } from "@/lib/numeric-input";
import { normalizeVietnamPhone } from "@/lib/phone-number";

export { MAX_ORDER_LINES };
export const MAX_ORDER_QUANTITY = 999;
export const MAX_ORDER_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

export type StoreOrderKind = "new" | "historical";

export type StoreOrderGuest = {
  recipient_name: string;
  phone_number: string;
  province_code: string;
  ward_code: string;
  address: string;
};

type StoreOrderLineInput = { product_id: string; quantity: number };
type StoreOrderMoneyInput = string | number;

export type StoreOrderQuoteInput = {
  delivery_date: string;
  locale?: AdminLocale;
  include_line_snapshot: true;
} & ({ buyer_user_id: string; guest?: never } | { buyer_user_id?: never; guest: StoreOrderGuest }) &
  (
    | {
        kind: "new";
        lines: (StoreOrderLineInput & { unit_price_vnd?: never })[];
        shipping_fee_vnd?: never;
      }
    | {
        kind: "historical";
        lines: (StoreOrderLineInput & { unit_price_vnd: StoreOrderMoneyInput })[];
        shipping_fee_vnd: StoreOrderMoneyInput;
      }
  );

export type StoreOrderCreateInput = StoreOrderQuoteInput & {
  confirmation: string;
  idempotency_key: string;
};

type StoreOrderQuoteLine = StoreOrderLineInput & {
  name: string;
  sku: string;
  unit_size: string;
  unit_label: string;
  unit_price_vnd: string;
  subtotal_vnd: string;
  available_quantity: number | null;
};

export type StoreOrderQuote = {
  delivery_date: string;
  shipping_address: StoreOrderGuest;
  shipping_address_version: string | null;
  shipping_discount_reason: "csa_companion_delivery" | null;
  subtotal_vnd: string;
  shipping_fee_vnd: string;
  total_vnd: string;
  lines: StoreOrderQuoteLine[];
  confirmation: string;
};

const storeOrdersPath = "admin/store-orders";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATH_SEGMENT.test(value);
}

function isHexDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isShippingAddress(value: unknown): value is StoreOrderGuest {
  return (
    isApiObject(value) &&
    Object.keys(value).length === 5 &&
    typeof value.recipient_name === "string" &&
    Boolean(value.recipient_name.trim()) &&
    typeof value.phone_number === "string" &&
    normalizeVietnamPhone(value.phone_number) === value.phone_number &&
    typeof value.province_code === "string" &&
    PROVINCE_CODE.test(value.province_code) &&
    typeof value.ward_code === "string" &&
    /^[0-9]{5}$/u.test(value.ward_code) &&
    typeof value.address === "string" &&
    Boolean(value.address.trim())
  );
}

function matchesGuestAddress(actual: StoreOrderGuest, requested: StoreOrderGuest) {
  return (
    actual.recipient_name === requested.recipient_name.trim() &&
    actual.phone_number === normalizeVietnamPhone(requested.phone_number) &&
    actual.province_code === requested.province_code.trim() &&
    actual.ward_code === requested.ward_code.trim() &&
    actual.address === requested.address.trim()
  );
}

function requireQuoteAmount(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,15})$/u.test(value) ||
    BigInt(value) > MAX_ORDER_AMOUNT
  ) {
    throw invalidApiResponse();
  }
  return value;
}

function matchesRequestedAmount(response: string, requested: StoreOrderMoneyInput) {
  const parsed = parseNonNegativeBigInteger(String(requested)).value;
  return parsed !== undefined && BigInt(response) === parsed;
}

function requireQuoteLine(value: unknown, requested: StoreOrderQuoteInput["lines"][number]) {
  if (!isApiObject(value) || Object.keys(value).length !== 9) throw invalidApiResponse();
  const { product_id, quantity, available_quantity, name, sku, unit_size, unit_label } = value;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof sku !== "string" ||
    !sku.trim() ||
    typeof unit_size !== "string" ||
    !/^\d+\.\d{3}$/u.test(unit_size) ||
    typeof unit_label !== "string" ||
    !unit_label.trim() ||
    !isUuid(product_id) ||
    product_id.toLowerCase() !== requested.product_id.toLowerCase() ||
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_ORDER_QUANTITY ||
    quantity !== requested.quantity
  ) {
    throw invalidApiResponse();
  }
  const unit_price_vnd = requireQuoteAmount(value.unit_price_vnd);
  const subtotal_vnd = requireQuoteAmount(value.subtotal_vnd);
  if (BigInt(unit_price_vnd) * BigInt(quantity) !== BigInt(subtotal_vnd))
    throw invalidApiResponse();
  if (requested.unit_price_vnd !== undefined) {
    if (
      available_quantity !== null ||
      !matchesRequestedAmount(unit_price_vnd, requested.unit_price_vnd)
    ) {
      throw invalidApiResponse();
    }
  } else if (
    typeof available_quantity !== "number" ||
    !Number.isSafeInteger(available_quantity) ||
    available_quantity < quantity
  ) {
    throw invalidApiResponse();
  }
  return {
    product_id,
    name,
    sku,
    unit_size,
    unit_label,
    quantity,
    unit_price_vnd,
    subtotal_vnd,
    available_quantity,
  } satisfies StoreOrderQuoteLine;
}

function requireQuote(value: unknown, requested: StoreOrderQuoteInput): StoreOrderQuote {
  if (!isApiObject(value) || Object.keys(value).length !== 9) throw invalidApiResponse();
  const {
    delivery_date,
    shipping_address,
    shipping_address_version,
    shipping_discount_reason,
    confirmation,
  } = value;
  const hasBuyerAccount = requested.buyer_user_id !== undefined;
  if (
    typeof delivery_date !== "string" ||
    delivery_date !== requested.delivery_date ||
    !isShippingAddress(shipping_address) ||
    (requested.guest !== undefined && !matchesGuestAddress(shipping_address, requested.guest)) ||
    (shipping_address_version !== null && !isHexDigest(shipping_address_version)) ||
    (shipping_address_version !== null) !== hasBuyerAccount ||
    (shipping_discount_reason !== null && shipping_discount_reason !== "csa_companion_delivery") ||
    !isHexDigest(confirmation) ||
    !Array.isArray(value.lines) ||
    value.lines.length !== requested.lines.length ||
    value.lines.length < 1 ||
    value.lines.length > MAX_ORDER_LINES
  ) {
    throw invalidApiResponse();
  }
  const subtotal_vnd = requireQuoteAmount(value.subtotal_vnd);
  const shipping_fee_vnd = requireQuoteAmount(value.shipping_fee_vnd);
  const total_vnd = requireQuoteAmount(value.total_vnd);
  if (
    (requested.kind === "historical" &&
      !matchesRequestedAmount(shipping_fee_vnd, requested.shipping_fee_vnd)) ||
    (shipping_discount_reason !== null &&
      (requested.kind !== "new" || !hasBuyerAccount || shipping_fee_vnd !== "0"))
  ) {
    throw invalidApiResponse();
  }
  const lines = value.lines.map((line, index) => requireQuoteLine(line, requested.lines[index]));
  const distinctProducts = new Set(lines.map(({ product_id }) => product_id.toLowerCase()));
  const subtotal = lines.reduce((sum, line) => sum + BigInt(line.subtotal_vnd), 0n);
  if (
    distinctProducts.size !== lines.length ||
    BigInt(subtotal_vnd) !== subtotal ||
    BigInt(total_vnd) !== subtotal + BigInt(shipping_fee_vnd)
  ) {
    throw invalidApiResponse();
  }
  return {
    delivery_date,
    shipping_address,
    shipping_address_version,
    shipping_discount_reason,
    subtotal_vnd,
    shipping_fee_vnd,
    total_vnd,
    lines,
    confirmation,
  };
}

export async function quoteAdminStoreOrder(payload: StoreOrderQuoteInput, signal?: AbortSignal) {
  const quote = await api<unknown>(`${storeOrdersPath}/quote`, {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
  return requireQuote(quote, payload);
}

function orderFromReceipt(data: unknown, meta: unknown, key: string) {
  const id = requireCreationReceipt(meta, key, "create_store_order");
  if (isApiObject(data) && isUuid(data.id) && data.id.toLowerCase() !== id.toLowerCase()) {
    throw invalidApiResponse();
  }
  // The detail route reloads the order using the confirmed resource ID.
  return { id };
}

export async function createAdminStoreOrder(
  payload: StoreOrderCreateInput,
  shouldRedirectToLogin?: () => boolean,
) {
  const { data, meta } = await apiEnvelope<unknown>(
    storeOrdersPath,
    { method: "POST", body: JSON.stringify(payload) },
    { allowMissingData: true, shouldRedirectToLogin },
  );
  return orderFromReceipt(data, meta, payload.idempotency_key);
}

type StoreOrderCreationResolution = { id: string } | { closed: true };

function resolutionFromReceipt(
  data: unknown,
  meta: unknown,
  key: string,
): StoreOrderCreationResolution {
  if (isApiObject(data) && data.closed === true) {
    const receipt = isApiObject(meta) ? meta.action_receipt : undefined;
    if (
      !isApiObject(receipt) ||
      receipt.action !== "create_store_order" ||
      !isUuid(receipt.idempotency_key) ||
      receipt.idempotency_key.toLowerCase() !== key.toLowerCase() ||
      receipt.resource_id !== null
    )
      throw invalidApiResponse();
    return { closed: true };
  }
  return orderFromReceipt(data, meta, key);
}

export async function closeAdminStoreOrderCreation(
  key: string,
  shouldRedirectToLogin?: () => boolean,
) {
  if (!isUuid(key)) throw invalidApiResponse();
  const { data, meta } = await apiEnvelope<unknown>(
    `${storeOrdersPath}/close-creation`,
    { method: "POST", body: JSON.stringify({ idempotency_key: key }) },
    { allowMissingData: true, shouldRedirectToLogin },
  );
  return resolutionFromReceipt(data, meta, key);
}

export async function recoverAdminStoreOrder(
  key: string,
  signal?: AbortSignal,
  shouldRedirectToLogin?: () => boolean,
) {
  if (!isUuid(key)) throw invalidApiResponse();
  const query = new URLSearchParams({ creation_key: key });
  const { data, meta } = await apiEnvelope<unknown>(
    `${storeOrdersPath}?${query}`,
    { signal },
    { allowMissingData: true, shouldRedirectToLogin },
  );
  return resolutionFromReceipt(data, meta, key);
}
