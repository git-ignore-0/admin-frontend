import { isoDateToAdminInput } from "@/lib/admin-date";
import { requirePaginatedList, requireResponseEntity } from "@/lib/api-response";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { invalidApiResponse } from "@/lib/client-error";
import { parsePositiveDecimal } from "@/lib/numeric-input";
import { api, apiEnvelope } from "@/lib/client-api";
import type {
  Farm,
  AvailableFarmProduct,
  FarmProduct,
  FarmStockBatch,
  MediaAsset,
  PaginationMeta,
  StockBatchInput,
  StockBatchStatus,
  TrackerFarm,
} from "@/lib/types";

export type FarmInput = Pick<
  Farm,
  | "name_en"
  | "name_vi"
  | "location_en"
  | "location_vi"
  | "description_en"
  | "description_vi"
  | "is_active"
> & { photo_ids: string[]; version?: number };

export function listFarms(
  query: { search?: string; is_active?: boolean; page?: number } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.search) params.set("search", query.search);
  if (query.is_active !== undefined) params.set("is_active", String(query.is_active));
  return apiEnvelope<Farm[], PaginationMeta>(`admin/farms?${params}`, { signal }).then((payload) =>
    requirePaginatedList(payload, requireResponseEntity),
  );
}

export function getFarm(id: string, signal?: AbortSignal) {
  return api<Farm>(`admin/farms/${id}`, { signal });
}

export function saveFarm(id: string | undefined, payload: Partial<FarmInput>) {
  return api<Farm>(id ? `admin/farms/${id}` : "admin/farms", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  }).then(requireResponseEntity);
}

export function deleteFarm(id: string) {
  return api(`admin/farms/${id}`, { method: "DELETE" }, { response: "no-content" });
}

export function uploadFarmImage(file: File) {
  const body = new FormData();
  body.append("image", file);
  return api<MediaAsset>("admin/farms/media", { method: "POST", body });
}

export function deleteFarmImage(id: string, options?: { keepalive?: boolean }) {
  return api(
    `admin/farms/media/${id}`,
    { method: "DELETE", keepalive: options?.keepalive },
    { response: "no-content" },
  );
}

function uuid(value: unknown, expected?: string) {
  return (
    typeof value === "string" &&
    UUID_PATH_SEGMENT.test(value) &&
    (expected === undefined || value.toLowerCase() === expected.toLowerCase())
  );
}

function integer(value: unknown, minimum = 0): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function nonempty(value: unknown): boolean {
  return typeof value === "string" && Boolean(value.trim());
}

function day(value: unknown): boolean {
  return typeof value === "string" && Boolean(isoDateToAdminInput(value));
}

function requireAvailableFarmProduct(data: AvailableFarmProduct) {
  requireResponseEntity(data);
  if (!uuid(data.id) || ![data.sku, data.name_vi, data.name_en].every(nonempty)) {
    throw invalidApiResponse();
  }
  return data;
}

function requireFarmProduct(data: FarmProduct, farmId: string, productId?: string) {
  requireAvailableFarmProduct(data);
  if (
    !uuid(data.farm_id, farmId) ||
    !uuid(data.product_id, productId) ||
    !["draft", "active", "discontinued"].includes(data.product_status) ||
    typeof data.is_active !== "boolean" ||
    typeof data.has_supply_history !== "boolean" ||
    typeof data.unit_size !== "string" ||
    Boolean(parsePositiveDecimal(data.unit_size).error) ||
    ![data.unit_label_vi, data.unit_label_en].every(nonempty) ||
    ![
      data.initial_quantity,
      data.net_sold_quantity,
      data.available_quantity,
      data.batch_count,
      data.active_batch_count,
    ].every((value) => integer(value)) ||
    !(data.next_expiry_date === null || day(data.next_expiry_date))
  ) {
    throw invalidApiResponse();
  }
  return data;
}

function requireStockBatch(data: FarmStockBatch, linkId?: string, batchId?: string) {
  requireResponseEntity(data);
  if (
    !uuid(data.id, batchId) ||
    !uuid(data.farm_product_id, linkId) ||
    !day(data.start_date) ||
    !day(data.end_date) ||
    data.start_date > data.end_date ||
    !integer(data.quantity_units, 1) ||
    !integer(data.version, 1) ||
    ![data.net_sold_quantity, data.remaining_quantity, data.available_quantity].every((value) =>
      integer(value),
    ) ||
    !["upcoming", "active", "expired", "cancelled"].includes(data.status) ||
    ![data.created_at, data.updated_at].every(
      (value) => typeof value === "string" && Number.isFinite(Date.parse(value)),
    )
  ) {
    throw invalidApiResponse();
  }
  return data;
}

export function listFarmProducts(
  farmId: string,
  query: { page?: number; search?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.search) params.set("search", query.search);
  return apiEnvelope<FarmProduct[], PaginationMeta>(`admin/farms/${farmId}/products?${params}`, {
    signal,
  }).then((payload) => requirePaginatedList(payload, (data) => requireFarmProduct(data, farmId)));
}

export function listAvailableFarmProducts(
  farmId: string,
  query: { page?: number; search?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.search) params.set("search", query.search);
  return apiEnvelope<AvailableFarmProduct[], PaginationMeta>(
    `admin/farms/${farmId}/available-products?${params}`,
    { signal },
  ).then((payload) => requirePaginatedList(payload, requireAvailableFarmProduct));
}

export function addFarmProduct(farmId: string, productId: string, batch: StockBatchInput) {
  return api<FarmProduct>(`admin/farms/${farmId}/products`, {
    method: "POST",
    body: JSON.stringify({ product_id: productId, ...batch }),
  }).then((data) => requireFarmProduct(data, farmId, productId));
}

export function setFarmProductActive(farmId: string, productId: string, isActive: boolean) {
  return api<FarmProduct>(`admin/farms/${farmId}/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  }).then((data) => requireFarmProduct(data, farmId, productId));
}

export function removeFarmProduct(farmId: string, productId: string) {
  return api(
    `admin/farms/${farmId}/products/${productId}`,
    { method: "DELETE" },
    { response: "no-content" },
  );
}

export function listFarmStockBatches(
  farmId: string,
  productId: string,
  query: { page?: number; status?: StockBatchStatus } = {},
  { signal, linkId }: { signal?: AbortSignal; linkId?: string } = {},
) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.status) params.set("status", query.status);
  return apiEnvelope<FarmStockBatch[], PaginationMeta>(
    `admin/farms/${farmId}/products/${productId}/batches?${params}`,
    { signal },
  ).then((payload) => requirePaginatedList(payload, (data) => requireStockBatch(data, linkId)));
}

export function createFarmStockBatch(
  farmId: string,
  productId: string,
  batch: StockBatchInput,
  linkId?: string,
) {
  return api<FarmStockBatch>(`admin/farms/${farmId}/products/${productId}/batches`, {
    method: "POST",
    body: JSON.stringify(batch),
  }).then((data) => requireStockBatch(data, linkId));
}

export function updateFarmStockBatch(
  farmId: string,
  productId: string,
  batchId: string,
  payload: Partial<StockBatchInput> & { version: number },
  linkId?: string,
) {
  return api<FarmStockBatch>(`admin/farms/${farmId}/products/${productId}/batches/${batchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then((data) => requireStockBatch(data, linkId, batchId));
}

export function cancelFarmStockBatch(
  farmId: string,
  productId: string,
  batchId: string,
  version: number,
  linkId?: string,
) {
  return api<FarmStockBatch>(
    `admin/farms/${farmId}/products/${productId}/batches/${batchId}/cancel`,
    { method: "POST", body: JSON.stringify({ version }) },
  ).then((data) => requireStockBatch(data, linkId, batchId));
}

export function getFarmTracker(farmId: string, signal?: AbortSignal) {
  return api<TrackerFarm>(`admin/farms/${farmId}/growth-tracker`, { signal });
}

export function enableFarmTracker(
  farmId: string,
  payload: { signup_count: number; one_month_signup_count: number; is_visible?: boolean },
) {
  return api<TrackerFarm>(`admin/farms/${farmId}/growth-tracker`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFarmTracker(
  farmId: string,
  payload: {
    version: number;
    signup_count?: number;
    one_month_signup_count?: number;
    is_visible?: boolean;
  },
) {
  return api<TrackerFarm>(`admin/farms/${farmId}/growth-tracker`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function disableFarmTracker(farmId: string) {
  return api(
    `admin/farms/${farmId}/growth-tracker`,
    { method: "DELETE" },
    { response: "no-content" },
  );
}
