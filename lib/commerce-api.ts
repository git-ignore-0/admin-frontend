import {
  requirePaginatedList,
  requireResponseEntity,
  requireResponseList,
} from "@/lib/api-response";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { api, apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import { requireCreationReceipt } from "@/lib/creation-receipt";
import { parsePositiveBigInteger, parsePositiveDecimal } from "@/lib/numeric-input";
import type {
  MediaAsset,
  PaginationMeta,
  ProductStatus,
  ProductLockReason,
  StoreCategory,
  StoreProduct,
  StoreProductDetail,
} from "@/lib/types";

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
  translations: StoreProduct["translations"];
  version?: number;
  idempotency_key?: string;
};

function requireStoreCategory(category: StoreCategory, id?: string) {
  requireResponseEntity(category, id);
  if (
    typeof category.slug !== "string" ||
    typeof category.is_active !== "boolean" ||
    typeof category.has_children !== "boolean" ||
    !(category.parent_id === null || typeof category.parent_id === "string") ||
    ![category.depth, category.sort_order, category.product_count].every(Number.isSafeInteger) ||
    category.depth < 1 ||
    category.product_count < 0
  )
    throw invalidApiResponse();
  requireResponseList(category.translations, (translation) => {
    if (
      !isApiObject(translation) ||
      !isLocale(translation.locale) ||
      typeof translation.name !== "string" ||
      typeof translation.description !== "string"
    )
      throw invalidApiResponse();
  });
  return category;
}

export function listStoreCategories(
  query?: { search?: string; is_active?: boolean },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.is_active !== undefined) params.set("is_active", String(query.is_active));
  return api<StoreCategory[]>(`admin/store-categories${params.size ? `?${params}` : ""}`, {
    signal,
  }).then((data) => requireResponseList(data, requireStoreCategory));
}

export function getStoreCategory(id: string, signal?: AbortSignal) {
  return api<StoreCategory>(`admin/store-categories/${id}`, { signal }).then((data) =>
    requireStoreCategory(data, id),
  );
}

export function saveStoreCategory(payload: CategoryInput, id?: string) {
  return api<StoreCategory>(id ? `admin/store-categories/${id}` : "admin/store-categories", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  }).then((data) => requireStoreCategory(data, id));
}

export function deleteStoreCategory(id: string) {
  return api(`admin/store-categories/${id}`, { method: "DELETE" }, { response: "no-content" });
}

export type ProductFilters = {
  search?: string;
  category_id?: string;
  status?: ProductStatus;
  csa_eligible?: boolean;
  page?: number;
};

const lockReasonCodes: ReadonlySet<ProductLockReason["code"]> = new Set([
  "stock_batch",
  "legacy_supply",
  "store_order",
  "csa_hold",
  "farm_link",
  "csa_history",
  "store_reservation",
]);

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATH_SEGMENT.test(value);
}

function isLocale(value: unknown) {
  return value === "vi" || value === "en";
}

function isImageVariant(value: unknown) {
  return (
    isApiObject(value) &&
    typeof value.url === "string" &&
    value.url.length > 0 &&
    typeof value.width === "number" &&
    Number.isSafeInteger(value.width) &&
    value.width > 0 &&
    typeof value.height === "number" &&
    Number.isSafeInteger(value.height) &&
    value.height > 0
  );
}

function validateStoreProduct(product: StoreProduct) {
  requireResponseEntity(product);
  if (
    !isUuid(product.id) ||
    !isUuid(product.category_id) ||
    !["draft", "active", "discontinued"].includes(product.status) ||
    [
      product.sku,
      product.slug,
      product.category_slug,
      product.unit_label_vi,
      product.unit_label_en,
    ].some((value) => typeof value !== "string" || !value.trim()) ||
    typeof product.retail_price_vnd !== "string" ||
    parsePositiveBigInteger(product.retail_price_vnd).error ||
    typeof product.unit_size !== "string" ||
    parsePositiveDecimal(product.unit_size).error ||
    typeof product.csa_quota_cost !== "number" ||
    !Number.isFinite(product.csa_quota_cost) ||
    product.csa_quota_cost < 0 ||
    [product.created_at, product.updated_at].some(
      (value) => typeof value !== "string" || !Number.isFinite(Date.parse(value)),
    )
  )
    throw invalidApiResponse();

  requireResponseList(product.translations, (translation) => {
    if (
      !isApiObject(translation) ||
      !isLocale(translation.locale) ||
      typeof translation.name !== "string" ||
      typeof translation.description !== "string" ||
      typeof translation.short_description !== "string" ||
      (translation.description_document != null &&
        (!isApiObject(translation.description_document) ||
          translation.description_document.type !== "doc"))
    )
      throw invalidApiResponse();
  });

  const group = product.csa_quota_group;
  if (
    group === null
      ? product.csa_quota_group_id !== null
      : !isApiObject(group) ||
        !isUuid(group.id) ||
        group.id !== product.csa_quota_group_id ||
        typeof group.name !== "string" ||
        !Array.isArray(group.translations) ||
        group.translations.some(
          (item) => !isApiObject(item) || !isLocale(item.locale) || typeof item.name !== "string",
        )
  )
    throw invalidApiResponse();

  const image = product.primary_image;
  if (
    image === null
      ? product.primary_image_id !== null
      : !isApiObject(image) ||
        !isUuid(image.id) ||
        image.id !== product.primary_image_id ||
        !isImageVariant(image) ||
        !Array.isArray(image.variants) ||
        !image.variants.every(isImageVariant)
  )
    throw invalidApiResponse();
}

function requireStoreProductDetail(
  product: StoreProductDetail,
  id?: string,
  status?: ProductStatus,
) {
  validateStoreProduct(product);
  if (
    (id !== undefined && product.id.toLowerCase() !== id.toLowerCase()) ||
    (status !== undefined && product.status !== status) ||
    !Number.isSafeInteger(product.version) ||
    product.version < 1 ||
    !isApiObject(product.capabilities)
  )
    throw invalidApiResponse();

  for (const key of ["edit_identity", "edit_csa", "delete"] as const) {
    const capability = product.capabilities[key];
    if (!isApiObject(capability) || typeof capability.allowed !== "boolean")
      throw invalidApiResponse();
    requireResponseList(capability.reasons, (reason) => {
      if (
        !isApiObject(reason) ||
        !lockReasonCodes.has(reason.code) ||
        [reason.id, reason.farm_id, reason.label, reason.farm_name_vi, reason.farm_name_en].some(
          (value) => value != null && typeof value !== "string",
        )
      )
        throw invalidApiResponse();
    });
  }
  return product;
}

export function listStoreProducts(query: ProductFilters, signal?: AbortSignal) {
  const page = query.page ?? 1;
  const params = new URLSearchParams({ page: String(page) });
  if (query.search) params.set("search", query.search);
  if (query.category_id) params.set("category_id", query.category_id);
  for (const key of ["status", "csa_eligible"] as const) {
    if (query[key] !== undefined) params.set(key, String(query[key]));
  }
  return apiEnvelope<StoreProduct[], PaginationMeta>(`admin/store-products?${params}`, {
    signal,
  }).then((response) => {
    const result = requirePaginatedList(response, validateStoreProduct);
    if (result.meta.page !== page) throw invalidApiResponse();
    return result;
  });
}

export function getStoreProduct(id: string, signal?: AbortSignal) {
  return api<StoreProductDetail>(`admin/store-products/${id}`, { signal }).then((product) =>
    requireStoreProductDetail(product, id),
  );
}

export async function saveStoreProduct(
  payload: Partial<ProductInput>,
  id?: string,
  active?: () => boolean,
) {
  const init = {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  };
  if (!id && payload.idempotency_key) {
    const { data, meta } = await apiEnvelope("admin/store-products", init, {
      allowMissingData: true,
      shouldRedirectToLogin: active,
    });
    return {
      id: requireCreationReceipt(meta, payload.idempotency_key, "create_product"),
      removed: data === null,
    };
  }
  const product = await api<StoreProductDetail>(
    id ? `admin/store-products/${id}` : "admin/store-products",
    init,
    { shouldRedirectToLogin: active },
  );
  return { ...requireStoreProductDetail(product, id, id ? undefined : "draft"), removed: false };
}

export async function getStoreProductCreation(key: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ creation_key: key });
  const { data, meta } = await apiEnvelope(
    `admin/store-products?${query}`,
    { signal },
    {
      allowMissingData: true,
    },
  );
  return { id: requireCreationReceipt(meta, key, "create_product"), removed: data === null };
}

export function transitionStoreProduct(
  id: string,
  expected: ProductStatus,
  target: ProductStatus,
  version: number,
  active?: () => boolean,
) {
  return api<StoreProductDetail>(
    `admin/store-products/${id}/transition`,
    {
      method: "POST",
      body: JSON.stringify({ expected_status: expected, target_status: target, version }),
    },
    { shouldRedirectToLogin: active },
  ).then((product) => requireStoreProductDetail(product, id, target));
}

export function deleteStoreProduct(id: string, version: number, active?: () => boolean) {
  return api(
    `admin/store-products/${id}`,
    { method: "DELETE", body: JSON.stringify({ version }) },
    { response: "no-content", shouldRedirectToLogin: active },
  );
}

export function uploadStoreProductImage(file: File, active?: () => boolean) {
  const body = new FormData();
  body.append("image", file);
  return api<MediaAsset>(
    "admin/store-products/media",
    { method: "POST", body },
    { shouldRedirectToLogin: active },
  );
}

export function deleteStoreProductImage(id: string, options?: { keepalive?: boolean }) {
  return api(
    `admin/store-products/media/${id}`,
    { method: "DELETE", keepalive: options?.keepalive },
    { response: "no-content", shouldRedirectToLogin: options?.keepalive ? () => false : undefined },
  );
}
