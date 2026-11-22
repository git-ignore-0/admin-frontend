import { formatAdminDate } from "@/lib/admin-date";
import { requirePaginatedList } from "@/lib/api-response";
import { api, apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
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

function hasStoreOrderSummary(order: StoreOrder) {
  return (
    isApiObject(order) &&
    typeof order.id === "string" &&
    typeof order.reference_code === "string" &&
    storeOrderDisplayStatuses.includes(order.status) &&
    typeof order.payment_status === "string" &&
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

export function getStoreOrder(id: string) {
  return api<StoreOrder>(`admin/store-orders/${id}`);
}

export async function mutateStoreOrder(
  id: string,
  action: StoreOrderAction,
  payload: Record<string, unknown>,
) {
  const updated = await api<StoreOrder>(`admin/store-orders/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (
    !hasStoreOrderSummary(updated) ||
    updated.id !== id ||
    !Array.isArray(updated.lines) ||
    !updated.lines.every(isApiObject) ||
    (updated.allocations !== undefined && !Array.isArray(updated.allocations)) ||
    (updated.csa !== undefined && !isApiObject(updated.csa.selection))
  ) {
    throw invalidApiResponse();
  }
  return updated;
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
