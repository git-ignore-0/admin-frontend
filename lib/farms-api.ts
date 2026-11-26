import { isoDateToAdminInput } from "@/lib/admin-date";
import { requirePaginatedList, requireResponseEntity } from "@/lib/api-response";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import { MAX_POSITIVE_INTEGER, parsePositiveDecimal } from "@/lib/numeric-input";
import { api, apiEnvelope, type ApiEnvelope } from "@/lib/client-api";
import { farmProductHistoryActions, farmSupplyStatuses, stockBatchStatuses } from "@/lib/types";
import type {
  Farm,
  AvailableFarmProduct,
  FarmBatchScope,
  FarmProduct,
  FarmProductDetail,
  FarmProductHistoryEntry,
  FarmProductWithFirstBatch,
  FarmSourceBlocker,
  FarmStockBatch,
  FarmSupplyFilter,
  FarmSupplyStatus,
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

const farmIdentityFields = ["name_vi", "name_en", "location_vi", "location_en"] as const;

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
  return api<Farm>(`admin/farms/${id}`, { signal }).then((data) => requireFarm(data, id));
}

export function saveFarm(id: string | undefined, payload: Partial<FarmInput>) {
  return api<Farm>(id ? `admin/farms/${id}` : "admin/farms", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  }).then((data) => {
    const farm = requireFarm(data, id);
    const incompleteIdentity = farmIdentityFields.some(
      (field) => (id === undefined || payload[field] !== undefined) && !nonempty(farm[field]),
    );
    if (
      incompleteIdentity ||
      (id && (payload.version === undefined || farm.version <= payload.version))
    ) {
      throw invalidApiResponse();
    }
    return farm;
  });
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

function uuid(value: unknown, expected?: string): value is string {
  return (
    typeof value === "string" &&
    UUID_PATH_SEGMENT.test(value) &&
    (expected === undefined || value.toLowerCase() === expected.toLowerCase())
  );
}

function integer(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isImageSource(value: unknown): boolean {
  return (
    isApiObject(value) && nonempty(value.url) && integer(value.width, 1) && integer(value.height, 1)
  );
}

function isFarmImage(value: unknown): boolean {
  return (
    isApiObject(value) &&
    uuid(value.id) &&
    isImageSource(value) &&
    Array.isArray(value.variants) &&
    value.variants.every(isImageSource)
  );
}

function requireFarm(data: Farm, id?: string) {
  requireResponseEntity(data);
  if (
    !uuid(data.id, id) ||
    !integer(data.version, 1) ||
    typeof data.is_active !== "boolean" ||
    !farmIdentityFields.every((field) => typeof data[field] === "string") ||
    ![data.description_vi, data.description_en].every((value) => typeof value === "string") ||
    ![data.in_stock_product_count, data.out_of_stock_product_count].every((value) =>
      integer(value),
    ) ||
    ![data.created_at, data.updated_at].every(
      (value) => typeof value === "string" && Number.isFinite(Date.parse(value)),
    ) ||
    !(data.image === null || isFarmImage(data.image)) ||
    !Array.isArray(data.photos) ||
    data.photos.length > 12 ||
    !data.photos.every(isFarmImage) ||
    new Set(data.photos.map((photo) => photo.id.toLowerCase())).size !== data.photos.length
  ) {
    throw invalidApiResponse();
  }
  return data;
}

function day(value: unknown): boolean {
  return typeof value === "string" && Boolean(isoDateToAdminInput(value));
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    day(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}

function requireAvailableFarmProduct(data: AvailableFarmProduct) {
  requireResponseEntity(data);
  if (
    !uuid(data.id) ||
    ![data.sku, data.name_vi, data.name_en, data.unit_label_vi, data.unit_label_en].every(
      nonempty,
    ) ||
    typeof data.unit_size !== "string" ||
    parsePositiveDecimal(data.unit_size).error
  ) {
    throw invalidApiResponse();
  }
}

function requireFarmProduct<T extends FarmProduct>(data: T, farmId: string, productId?: string) {
  requireAvailableFarmProduct(data);
  if (
    !uuid(data.farm_id, farmId) ||
    !uuid(data.product_id, productId) ||
    !["draft", "active", "discontinued"].includes(data.product_status) ||
    !farmSupplyStatuses.includes(data.supply_status) ||
    data.is_active !== (data.supply_status === "supplying") ||
    (data.supply_status === "removed" ? !timestamp(data.removed_at) : data.removed_at !== null) ||
    !integer(data.version, 1) ||
    !integer(data.supply_generation, 1) ||
    typeof data.has_supply_history !== "boolean" ||
    ![
      data.initial_quantity,
      data.net_sold_quantity,
      data.available_quantity,
      data.batch_count,
      data.active_batch_count,
    ].every((value) => integer(value)) ||
    data.active_batch_count > data.batch_count ||
    !(data.next_expiry_date === null || day(data.next_expiry_date))
  ) {
    throw invalidApiResponse();
  }
  return data;
}

function isBlockerOrder(value: unknown): value is { id: string; reference_code: string } {
  return isApiObject(value) && uuid(value.id) && nonempty(value.reference_code);
}

export function parseFarmSourceBlocker(value: unknown): FarmSourceBlocker | undefined {
  if (!isApiObject(value) || !nonempty(value.code)) return undefined;
  const { code, context } = value;
  if (code === "farm_product_has_open_allocations") {
    if (
      !isApiObject(context) ||
      !Array.isArray(context.orders) ||
      context.orders.length === 0 ||
      context.orders.length > 3 ||
      !context.orders.every(isBlockerOrder) ||
      typeof context.has_more !== "boolean"
    )
      return undefined;
    const orders = context.orders.map(({ id, reference_code }) => ({ id, reference_code }));
    return { code, context: { orders, has_more: context.has_more } };
  }
  if (code === "farm_product_supply_shortfall") {
    if (!isApiObject(context)) return undefined;
    const { required_units, remaining_units, shortfall_units } = context;
    if (!integer(required_units, 1) || !integer(remaining_units) || !integer(shortfall_units, 1))
      return undefined;
    return { code, context: { required_units, remaining_units, shortfall_units } };
  }
  if (context === undefined) return { code };
  if (
    (code === "farm_product_removed" || code === "product_already_linked") &&
    isApiObject(context) &&
    uuid(context.source_id) &&
    integer(context.version, 1)
  ) {
    return { code, context: { source_id: context.source_id, version: context.version } };
  }
  return undefined;
}

const capabilityActions = [
  ["can_remove", "remove"],
  ["can_readd", "readd"],
  ["can_create_batch", "create_batch"],
] as const;

function requireSourceCapabilities({ capabilities }: FarmProductDetail) {
  if (!isApiObject(capabilities) || !isApiObject(capabilities.blockers)) {
    throw invalidApiResponse();
  }
  for (const [capability, action] of capabilityActions) {
    const allowed = capabilities[capability];
    const blocker = capabilities.blockers[action];
    if (
      typeof allowed !== "boolean" ||
      (allowed ? blocker !== undefined : !parseFarmSourceBlocker(blocker))
    )
      throw invalidApiResponse();
  }
}

function requireSourceHistory(data: FarmProductHistoryEntry, farmId: string, productId: string) {
  requireResponseEntity(data);
  if (
    !uuid(data.id) ||
    !farmProductHistoryActions.includes(data.action) ||
    !timestamp(data.created_at) ||
    !(
      data.actor === null ||
      (isApiObject(data.actor) && uuid(data.actor.id) && typeof data.actor.name === "string")
    ) ||
    !isApiObject(data.context)
  )
    throw invalidApiResponse();

  const {
    farm_id,
    product_id,
    stock_batch_id,
    supply_generation,
    is_active,
    provenance,
    classified_at,
  } = data.context;
  if (
    (farm_id !== undefined && !uuid(farm_id, farmId)) ||
    (product_id !== undefined && !uuid(product_id, productId)) ||
    (stock_batch_id !== undefined && !uuid(stock_batch_id)) ||
    (supply_generation !== undefined && !integer(supply_generation, 1)) ||
    (is_active !== undefined && typeof is_active !== "boolean") ||
    (provenance !== undefined && provenance !== "legacy_disabled_link") ||
    (classified_at !== undefined && !timestamp(classified_at))
  )
    throw invalidApiResponse();
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
    data.quantity_units > MAX_POSITIVE_INTEGER ||
    !integer(data.version, 1) ||
    !integer(data.source_version, 1) ||
    !integer(data.supply_generation, 1) ||
    typeof data.is_historical !== "boolean" ||
    ![data.net_sold_quantity, data.remaining_quantity, data.available_quantity].every((value) =>
      integer(value),
    ) ||
    !stockBatchStatuses.includes(data.status) ||
    ((data.is_historical || data.status !== "active") && data.available_quantity !== 0) ||
    ![data.created_at, data.updated_at].every(timestamp)
  )
    throw invalidApiResponse();
  return data;
}

function requireFarmPage<T>(
  payload: ApiEnvelope<T[], PaginationMeta>,
  page: number,
  pageSize: number,
  validate: (record: T) => void,
) {
  const verified = requirePaginatedList(payload, validate);
  if (
    verified.meta.page !== page ||
    verified.meta.page_size !== pageSize ||
    verified.data.length > pageSize
  ) {
    throw invalidApiResponse();
  }
  return verified;
}

function supplyPath(farmId: string) {
  return `admin/farms/${farmId}/products`;
}

function sourcePath(farmId: string, productId: string) {
  return `${supplyPath(farmId)}/${productId}`;
}

type FarmPageQuery = { page?: number; search?: string };

export function listFarmProducts(
  farmId: string,
  {
    page = 1,
    search,
    supplyStatus = "supplying",
  }: FarmPageQuery & {
    supplyStatus?: FarmSupplyFilter;
  } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(page), supply_status: supplyStatus });
  if (search) params.set("search", search);
  return apiEnvelope<FarmProduct[], PaginationMeta>(`${supplyPath(farmId)}?${params}`, {
    signal,
  }).then((payload) =>
    requireFarmPage(payload, page, 20, (data) => {
      requireFarmProduct(data, farmId);
      if (supplyStatus !== "all" && data.supply_status !== supplyStatus) throw invalidApiResponse();
    }),
  );
}

export function listAvailableFarmProducts(
  farmId: string,
  { page = 1, search }: FarmPageQuery = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set("search", search);
  return apiEnvelope<AvailableFarmProduct[], PaginationMeta>(
    `admin/farms/${farmId}/available-products?${params}`,
    { signal },
  ).then((payload) => requireFarmPage(payload, page, 30, requireAvailableFarmProduct));
}

export function getFarmProduct(farmId: string, productId: string, signal?: AbortSignal) {
  return api<FarmProductDetail>(sourcePath(farmId, productId), { signal }).then((data) => {
    requireFarmProduct(data, farmId, productId);
    requireSourceCapabilities(data);
    return data;
  });
}

export function listFarmProductHistory(
  farmId: string,
  productId: string,
  { page = 1 }: { page?: number } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(page) });
  return apiEnvelope<FarmProductHistoryEntry[], PaginationMeta>(
    `${sourcePath(farmId, productId)}/history?${params}`,
    { signal },
  ).then((payload) =>
    requireFarmPage(payload, page, 20, (data) => {
      requireSourceHistory(data, farmId, productId);
    }),
  );
}

type SourceRevision = Pick<FarmProduct, "id" | "version" | "supply_generation">;

function expectedSource(source: SourceRevision) {
  return { expected_link_id: source.id, expected_version: source.version };
}

function requireSourceTransition(
  data: FarmProduct,
  source: SourceRevision,
  status: FarmSupplyStatus,
  supplyGeneration: number,
) {
  if (
    !uuid(data.id, source.id) ||
    data.version !== source.version + 1 ||
    data.supply_generation !== supplyGeneration ||
    data.supply_status !== status
  )
    throw invalidApiResponse();
}

function requireFirstBatch(data: FarmProductWithFirstBatch) {
  if (!uuid(data.first_batch_id)) throw invalidApiResponse();
}

export function addFarmProduct(farmId: string, productId: string, batch: StockBatchInput) {
  return api<FarmProductWithFirstBatch>(supplyPath(farmId), {
    method: "POST",
    body: JSON.stringify({ product_id: productId, ...batch }),
  }).then((data) => {
    requireFarmProduct(data, farmId, productId);
    requireFirstBatch(data);
    if (
      data.supply_status !== "supplying" ||
      data.product_status !== "active" ||
      data.supply_generation !== 1 ||
      data.version !== 1
    )
      throw invalidApiResponse();
    return data;
  });
}

export function removeFarmProduct(farmId: string, productId: string, source: SourceRevision) {
  return api<FarmProduct>(`${sourcePath(farmId, productId)}/remove`, {
    method: "POST",
    body: JSON.stringify(expectedSource(source)),
  }).then((data) => {
    requireFarmProduct(data, farmId, productId);
    requireSourceTransition(data, source, "removed", source.supply_generation);
    return data;
  });
}

export function readdFarmProduct(
  farmId: string,
  productId: string,
  source: SourceRevision,
  batch: StockBatchInput,
) {
  return api<FarmProductWithFirstBatch>(`${sourcePath(farmId, productId)}/re-add`, {
    method: "POST",
    body: JSON.stringify({ ...expectedSource(source), ...batch }),
  }).then((data) => {
    requireFarmProduct(data, farmId, productId);
    requireFirstBatch(data);
    requireSourceTransition(data, source, "supplying", source.supply_generation + 1);
    if (data.product_status !== "active") throw invalidApiResponse();
    return data;
  });
}

type BatchListSource = SourceRevision & Pick<FarmProduct, "supply_status">;

export function listFarmStockBatches(
  farmId: string,
  productId: string,
  {
    page = 1,
    status,
    scope = "all",
  }: { page?: number; status?: StockBatchStatus; scope?: FarmBatchScope },
  { signal, source }: { signal?: AbortSignal; source: BatchListSource },
) {
  const params = new URLSearchParams({ page: String(page), scope });
  if (status) params.set("status", status);
  return apiEnvelope<FarmStockBatch[], PaginationMeta>(
    `${sourcePath(farmId, productId)}/batches?${params}`,
    { signal },
  ).then((payload) =>
    requireFarmPage(payload, page, 20, (data) => {
      requireStockBatch(data, source.id);
      if (
        (status && data.status !== status) ||
        (scope === "current" && data.is_historical) ||
        (scope === "history" && !data.is_historical)
      )
        throw invalidApiResponse();
      if (
        data.supply_generation > source.supply_generation ||
        data.is_historical !==
          (source.supply_status === "removed" ||
            data.supply_generation !== source.supply_generation) ||
        data.source_version < source.version
      )
        throw invalidApiResponse();
    }),
  );
}

function validateBatchMutation(
  data: FarmStockBatch,
  source: SourceRevision,
  version: number,
  values?: Partial<StockBatchInput>,
) {
  if (
    data.version !== version ||
    data.supply_generation !== source.supply_generation ||
    data.is_historical ||
    data.source_version < source.version ||
    stockInputFields.some((key) => values?.[key] !== undefined && data[key] !== values[key])
  )
    throw invalidApiResponse();
}

const stockInputFields = ["start_date", "end_date", "quantity_units"] as const;

export function createFarmStockBatch(
  farmId: string,
  productId: string,
  batch: StockBatchInput,
  source: SourceRevision,
) {
  return api<FarmStockBatch>(`${sourcePath(farmId, productId)}/batches`, {
    method: "POST",
    body: JSON.stringify({ ...expectedSource(source), ...batch }),
  }).then((data) => {
    requireStockBatch(data, source.id);
    validateBatchMutation(data, source, 1, batch);
    if (data.source_version !== source.version + 1 || data.status === "cancelled") {
      throw invalidApiResponse();
    }
    return data;
  });
}

export function updateFarmStockBatch(
  farmId: string,
  productId: string,
  batchId: string,
  payload: Partial<StockBatchInput> & { version: number },
  source: SourceRevision,
) {
  return api<FarmStockBatch>(`${sourcePath(farmId, productId)}/batches/${batchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then((data) => {
    requireStockBatch(data, source.id, batchId);
    validateBatchMutation(data, source, payload.version + 1, payload);
    if (data.status === "cancelled") throw invalidApiResponse();
    return data;
  });
}

export function cancelFarmStockBatch(
  farmId: string,
  productId: string,
  batchId: string,
  version: number,
  source: SourceRevision,
) {
  return api<FarmStockBatch>(`${sourcePath(farmId, productId)}/batches/${batchId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ version }),
  }).then((data) => {
    requireStockBatch(data, source.id, batchId);
    validateBatchMutation(data, source, version + 1);
    if (data.status !== "cancelled") throw invalidApiResponse();
    return data;
  });
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
