import { api, apiEnvelope } from "@/lib/client-api";
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
  "payment_pending",
  "pending_review",
  "pending_delivery",
  "delivered",
  "cancelled",
  "refund_required",
  "refunded",
] as const;

export type StoreOrderDisplayStatus = (typeof storeOrderDisplayStatuses)[number];

export function getStoreOrderDisplayStatus(
  order: Pick<StoreOrder, "status" | "payment_status">,
): StoreOrderDisplayStatus {
  if (
    order.status === "cancelled" &&
    (order.payment_status === "refund_required" || order.payment_status === "refunded")
  ) {
    return order.payment_status;
  }
  return order.status;
}

export function storeOrderStatusQuery(
  status: StoreOrderDisplayStatus | "",
): Pick<StoreOrderQuery, "status" | "paymentStatus"> {
  return status === "refund_required" || status === "refunded"
    ? { status: "cancelled", paymentStatus: status }
    : { status };
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

export function listStoreOrders(query: StoreOrderQuery = {}) {
  return apiEnvelope<StoreOrder[], PaginationMeta>(
    `admin/store-orders?${buildStoreOrderQuery(query)}`,
  );
}

export function getStoreOrder(id: string) {
  return api<StoreOrder>(`admin/store-orders/${id}`);
}

export function mutateStoreOrder(
  id: string,
  action: StoreOrderAction,
  payload: Record<string, unknown>,
) {
  return api<StoreOrder>(`admin/store-orders/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

export function getStoreOrderActions(order: StoreOrder): StoreOrderAction[] {
  const actions: StoreOrderAction[] = [];
  if (
    order.status === "pending_review" &&
    (order.total_vnd === "0" || order.payment_status === "received")
  ) {
    actions.push("approve");
  }
  if (["payment_pending", "pending_review", "pending_delivery"].includes(order.status)) {
    actions.push("cancel");
  }
  if (order.total_vnd !== "0" && order.payment_status === "unconfirmed") {
    actions.push("record-payment");
  }
  if (order.status === "cancelled" && order.payment_status === "refund_required") {
    actions.push("refund");
  }
  if (order.status === "pending_delivery") actions.push("deliver");
  if (
    order.status === "cancelled" &&
    order.approved_at &&
    order.allocations?.some(
      (allocation) =>
        allocation.restock_remaining_quantity > 0 && allocation.restock_eligible === true,
    )
  ) {
    actions.push("restock");
  }
  return actions;
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
