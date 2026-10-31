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

export function listFarms(query: { search?: string; is_active?: boolean; page?: number } = {}) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.search) params.set("search", query.search);
  if (query.is_active !== undefined) params.set("is_active", String(query.is_active));
  return apiEnvelope<Farm[], PaginationMeta>(`admin/farms?${params}`);
}

export function getFarm(id: string) {
  return api<Farm>(`admin/farms/${id}`);
}

export function saveFarm(id: string | undefined, payload: Partial<FarmInput>) {
  return api<Farm>(id ? `admin/farms/${id}` : "admin/farms", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteFarm(id: string) {
  return api<void>(`admin/farms/${id}`, { method: "DELETE" });
}

export function uploadFarmImage(file: File) {
  const body = new FormData();
  body.append("image", file);
  return api<MediaAsset>("admin/farms/media", { method: "POST", body });
}

export function deleteFarmImage(id: string, options?: { keepalive?: boolean }) {
  return api<void>(`admin/farms/media/${id}`, {
    method: "DELETE",
    keepalive: options?.keepalive,
  });
}

export function listFarmProducts(farmId: string, query: { page?: number; search?: string } = {}) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.search) params.set("search", query.search);
  return apiEnvelope<FarmProduct[], PaginationMeta>(`admin/farms/${farmId}/products?${params}`);
}

export function listAvailableFarmProducts(
  farmId: string,
  query: { page?: number; search?: string } = {},
) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.search) params.set("search", query.search);
  return apiEnvelope<AvailableFarmProduct[], PaginationMeta>(
    `admin/farms/${farmId}/available-products?${params}`,
  );
}

export function addFarmProduct(farmId: string, productId: string, batch: StockBatchInput) {
  return api<FarmProduct>(`admin/farms/${farmId}/products`, {
    method: "POST",
    body: JSON.stringify({ product_id: productId, ...batch }),
  });
}

export function setFarmProductActive(farmId: string, productId: string, isActive: boolean) {
  return api<FarmProduct>(`admin/farms/${farmId}/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  });
}

export function removeFarmProduct(farmId: string, productId: string) {
  return api<void>(`admin/farms/${farmId}/products/${productId}`, { method: "DELETE" });
}

export function listFarmStockBatches(
  farmId: string,
  productId: string,
  query: { page?: number; status?: StockBatchStatus } = {},
) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.status) params.set("status", query.status);
  return apiEnvelope<FarmStockBatch[], PaginationMeta>(
    `admin/farms/${farmId}/products/${productId}/batches?${params}`,
  );
}

export function createFarmStockBatch(farmId: string, productId: string, batch: StockBatchInput) {
  return api<FarmStockBatch>(`admin/farms/${farmId}/products/${productId}/batches`, {
    method: "POST",
    body: JSON.stringify(batch),
  });
}

export function updateFarmStockBatch(
  farmId: string,
  productId: string,
  batchId: string,
  payload: Partial<StockBatchInput> & { version: number },
) {
  return api<FarmStockBatch>(`admin/farms/${farmId}/products/${productId}/batches/${batchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function cancelFarmStockBatch(
  farmId: string,
  productId: string,
  batchId: string,
  version: number,
) {
  return api<FarmStockBatch>(
    `admin/farms/${farmId}/products/${productId}/batches/${batchId}/cancel`,
    { method: "POST", body: JSON.stringify({ version }) },
  );
}

export function getFarmTracker(farmId: string) {
  return api<TrackerFarm>(`admin/farms/${farmId}/growth-tracker`);
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
  return api<void>(`admin/farms/${farmId}/growth-tracker`, { method: "DELETE" });
}
