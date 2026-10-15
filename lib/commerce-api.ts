import { api, apiEnvelope } from "@/lib/client-api";
import type { MediaAsset, PaginationMeta, StoreCategory, StoreProduct } from "@/lib/types";

export type CategoryInput = {
  slug?: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  translations: StoreCategory["translations"];
};

export type ProductInput = {
  sku: string;
  slug?: string;
  category_id: string;
  unit_size: string;
  unit_label_vi: string;
  unit_label_en: string;
  retail_price_vnd: string;
  csa_quota_group_id: string | null;
  csa_quota_cost: number;
  primary_image_id: string | null;
  is_active: boolean;
  is_published: boolean;
  translations: StoreProduct["translations"];
};

export function listStoreCategories(query?: { search?: string; is_active?: boolean }) {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.is_active !== undefined) params.set("is_active", String(query.is_active));
  return api<StoreCategory[]>(`admin/store-categories${params.size ? `?${params}` : ""}`);
}

export function getStoreCategory(id: string) {
  return api<StoreCategory>(`admin/store-categories/${id}`);
}

export function saveStoreCategory(payload: CategoryInput, id?: string) {
  return api<StoreCategory>(id ? `admin/store-categories/${id}` : "admin/store-categories", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteStoreCategory(id: string) {
  return api<void>(`admin/store-categories/${id}`, { method: "DELETE" });
}

export type ProductFilters = {
  search?: string;
  category_id?: string;
  is_active?: boolean;
  is_published?: boolean;
  csa_eligible?: boolean;
  page?: number;
};

export function listStoreProducts(query: ProductFilters) {
  const params = new URLSearchParams({ page: String(query.page ?? 1) });
  if (query.search) params.set("search", query.search);
  if (query.category_id) params.set("category_id", query.category_id);
  for (const key of ["is_active", "is_published", "csa_eligible"] as const) {
    if (query[key] !== undefined) params.set(key, String(query[key]));
  }
  return apiEnvelope<StoreProduct[], PaginationMeta>(`admin/store-products?${params}`);
}

export function getStoreProduct(id: string) {
  return api<StoreProduct>(`admin/store-products/${id}`);
}

export function saveStoreProduct(payload: ProductInput, id?: string) {
  return api<StoreProduct>(id ? `admin/store-products/${id}` : "admin/store-products", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteStoreProduct(id: string) {
  return api<void>(`admin/store-products/${id}`, { method: "DELETE" });
}

export function uploadStoreProductImage(file: File) {
  const body = new FormData();
  body.append("image", file);
  return api<MediaAsset>("admin/store-products/media", { method: "POST", body });
}

export function deleteStoreProductImage(id: string, options?: { keepalive?: boolean }) {
  return api<void>(`admin/store-products/media/${id}`, {
    method: "DELETE",
    keepalive: options?.keepalive,
  });
}
