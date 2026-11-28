import type { StoreOrderGuest } from "@/lib/admin-store-order-api";
import {
  apiErrorContext,
  apiErrorFields,
  isApiObject,
  type ClientApiError,
} from "@/lib/client-error";

type LineFieldIssues = { quantity?: string; unitPrice?: string; product?: string };

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
  for (const key of [
    "recipient_name",
    "phone_number",
    "province_code",
    "ward_code",
    "address",
  ] as const) {
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
  const context = apiErrorContext<{ product_id?: unknown }>(problem);
  if (
    problem?.message === "store_stock_changed" &&
    typeof context?.product_id === "string" &&
    productIds.includes(context.product_id)
  ) {
    lines[context.product_id] = { quantity: stockChanged };
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
