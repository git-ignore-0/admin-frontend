import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { apiEnvelope, firstValidationField } from "@/lib/client-api";
import {
  invalidApiResponse,
  isApiObject,
  isNativeRequestTimeout,
  isRequestCanceled,
} from "@/lib/client-error";
import {
  FARM_TOKEN,
  PRODUCT_IDENTITY,
  supplyRequestStatuses,
  type SupplyRequestStatus,
} from "@/lib/farm-supply-request-contract";
import type { FarmSupplyProduct } from "@/lib/farm-supply-form";
import type { PaginationMeta } from "@/lib/types";

export { supplyRequestStatuses, type SupplyRequestStatus };

export type FarmerFarm = { name_vi: string; name_en: string; is_active: boolean };

export type FarmerProduct = FarmSupplyProduct & {
  source_id: string;
  supply_generation: number;
  product_identity: string;
};

export type SupplyRequestItem = FarmSupplyProduct & { quantity_units: number };

export type SupplyRequest = {
  id: string;
  code: string;
  status: SupplyRequestStatus;
  start_date: string;
  end_date: string;
  submitted_at: string;
  processed_at: string | null;
  rejection_reason: string | null;
  items: SupplyRequestItem[];
};

export type AdminSupplyRequest = Omit<SupplyRequest, "items"> & {
  farm: FarmerFarm & { id: string };
  processed_by_id: string | null;
  items: (SupplyRequestItem & {
    source_id: string;
    source_generation: number;
    source_version: number;
    stock_batch_id: string | null;
  })[];
};

export type SupplySubmitPayload = {
  idempotency_key: string;
  start_date: string;
  end_date: string;
  items: {
    product_id: string;
    expected_link_id: string;
    expected_generation: number;
    expected_product_identity: string;
    quantity_units: number;
  }[];
};

export type FarmerLink = { farm_id: string; url: string };

type Envelope = { data: unknown; meta?: unknown };
type Predicate<T> = (input: unknown) => input is T;
type PageQuery = { page?: number };
type ProductQuery = PageQuery & { search?: string };
type AdminQuery = ProductQuery & { farm_id?: string; status?: SupplyRequestStatus };
const farmerRequestsPath = "supply-requests";
const adminRequestsPath = "admin/farm-supply-requests";

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATH_SEGMENT.test(value);
}

function matchesId(value: string, expected: string) {
  return value.toLowerCase() === expected.toLowerCase();
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function date(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const timestamp = new Date(`${value}T00:00:00Z`);
  return (
    value.slice(0, 4) !== "0000" &&
    Number.isFinite(timestamp.getTime()) &&
    timestamp.toISOString().slice(0, 10) === value
  );
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    date(value.slice(0, 10)) &&
    /^T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value.slice(10),
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function isFarm(value: unknown): value is FarmerFarm {
  return (
    isApiObject(value) &&
    text(value.name_vi) &&
    text(value.name_en) &&
    typeof value.is_active === "boolean"
  );
}

function isProduct(value: unknown): value is FarmSupplyProduct {
  return (
    isApiObject(value) &&
    uuid(value.product_id) &&
    text(value.sku) &&
    text(value.name_vi) &&
    text(value.name_en) &&
    typeof value.unit_size === "string" &&
    /^\d{1,7}(?:\.\d{1,3})?$/u.test(value.unit_size) &&
    Number(value.unit_size) > 0 &&
    typeof value.unit_label_vi === "string" &&
    typeof value.unit_label_en === "string"
  );
}

function isFarmerProduct(value: unknown): value is FarmerProduct {
  return (
    isApiObject(value) &&
    uuid(value.source_id) &&
    integer(value.supply_generation, 1, 2_147_483_647) &&
    typeof value.product_identity === "string" &&
    PRODUCT_IDENTITY.test(value.product_identity) &&
    isProduct(value)
  );
}

function isItem(value: unknown): value is SupplyRequestItem {
  return isApiObject(value) && integer(value.quantity_units, 1, 2_147_483_647) && isProduct(value);
}

function isRequest(value: unknown): value is SupplyRequest {
  if (
    !isApiObject(value) ||
    !uuid(value.id) ||
    !text(value.code) ||
    !supplyRequestStatuses.some((status) => status === value.status) ||
    !date(value.start_date) ||
    !date(value.end_date) ||
    value.end_date < value.start_date ||
    !timestamp(value.submitted_at) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 50 ||
    !value.items.every(isItem) ||
    new Set(value.items.map((item) => item.product_id.toLowerCase())).size !== value.items.length
  )
    return false;
  if (value.status === "pending")
    return value.processed_at === null && value.rejection_reason === null;
  return (
    timestamp(value.processed_at) &&
    (value.status === "rejected"
      ? text(value.rejection_reason) && Array.from(value.rejection_reason).length <= 500
      : value.rejection_reason === null)
  );
}

function isAdminRequest(value: unknown): value is AdminSupplyRequest {
  if (
    !isApiObject(value) ||
    !isApiObject(value.farm) ||
    !uuid(value.farm.id) ||
    !isFarm(value.farm) ||
    !(value.processed_by_id === null || uuid(value.processed_by_id))
  )
    return false;
  const actor = value.processed_by_id;
  if (!isRequest(value) || (value.status === "pending" && actor !== null)) return false;
  return value.items.every(
    (item: unknown) =>
      isApiObject(item) &&
      uuid(item.source_id) &&
      integer(item.source_generation, 1) &&
      integer(item.source_version, 1) &&
      (value.status === "approved" ? uuid(item.stock_batch_id) : item.stock_batch_id === null),
  );
}

function data<T>(envelope: Envelope, validate: Predicate<T>) {
  if (!validate(envelope.data)) throw invalidApiResponse();
  return envelope.data;
}

function list<T>(envelope: Envelope, validate: Predicate<T>, requestedPage: number) {
  const { data, meta } = envelope;
  if (
    !Array.isArray(data) ||
    !data.every(validate) ||
    !isApiObject(meta) ||
    meta.page !== requestedPage ||
    meta.page_size !== 20 ||
    !integer(meta.total, 0) ||
    data.length > meta.page_size ||
    data.length > meta.total
  )
    throw invalidApiResponse();
  const pagination: PaginationMeta = {
    page: requestedPage,
    page_size: meta.page_size,
    total: meta.total,
  };
  return { data, meta: pagination };
}

function mutation<T>(envelope: Envelope, validate: Predicate<T>) {
  if (!isApiObject(envelope.meta) || typeof envelope.meta.idempotent_replay !== "boolean")
    throw invalidApiResponse();
  return {
    data: data(envelope, validate),
    meta: { idempotent_replay: envelope.meta.idempotent_replay },
  };
}

function pathWithQuery(path: string, query: AdminQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `${path}?${params}` : path;
}

function resourcePath(path: string, id: string) {
  if (!uuid(id)) throw invalidApiResponse();
  return `${path}/${id.toLowerCase()}`;
}

async function farmerEnvelope(
  token: string,
  path: string,
  signal?: AbortSignal,
  payload?: SupplySubmitPayload,
): Promise<Envelope> {
  if (!FARM_TOKEN.test(token))
    throw Object.assign(new Error("invalid_farm_token"), { status: 403 });
  let response: Response;
  let body: unknown;
  try {
    signal?.throwIfAborted();
    response = await fetch(`/api/farmer/${path}`, {
      method: payload ? "POST" : "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: {
        "X-Farm-Token": token,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal,
    });
    if (
      response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() ===
      "application/json"
    ) {
      try {
        body = await response.json();
      } catch (cause) {
        if (!(cause instanceof SyntaxError)) throw cause;
      }
    }
    signal?.throwIfAborted();
  } catch (cause) {
    if (isRequestCanceled(cause, signal)) throw cause;
    throw new Error(isNativeRequestTimeout(cause) ? "request_timeout" : "network_error");
  }
  if (!response.ok) {
    const errors = isApiObject(body) ? body : {};
    const entry = Array.isArray(errors.errors) ? errors.errors[0] : undefined;
    const backendCode = isApiObject(entry) ? entry.code : undefined;
    const code =
      typeof backendCode === "string" && /^[a-z_]+$/u.test(backendCode)
        ? backendCode
        : response.status === 400
          ? "validation_error"
          : "request_failed";
    const fields = code === "validation_error" ? errors : undefined;
    throw Object.assign(new Error(code), {
      status: response.status,
      field: firstValidationField(fields),
      payload: {
        errors: [{ code, context: isApiObject(entry) ? entry.context : undefined, fields }],
      },
    });
  }
  if (!isApiObject(body) || !Object.hasOwn(body, "data")) throw invalidApiResponse(response.status);
  return { data: body.data, meta: body.meta };
}

export async function farmerFarm(token: string, signal?: AbortSignal) {
  return data(await farmerEnvelope(token, "farm", signal), isFarm);
}

export async function farmerProducts(token: string, query: ProductQuery, signal?: AbortSignal) {
  return list(
    await farmerEnvelope(token, pathWithQuery("products", query), signal),
    isFarmerProduct,
    query.page ?? 1,
  );
}

export async function farmerRequests(token: string, query: PageQuery, signal?: AbortSignal) {
  return list(
    await farmerEnvelope(token, pathWithQuery(farmerRequestsPath, query), signal),
    isRequest,
    query.page ?? 1,
  );
}

export async function farmerRequest(token: string, id: string, signal?: AbortSignal) {
  const entry = data(
    await farmerEnvelope(token, resourcePath(farmerRequestsPath, id), signal),
    isRequest,
  );
  if (!matchesId(entry.id, id)) throw invalidApiResponse();
  return entry;
}

export async function submitFarmerRequest(
  token: string,
  payload: SupplySubmitPayload,
  signal?: AbortSignal,
) {
  const result = mutation(
    await farmerEnvelope(token, farmerRequestsPath, signal, payload),
    isRequest,
  );
  const expected = new Map(
    payload.items.map((item) => [item.product_id.toLowerCase(), item.quantity_units]),
  );
  if (
    result.data.start_date !== payload.start_date ||
    result.data.end_date !== payload.end_date ||
    result.data.items.length !== expected.size ||
    result.data.items.some(
      (item) => expected.get(item.product_id.toLowerCase()) !== item.quantity_units,
    ) ||
    (!result.meta.idempotent_replay && result.data.status !== "pending")
  )
    throw invalidApiResponse();
  return result;
}

export async function adminSupplyRequests(query: AdminQuery, signal?: AbortSignal) {
  const result = list(
    await apiEnvelope<unknown>(pathWithQuery(adminRequestsPath, query), { signal }),
    isAdminRequest,
    query.page ?? 1,
  );
  if (
    result.data.some(
      (row) =>
        (query.farm_id && !matchesId(row.farm.id, query.farm_id)) ||
        (query.status && row.status !== query.status),
    )
  )
    throw invalidApiResponse();
  return result;
}

export async function adminSupplyRequest(id: string, signal?: AbortSignal) {
  const entry = data(
    await apiEnvelope<unknown>(resourcePath(adminRequestsPath, id), { signal }),
    isAdminRequest,
  );
  if (!matchesId(entry.id, id)) throw invalidApiResponse();
  return entry;
}

export async function decideSupplyRequest(
  id: string,
  action: "approve" | "reject",
  payload: { idempotency_key: string; reason?: string },
  signal?: AbortSignal,
) {
  const envelope = await apiEnvelope<unknown>(`${resourcePath(adminRequestsPath, id)}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
  const result = mutation(envelope, isAdminRequest);
  if (
    !matchesId(result.data.id, id) ||
    result.data.status !== (action === "approve" ? "approved" : "rejected") ||
    (action === "reject" && result.data.rejection_reason !== payload.reason?.trim())
  )
    throw invalidApiResponse();
  return result;
}

export async function farmerLink(
  farmId: string,
  action: "read" | "create" | "rotate",
  signal?: AbortSignal,
) {
  const path = `${resourcePath("admin/farms", farmId)}/farmer-link${action === "rotate" ? "/rotate" : ""}`;
  const { data: link } = await apiEnvelope<unknown>(
    path,
    action === "read" ? { signal } : { method: "POST", body: "{}", signal },
  );
  if (
    !isApiObject(link) ||
    !uuid(link.farm_id) ||
    !matchesId(link.farm_id, farmId) ||
    typeof link.url !== "string" ||
    !link.url.startsWith("/farmer#token=") ||
    !FARM_TOKEN.test(link.url.slice("/farmer#token=".length))
  )
    throw invalidApiResponse();
  return { farm_id: link.farm_id, url: link.url } satisfies FarmerLink;
}
