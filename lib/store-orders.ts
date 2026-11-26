import { formatAdminDate } from "@/lib/admin-date";
import { requirePaginatedList } from "@/lib/api-response";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { api, apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import { csaRoundStatuses } from "@/lib/csa-rounds";
import type {
  PaginationMeta,
  StoreOrder,
  StoreOrderAction,
  StoreOrderAllocationDraft,
  StoreOrderSort,
  StoreOrderStatus,
  StorePaymentStatus,
} from "@/lib/types";
import type { AdminLocale } from "@/lib/admin-i18n";

export type StoreOrderQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: StoreOrderStatus | "";
  paymentStatus?: StorePaymentStatus | "";
  sort?: StoreOrderSort;
};

export const storeOrderDisplayStatuses = [
  "pending_review",
  "payment_pending",
  "payment_review",
  "pending_delivery",
  "delivered",
  "cancelled",
] as const;

export type StoreOrderDisplayStatus = (typeof storeOrderDisplayStatuses)[number];

export function getStoreOrderDisplayStatus(
  order: Pick<StoreOrder, "status">,
): StoreOrderDisplayStatus {
  return order.status;
}

export function storeOrderStatusQuery(
  status: StoreOrderDisplayStatus | "",
): Pick<StoreOrderQuery, "status"> {
  return { status };
}

export function storeOrderHasDeadline(order: Pick<StoreOrder, "status" | "expires_at">) {
  return (
    Boolean(order.expires_at) &&
    ["pending_review", "payment_pending", "payment_review"].includes(order.status)
  );
}

export function buildStoreOrderQuery(query: StoreOrderQuery) {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    page_size: String(query.pageSize ?? 20),
  });
  const search = query.search?.trim();
  if (search) params.set("search", search);
  if (query.status) params.set("status", query.status);
  if (query.paymentStatus) params.set("payment_status", query.paymentStatus);
  if (query.sort) params.set("sort", query.sort);
  return params.toString();
}

const paymentStatuses = ["not_required", "unconfirmed", "received", "refund_required", "refunded"];
const selectionStates = [
  "selecting",
  "locked",
  "reselecting",
  "confirmed",
  "cancelled",
  "delivered",
];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATH_SEGMENT.test(value);
}

function hasStoreOrderSummary(order: StoreOrder) {
  return (
    isApiObject(order) &&
    typeof order.id === "string" &&
    typeof order.reference_code === "string" &&
    storeOrderDisplayStatuses.includes(order.status) &&
    paymentStatuses.includes(order.payment_status) &&
    typeof order.total_vnd === "string" &&
    typeof order.created_at === "string" &&
    typeof order.server_time === "string" &&
    (order.expires_at === null || typeof order.expires_at === "string") &&
    isApiObject(order.shipping_address) &&
    typeof order.shipping_address.recipient_name === "string" &&
    typeof order.shipping_address.phone_number === "string" &&
    (order.csa === undefined || (isApiObject(order.csa) && isApiObject(order.csa.round)))
  );
}

export async function listStoreOrders(query: StoreOrderQuery = {}) {
  const payload = await apiEnvelope<StoreOrder[], PaginationMeta>(
    `admin/store-orders?${buildStoreOrderQuery(query)}`,
  ).then(requirePaginatedList);
  if (!payload.data.every(hasStoreOrderSummary)) throw invalidApiResponse();
  return payload;
}

function stringFields(value: Record<string, unknown>, fields: string[]) {
  return fields.every((field) => typeof value[field] === "string");
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function optionalText(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isVnd(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/u.test(value);
}

function hasOrderLine(value: unknown): value is StoreOrder["lines"][number] {
  return (
    isApiObject(value) &&
    isUuid(value.id) &&
    isUuid(value.product_id) &&
    stringFields(value, [
      "sku",
      "name",
      "unit_size",
      "unit_label",
      "unit_price_vnd",
      "cash_subtotal_vnd",
    ]) &&
    count(value.quantity) &&
    value.quantity > 0 &&
    count(value.quota_quantity) &&
    count(value.cash_quantity) &&
    (value.quota_group_id === null || isUuid(value.quota_group_id)) &&
    (value.quota_cost === null ||
      (typeof value.quota_cost === "number" && Number.isFinite(value.quota_cost))) &&
    typeof value.quota_units === "number" &&
    Number.isFinite(value.quota_units)
  );
}

function hasOrderCSA(value: unknown, orderId: string) {
  if (!isApiObject(value) || !isApiObject(value.round) || !isApiObject(value.selection))
    return false;
  const { round, selection } = value;
  return (
    isUuid(round.id) &&
    stringFields(round, ["name", "opens_at", "closes_at", "delivery_date", "server_time"]) &&
    csaRoundStatuses.some((status) => status === round.status) &&
    isUuid(selection.id) &&
    isUuid(selection.membership_id) &&
    isUuid(selection.round_id) &&
    selection.round_id.toLowerCase() === round.id.toLowerCase() &&
    isUuid(selection.order_id) &&
    selection.order_id.toLowerCase() === orderId &&
    selectionStates.some((status) => status === selection.state) &&
    count(selection.revision) &&
    optionalText(selection.reopen_until) &&
    typeof selection.server_time === "string" &&
    Array.isArray(selection.lines) &&
    selection.lines.every(
      (line: unknown) =>
        isApiObject(line) &&
        isUuid(line.product_id) &&
        count(line.quantity) &&
        line.quantity > 0 &&
        stringFields(line, ["name", "unit_size", "unit_label", "quota_cost"]),
    )
  );
}

function requireStoreOrderDetail(order: StoreOrder, orderId: string): StoreOrder {
  if (
    !hasStoreOrderSummary(order) ||
    !isUuid(order.id) ||
    order.id.toLowerCase() !== orderId ||
    (order.workflow_version !== 1 && order.workflow_version !== 2) ||
    (order.locale !== "vi" && order.locale !== "en") ||
    ![null, "pending", "refunded"].includes(order.refund_status) ||
    !isTimestamp(order.server_time) ||
    (order.expires_at !== null && !isTimestamp(order.expires_at)) ||
    !stringFields(order.shipping_address, ["province_code", "ward_code", "address"]) ||
    ![order.subtotal_vnd, order.shipping_fee_vnd, order.total_vnd].every(isVnd) ||
    ![
      "delivery_date",
      "shipping_discount_reason",
      "discount_amount_vnd",
      "transfer_reported_at",
      "payment_received_at",
      "refund_requested_at",
      "refund_request_closed_at",
      "approved_at",
      "delivered_at",
      "cancelled_at",
      "refunded_at",
      "reconciliation_note",
      "refund_request_closed_reason",
      "refund_note",
      "cancellation_reason",
    ].every((field) => optionalText((order as Record<string, unknown>)[field])) ||
    (order.payment !== null &&
      (!isApiObject(order.payment) ||
        !paymentStatuses.includes(order.payment.status) ||
        !stringFields(order.payment, [
          "bank_bin",
          "bank_name",
          "account_number",
          "account_name",
          "transfer_content",
        ]))) ||
    (order.coupon != null && (!isApiObject(order.coupon) || !optionalText(order.coupon.code))) ||
    (order.shipping_benefit != null &&
      (!isApiObject(order.shipping_benefit) ||
        !isUuid(order.shipping_benefit.round_id) ||
        !isUuid(order.shipping_benefit.csa_order_id) ||
        !optionalText(order.shipping_benefit.delivery_date) ||
        !optionalText(order.shipping_benefit.delivery_at))) ||
    (order.csa !== undefined && !hasOrderCSA(order.csa, orderId)) ||
    !Array.isArray(order.lines) ||
    !order.lines.every(hasOrderLine)
  )
    throw invalidApiResponse();

  const lines = new Map(order.lines.map((line) => [line.id, line.product_id]));
  const products = new Set(lines.values());
  function stockRow(value: unknown): value is Record<string, unknown> {
    return (
      isApiObject(value) &&
      isUuid(value.line_id) &&
      lines.has(value.line_id) &&
      isUuid(value.batch_id)
    );
  }
  function batchRow(value: unknown): value is Record<string, unknown> {
    return (
      stockRow(value) &&
      isUuid(value.product_id) &&
      value.product_id === lines.get(String(value.line_id)) &&
      isUuid(value.farm_id) &&
      stringFields(value, ["farm_name", "start_date", "end_date"])
    );
  }
  const { allocation_suggestion: suggestion, source_inventory: inventory, allocations } = order;
  if (
    !Array.isArray(suggestion) ||
    !suggestion.every((row) => stockRow(row) && count(row.quantity) && row.quantity > 0) ||
    !Array.isArray(allocations) ||
    !allocations.every(
      (row) =>
        batchRow(row) &&
        isUuid(row.id) &&
        count(row.quantity) &&
        row.quantity > 0 &&
        count(row.restocked_quantity) &&
        count(row.restock_remaining_quantity) &&
        typeof row.restock_eligible === "boolean" &&
        optionalText(row.restock_unavailable_reason),
    ) ||
    !isApiObject(inventory) ||
    typeof inventory.refresh_required_before_approve !== "boolean" ||
    !Array.isArray(inventory.candidates) ||
    !inventory.candidates.every((row) => batchRow(row) && count(row.available_quantity)) ||
    !Array.isArray(inventory.product_reservations) ||
    !inventory.product_reservations.every(
      (row) =>
        isApiObject(row) &&
        isUuid(row.product_id) &&
        products.has(row.product_id) &&
        count(row.reserved_quantity) &&
        count(row.this_order_quantity) &&
        count(row.other_orders_quantity),
    )
  )
    throw invalidApiResponse();
  return order;
}

type StoreOrderRequestOptions = { shouldRedirectToLogin?: () => boolean };

export async function getStoreOrder(
  id: string,
  signal?: AbortSignal,
  options?: StoreOrderRequestOptions,
) {
  if (!isUuid(id)) throw invalidApiResponse();
  const orderId = id.toLowerCase();
  const path = `admin/store-orders/${orderId}`;
  const init = signal ? { signal } : undefined;
  const order = options
    ? await api<StoreOrder>(path, init, options)
    : init
      ? await api<StoreOrder>(path, init)
      : await api<StoreOrder>(path);
  return requireStoreOrderDetail(order, orderId);
}

export async function mutateStoreOrder(
  id: string,
  action: StoreOrderAction,
  payload: Record<string, unknown>,
  options?: StoreOrderRequestOptions,
) {
  if (!isUuid(id)) throw invalidApiResponse();
  const orderId = id.toLowerCase();
  const path = `admin/store-orders/${orderId}/${action}`;
  const init = {
    method: "POST",
    body: JSON.stringify(payload),
  };
  const updated = options
    ? await api<StoreOrder>(path, init, options)
    : await api<StoreOrder>(path, init);
  return requireStoreOrderDetail(updated, orderId);
}

export function formatStoreMoney(value: string, locale: AdminLocale) {
  const amount = /^\d+$/u.test(value) ? BigInt(value) : 0n;
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function storeDeadlineRemainingMs(
  order: Pick<StoreOrder, "expires_at" | "server_time">,
  clientReceivedAt: number,
  clientNow: number,
) {
  if (!order.expires_at) return null;
  const serverOffset = Date.parse(order.server_time) - clientReceivedAt;
  return Math.max(0, Date.parse(order.expires_at) - (clientNow + serverOffset));
}

export function getStoreOrderActions(
  order: StoreOrder,
  { expired = false }: { expired?: boolean } = {},
): StoreOrderAction[] {
  const actions: StoreOrderAction[] = [];
  const knownWorkflow = order.workflow_version === 1 || order.workflow_version === 2;
  const hasMoney = /^\d+$/u.test(order.total_vnd) && BigInt(order.total_vnd) > 0n;
  const csaReady = !order.csa || ["locked", "confirmed"].includes(order.csa.selection.state);
  if (knownWorkflow && order.status === "pending_review" && csaReady) actions.push("approve");
  if (
    knownWorkflow &&
    ["payment_pending", "pending_review", "payment_review", "pending_delivery"].includes(
      order.status,
    )
  )
    actions.push("cancel");
  const v2Store = order.workflow_version === 2 && !order.csa;
  const reconciliationOpen = order.refund_status === "pending" && !order.refund_request_closed_at;
  const canReceive = v2Store
    ? order.status === "cancelled"
      ? reconciliationOpen
      : Boolean(order.approved_at) && ["payment_pending", "payment_review"].includes(order.status)
    : order.workflow_version === 1 &&
      ["cancelled", "payment_pending", "pending_review"].includes(order.status);
  if (
    hasMoney &&
    !order.csa &&
    order.payment_status === "unconfirmed" &&
    order.payment_received_at === null &&
    canReceive
  )
    actions.push("record-payment");
  if (hasMoney && order.status === "cancelled" && order.refund_status === "pending") {
    if (
      order.payment_status === "unconfirmed" &&
      order.payment_received_at === null &&
      (!v2Store || reconciliationOpen)
    )
      actions.push("close-refund-request");
    if (order.payment_status === "refund_required") actions.push("refund");
  }
  if (knownWorkflow && order.status === "pending_delivery") actions.push("deliver");
  if (
    order.status === "cancelled" &&
    order.approved_at &&
    order.allocations?.some(
      (allocation) =>
        allocation.restock_remaining_quantity > 0 && allocation.restock_eligible === true,
    )
  )
    actions.push("restock");
  return expired && storeOrderHasDeadline(order)
    ? actions.filter((action) => !["approve", "cancel", "deliver"].includes(action))
    : actions;
}

export function getStoreOrderPrimaryAction(
  actions: readonly StoreOrderAction[],
): StoreOrderAction | null {
  const priority: StoreOrderAction[] = ["record-payment", "approve", "deliver", "refund"];
  return priority.find((action) => actions.includes(action)) ?? null;
}

export type StoreAllocationError =
  | "duplicate"
  | "invalid_quantity"
  | "source_invalid"
  | "line_incomplete"
  | "line_exceeded"
  | "batch_exceeded";

export function validateStoreAllocations(order: StoreOrder, rows: StoreOrderAllocationDraft[]) {
  const errors: StoreAllocationError[] = [];
  const pairKeys = rows.map((row) => `${row.line_id}:${row.batch_id}`);
  if (new Set(pairKeys).size !== pairKeys.length) {
    return { valid: false as const, errors: ["duplicate" as const] };
  }
  const lines = new Map(order.lines.map((line) => [line.id, line]));
  const candidates = new Map(
    (order.source_inventory?.candidates ?? []).map((candidate) => [
      `${candidate.line_id}:${candidate.batch_id}`,
      candidate,
    ]),
  );
  const byLine = new Map<string, number>();
  const byBatch = new Map<string, number>();
  const availability = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.quantity) || row.quantity <= 0) {
      errors.push("invalid_quantity");
      continue;
    }
    const candidate = candidates.get(`${row.line_id}:${row.batch_id}`);
    if (!lines.has(row.line_id) || !candidate) {
      errors.push("source_invalid");
      continue;
    }
    byLine.set(row.line_id, (byLine.get(row.line_id) ?? 0) + row.quantity);
    byBatch.set(row.batch_id, (byBatch.get(row.batch_id) ?? 0) + row.quantity);
    availability.set(row.batch_id, candidate.available_quantity);
  }
  for (const line of order.lines) {
    const allocated = byLine.get(line.id) ?? 0;
    if (allocated < line.quantity) errors.push("line_incomplete");
    if (allocated > line.quantity) errors.push("line_exceeded");
  }
  for (const [batchId, allocated] of byBatch) {
    if (allocated > (availability.get(batchId) ?? 0)) errors.push("batch_exceeded");
  }
  const uniqueErrors = [...new Set(errors)];
  return { valid: uniqueErrors.length === 0, errors: uniqueErrors };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export class IdempotencyKeyStore {
  private current = new Map<string, { fingerprint: string; key: string }>();

  constructor(private readonly createKey: () => string = () => crypto.randomUUID()) {}

  forPayload(action: StoreOrderAction, payload: unknown, revision?: unknown) {
    const fingerprint = JSON.stringify(stableValue({ payload, revision }));
    const existing = this.current.get(action);
    if (existing?.fingerprint === fingerprint) return existing.key;
    const key = this.createKey();
    this.current.set(action, { fingerprint, key });
    return key;
  }

  clear(action: StoreOrderAction) {
    this.current.delete(action);
  }
}

export function formatStoreDeliveryDate(order: Pick<StoreOrder, "csa" | "delivery_date">) {
  return order.csa
    ? formatAdminDate(order.csa.round.delivery_date)
    : formatAdminDate(order.delivery_date);
}

export function formatStoreShippingBenefitDate(order: Pick<StoreOrder, "shipping_benefit">) {
  const benefit = order.shipping_benefit;
  return formatAdminDate(benefit?.delivery_date ?? benefit?.delivery_at);
}
