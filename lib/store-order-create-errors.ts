import type { StoreOrderGuest } from "@/lib/admin-store-order-api";
import {
  apiErrorContext,
  apiErrorFields,
  isApiObject,
  type ClientApiError,
} from "@/lib/client-error";
import type { StoreOrderDraft } from "@/lib/store-order-draft";

type LineFieldIssues = { quantity?: string; unitPrice?: string; product?: string };
const guestFields = [
  "recipient_name",
  "phone_number",
  "province_code",
  "ward_code",
  "address",
] as const;

function hasIssue(issue: unknown): boolean {
  return (
    (typeof issue === "string" && issue.length > 0) ||
    (Array.isArray(issue) && issue.some(hasIssue)) ||
    (isApiObject(issue) && Boolean(issue.code || issue.message))
  );
}

export function storeOrderCreateErrors(
  problem: ClientApiError | undefined,
  productIds: string[],
  invalid: string,
  quantity: string,
  price: string,
  unavailable: string,
  stockChanged: string,
) {
  const fields: Record<string, unknown> =
    problem?.message === "validation_error" || problem?.status === 400
      ? { ...problem.payload, ...apiErrorFields(problem) }
      : {};
  const buyer: Partial<Record<keyof StoreOrderGuest | "user", string>> = {};
  const guest = isApiObject(fields.guest) ? fields.guest : {};
  for (const key of guestFields) {
    if (hasIssue(guest[key]) || hasIssue(fields[key])) buyer[key] = invalid;
  }
  if (hasIssue(fields.buyer_user_id)) buyer.user = invalid;
  const lines: Record<string, LineFieldIssues> = {};
  if (Array.isArray(fields.lines)) {
    fields.lines.forEach((row, index) => {
      const id = productIds[index];
      if (!id || !isApiObject(row)) return;
      const issue: LineFieldIssues = {};
      if (hasIssue(row.quantity)) issue.quantity = quantity;
      if (hasIssue(row.unit_price_vnd)) issue.unitPrice = price;
      if (hasIssue(row.product_id) || hasIssue(row.non_field_errors)) issue.product = unavailable;
      if (Object.keys(issue).length) lines[id] = issue;
    });
  }
  const context = apiErrorContext<unknown>(problem);
  const details = isApiObject(context) ? context : {};
  const unavailableIds = details.product_ids;
  if (problem?.message === "store_product_changed" && Array.isArray(unavailableIds)) {
    for (const id of productIds) {
      if (unavailableIds.includes(id)) lines[id] = { ...lines[id], product: unavailable };
    }
  }
  if (
    problem?.message === "store_stock_changed" &&
    typeof details.product_id === "string" &&
    productIds.includes(details.product_id)
  ) {
    lines[details.product_id] = { ...lines[details.product_id], quantity: stockChanged };
  }
  return {
    buyer,
    lines,
    orderKind: hasIssue(fields.kind),
    date: hasIssue(fields.delivery_date) || problem?.message === "store_delivery_date_invalid",
    shipping: hasIssue(fields.shipping_fee_vnd) ? price : undefined,
    products: hasIssue(fields.lines),
  };
}

export function keepUnchangedOrderErrors(
  errors: ReturnType<typeof storeOrderCreateErrors>,
  submitted: StoreOrderDraft | undefined,
  draft: StoreOrderDraft,
) {
  if (!submitted || submitted === draft) return errors;
  for (const field of guestFields) {
    if (draft.buyerType !== submitted.buyerType || draft.guest[field] !== submitted.guest[field]) {
      delete errors.buyer[field];
    }
  }
  if (draft.buyerType !== submitted.buyerType || draft.userId !== submitted.userId) {
    delete errors.buyer.user;
  }
  const changedKind = draft.kind !== submitted.kind;
  const originalLines = new Map(submitted.lines.map((line) => [line.product.id, line]));
  const currentLines = new Map(draft.lines.map((line) => [line.product.id, line]));
  for (const [id, fields] of Object.entries(errors.lines)) {
    const original = originalLines.get(id);
    const current = currentLines.get(id);
    if (!original || !current || changedKind || current.product !== original.product) {
      delete errors.lines[id];
    } else {
      if (current.quantity !== original.quantity) delete fields.quantity;
      if (current.unitPrice !== original.unitPrice) delete fields.unitPrice;
    }
  }
  if (changedKind) errors.orderKind = false;
  if (changedKind || draft.deliveryDate !== submitted.deliveryDate) errors.date = false;
  if (changedKind || draft.shippingFee !== submitted.shippingFee) errors.shipping = undefined;
  if (draft.lines.length !== submitted.lines.length) errors.products = false;
  return errors;
}
