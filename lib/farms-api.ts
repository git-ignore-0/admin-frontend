import { isoDateToAdminInput } from "@/lib/admin-date";
import { requirePaginatedList, requireResponseEntity } from "@/lib/api-response";
import { requireCreationReceipt } from "@/lib/creation-receipt";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import { MAX_POSITIVE_INTEGER, parsePositiveDecimal } from "@/lib/numeric-input";
import { api, apiEnvelope, type ApiEnvelope } from "@/lib/client-api";
import { farmProductHistoryActions, farmSupplyStatuses, stockBatchStatuses } from "@/lib/types";
import type {
  Farm,
  AvailableFarmProduct,
  FarmBatchScope,
  FarmDeleteCapability,
  FarmDeleteReason,
  FarmProduct,
  FarmProductDetail,
  FarmProductHistoryEntry,
  FarmSourceBlocker,
  FarmStockBatch,
  FarmSupplyFilter,
  FarmSupplyStatus,
  MediaAsset,
  PaginationMeta,
  ProductStatus,
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
  | "contact_phone"
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
    requirePaginatedList(payload, (row) => requireFarm(row), query.page ?? 1),
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

function isFarmDeleteReason(value: unknown): value is FarmDeleteReason {
  if (!isApiObject(value) || !uuid(value.id) || !nonempty(value.label)) return false;
  if (value.code === "store_order" || value.code === "farm_supply_request") return true;
  return (
    (value.code === "supplying_product" || value.code === "legacy_supply") &&
    typeof value.name_vi === "string" &&
    typeof value.name_en === "string"
  );
}

export function parseFarmDeleteReasons(value: unknown): FarmDeleteReason[] | undefined {
  if (!Array.isArray(value) || value.length > 3) return;
  const reasons: FarmDeleteReason[] = [];
  for (const reason of value) {
    if (!isFarmDeleteReason(reason) || reasons.some(({ code }) => code === reason.code)) return;
    reasons.push(reason);
  }
  return reasons;
}

export function farmDeleteCapability(capabilities: unknown): FarmDeleteCapability | undefined {
  if (!isApiObject(capabilities) || !isApiObject(capabilities.delete)) return;
  const { allowed } = capabilities.delete;
  const reasons = parseFarmDeleteReasons(capabilities.delete.reasons);
  if (typeof allowed !== "boolean" || !reasons || allowed !== (reasons.length === 0)) return;
  return { allowed, reasons };
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

function requireFarm(data: Farm, id?: string): Farm {
  requireResponseEntity(data);
  if (
    !uuid(data.id, id) ||
    !integer(data.version, 1) ||
    typeof data.is_active !== "boolean" ||
    typeof data.contact_phone !== "string" ||
    (data.contact_phone !== "" && !/^0[1-9][0-9]{8,9}$/.test(data.contact_phone)) ||
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
  const { capabilities, ...farm } = data;
  const deletion = farmDeleteCapability(capabilities);
  return deletion ? { ...farm, capabilities: { delete: deletion } } : farm;
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
    productStatus,
  }: FarmPageQuery & {
    supplyStatus?: FarmSupplyFilter;
    productStatus?: ProductStatus;
  } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(page), supply_status: supplyStatus });
  if (search) params.set("search", search);
  if (productStatus) params.set("product_status", productStatus);
  return apiEnvelope<FarmProduct[], PaginationMeta>(`${supplyPath(farmId)}?${params}`, {
    signal,
  }).then((payload) => {
    const result = requireFarmPage(payload, page, 20, (data) => {
      requireFarmProduct(data, farmId);
      if (supplyStatus !== "all" && data.supply_status !== supplyStatus) throw invalidApiResponse();
      if (productStatus && data.product_status !== productStatus) throw invalidApiResponse();
    });
    if (productStatus) {
      const { data, meta } = result;
      const expectedLength = Math.min(
        meta.page_size,
        Math.max(0, meta.total - (page - 1) * meta.page_size),
      );
      if (
        data.length !== expectedLength ||
        new Set(data.map((row) => row.product_id.toLowerCase())).size !== data.length
      ) {
        throw invalidApiResponse();
      }
    }
    return result;
  });
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

export type FarmProductLinkIntent = Readonly<{
  idempotency_key: string;
  product_ids: readonly string[];
}>;

export type FarmProductReaddIntent = Readonly<{
  idempotency_key: string;
  expected_link_id: string;
  expected_version: number;
  previous_generation: number;
}>;

export const MAX_FARM_PRODUCT_LINKS = 50;

function creationReceiptPath(path: string, key: string) {
  return `${path}?${new URLSearchParams({ creation_key: key })}`;
}

function verifyFarmCreationReceipt(
  meta: unknown,
  key: string,
  action: Parameters<typeof requireCreationReceipt>[2],
  resourceId: string,
  recovery: boolean,
) {
  if (
    !uuid(requireCreationReceipt(meta, key, action), resourceId) ||
    !isApiObject(meta) ||
    typeof meta.idempotent_replay !== "boolean" ||
    (recovery && !meta.idempotent_replay)
  ) {
    throw invalidApiResponse();
  }
  return meta.idempotent_replay;
}

function requireLinkReceipt(
  { data, meta }: ApiEnvelope<unknown>,
  farmId: string,
  intent: FarmProductLinkIntent,
  recovery: boolean,
) {
  const replay = verifyFarmCreationReceipt(
    meta,
    intent.idempotency_key,
    "link_farm_products",
    farmId,
    recovery,
  );
  if (
    !isApiObject(data) ||
    !uuid(data.farm_id, farmId) ||
    !integer(data.created_count, 1) ||
    data.created_count !== intent.product_ids.length
  )
    throw invalidApiResponse();
  return { farm_id: data.farm_id, created_count: data.created_count, idempotent_replay: replay };
}

export function linkFarmProducts(farmId: string, intent: FarmProductLinkIntent) {
  return apiEnvelope<unknown>(`${supplyPath(farmId)}/bulk`, {
    method: "POST",
    body: JSON.stringify(intent),
  }).then((payload) => requireLinkReceipt(payload, farmId, intent, false));
}

export function recoverFarmProductLinking(farmId: string, intent: FarmProductLinkIntent) {
  return apiEnvelope<unknown>(
    creationReceiptPath(`${supplyPath(farmId)}/bulk`, intent.idempotency_key),
  ).then((payload) => requireLinkReceipt(payload, farmId, intent, true));
}

function requireReaddReceipt(
  { data, meta }: ApiEnvelope<FarmProduct | null | undefined>,
  farmId: string,
  productId: string,
  intent: FarmProductReaddIntent,
  recovery: boolean,
) {
  verifyFarmCreationReceipt(
    meta,
    intent.idempotency_key,
    "readd_farm_product",
    intent.expected_link_id,
    recovery,
  );
  if (data === null) return null;
  if (!data) throw invalidApiResponse();
  const source = requireFarmProduct(data, farmId, productId);
  if (
    !uuid(source.id, intent.expected_link_id) ||
    source.version <= intent.expected_version ||
    source.supply_generation <= intent.previous_generation
  )
    throw invalidApiResponse();
  return source;
}

export function readdFarmProduct(
  farmId: string,
  productId: string,
  intent: FarmProductReaddIntent,
) {
  const { expected_link_id, expected_version, idempotency_key } = intent;
  return apiEnvelope<FarmProduct>(
    `${sourcePath(farmId, productId)}/re-add`,
    {
      method: "POST",
      body: JSON.stringify({ expected_link_id, expected_version, idempotency_key }),
    },
    { allowMissingData: true },
  ).then((payload) => requireReaddReceipt(payload, farmId, productId, intent, false));
}

export function recoverFarmProductReadd(
  farmId: string,
  productId: string,
  intent: FarmProductReaddIntent,
) {
  return apiEnvelope<FarmProduct>(
    creationReceiptPath(`${sourcePath(farmId, productId)}/re-add`, intent.idempotency_key),
    undefined,
    { allowMissingData: true },
  ).then((payload) => requireReaddReceipt(payload, farmId, productId, intent, true));
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

function requireFarmTracker(data: TrackerFarm, farmId: string) {
  requireResponseEntity(data, farmId);
  if (
    !uuid(data.id) ||
    !integer(data.version, 1) ||
    !integer(data.signup_count) ||
    (data.one_month_signup_count !== undefined && !integer(data.one_month_signup_count)) ||
    typeof data.is_visible !== "boolean"
  )
    throw invalidApiResponse();
  return data;
}

export function getFarmTracker(farmId: string, signal?: AbortSignal) {
  return api<TrackerFarm>(`admin/farms/${farmId}/growth-tracker`, { signal }).then((row) =>
    requireFarmTracker(row, farmId),
  );
}

export function enableFarmTracker(
  farmId: string,
  payload: { signup_count: number; one_month_signup_count: number; is_visible?: boolean },
) {
  return api<TrackerFarm>(`admin/farms/${farmId}/growth-tracker`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((row) => requireFarmTracker(row, farmId));
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
  }).then((row) => requireFarmTracker(row, farmId));
}

export type FarmBulkIntent = Readonly<{
  idempotency_key: string;
  start_date: string;
  end_date: string;
  items: ReadonlyArray<
    Readonly<{
      product_id: string;
      expected_link_id: string;
      expected_version: number;
      quantity_units: number;
    }>
  >;
}>;

function bulkSupplyPath(farmId: string) {
  return `admin/farms/${farmId}/stock-batches/bulk`;
}

function requireBulkReceipt(
  { data, meta }: ApiEnvelope<unknown>,
  farmId: string,
  intent: FarmBulkIntent,
  recovery: boolean,
) {
  const replay = verifyFarmCreationReceipt(
    meta,
    intent.idempotency_key,
    "create_farm_stock_batches",
    farmId,
    recovery,
  );
  if (
    !isApiObject(data) ||
    !uuid(data.farm_id, farmId) ||
    !integer(data.created_count, 1) ||
    data.created_count !== intent.items.length
  )
    throw invalidApiResponse();
  return {
    farm_id: data.farm_id,
    created_count: data.created_count,
    idempotent_replay: replay,
  };
}

export function postFarmBulkSupply(farmId: string, intent: FarmBulkIntent) {
  return apiEnvelope<unknown>(bulkSupplyPath(farmId), {
    method: "POST",
    body: JSON.stringify(intent),
  }).then((payload) => requireBulkReceipt(payload, farmId, intent, false));
}

export function recoverFarmBulkSupply(
  farmId: string,
  intent: FarmBulkIntent,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ creation_key: intent.idempotency_key });
  return apiEnvelope<unknown>(`${bulkSupplyPath(farmId)}?${query}`, { signal }).then((payload) =>
    requireBulkReceipt(payload, farmId, intent, true),
  );
}
