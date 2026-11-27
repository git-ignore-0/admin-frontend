import { isoDateToAdminInput, membershipLastReceiptDate } from "@/lib/admin-date";
import { requirePaginatedList, requireResponseEntity } from "@/lib/api-response";
import type { PaginationMeta, StoreOrder } from "@/lib/types";
import { api, apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import { formatMembershipUnits } from "@/lib/membership-format";
import type { AdminLocale } from "@/lib/admin-i18n";
import { couponDateTimeInput, couponDateTimeToApi } from "@/lib/csa-coupons";
import { requireCreationReceipt } from "@/lib/creation-receipt";

export const csaRoundStatuses = [
  "draft",
  "scheduled",
  "open",
  "closed",
  "delivery",
  "cancelled",
] as const;
export type CSARoundStatus = (typeof csaRoundStatuses)[number];
export type CSASelectionState =
  "selecting" | "locked" | "reselecting" | "confirmed" | "cancelled" | "delivered";
export type CSARound = {
  id: string;
  sequence: number;
  name: string;
  opens_at: string;
  closes_at: string;
  delivery_date: string;
  status: CSARoundStatus;
  server_time: string;
  cancellation_reason?: string | null;
  cancelled_by_id?: string | null;
};
export type CSARecurrenceMode = "draft" | "auto";
export type CSARecurrenceStatus = "pending" | "active" | "stopped";
export type CSARecurrence = {
  root_round_id: string;
  configuration_name?: string;
  mode: CSARecurrenceMode;
  status: CSARecurrenceStatus;
  next_create_at: string | null;
  occurrence_count: number;
};
export type AdminCSARound = CSARound & {
  version: number;
  can_edit: boolean;
  recurrence: CSARecurrence | null;
  configuration_id: string;
  configuration_name: string;
};
export type CSARoundConfigurationType = "standalone" | "weekly";
export const csaConfigurationStatuses = ["draft", "published", "cancelled"] as const;
export type CSAConfigurationStatus = (typeof csaConfigurationStatuses)[number];
export type CSARoundConfigurationSummary = {
  id: string;
  name: string;
  type: CSARoundConfigurationType;
  status: CSAConfigurationStatus;
  created_at: string;
};
export type CSARoundConfiguration = CSARoundConfigurationSummary &
  RoundDates & {
    version: number;
    recurrence_mode: CSARecurrenceMode | null;
    published_at: string | null;
  };
export type CSARoundOccurrence = AdminCSARound & { participant_count: number };
export type CSASelection = {
  id: string;
  round_id: string;
  membership_id: string;
  state: CSASelectionState;
  revision: number;
  order_id: string | null;
  reopen_until: string | null;
  server_time: string;
  customer_id?: string;
  customer_name?: string;
  lines: {
    product_id: string;
    quantity: number;
    name: string;
    unit_size: string;
    unit_label: string;
    quota_cost: string;
  }[];
};
export type CSASelectionEvent = {
  id?: string;
  action: string;
  actor_id: string | null;
  created_at: string;
  context: {
    deadline?: string;
    reason?: string;
    revision?: number;
    lines?: { name: string; quantity: number; unit_size?: string; unit_label: string }[];
  };
};
export type RoundPage<T> = { data: T[]; meta: PaginationMeta };
export type RoundDates = Pick<CSARound, "opens_at" | "closes_at" | "delivery_date">;
export type RoundParticipants = {
  data: CSASelection[];
  meta: PaginationMeta;
  demand: {
    product_id: string;
    quantity: number;
    name: string;
    unit_size: string;
    unit_label: string;
  }[];
};
export const roundDateInput = couponDateTimeInput;
export const roundDateToApi = couponDateTimeToApi;
/** Deadline boundary only: a delivery date is never a scheduled delivery time. */
export function csaDeliveryStartMs(deliveryDate: string) {
  return isoDateToAdminInput(deliveryDate)
    ? Date.parse(`${deliveryDate}T00:00:00+07:00`)
    : Number.NaN;
}

export function csaDeadlineInputMax(deliveryDate: string) {
  if (!isoDateToAdminInput(deliveryDate)) return undefined;
  const previous = membershipLastReceiptDate(deliveryDate);
  return previous ? `${previous}T23:59` : undefined;
}

export function validateRoundDates(dates: RoundDates) {
  const a = Date.parse(dates.opens_at),
    b = Date.parse(dates.closes_at),
    c = csaDeliveryStartMs(dates.delivery_date);
  return ![a, b, c].every(Number.isFinite) || !(a < b && b < c) ? "schedule" : null;
}
export function validateReopenDeadline(deadline: string, deliveryDate: string, serverNow: number) {
  const end = Date.parse(deadline);
  return Number.isFinite(end) && serverNow < end && end < csaDeliveryStartMs(deliveryDate);
}

export function csaOrderReopenUntil(order: StoreOrder, selectionId: string, deliveryDate: string) {
  const selected = order.csa?.selection;
  if (
    order.status !== "pending_review" ||
    order.approved_at ||
    order.csa?.round.status === "cancelled" ||
    selected?.id !== selectionId ||
    !["locked", "confirmed", "reselecting"].includes(selected.state)
  ) {
    return null;
  }
  const until = Math.min(
    csaDeliveryStartMs(order.csa?.round.delivery_date ?? deliveryDate),
    selected.state === "reselecting" ? Date.parse(selected.reopen_until ?? "") : Infinity,
  );
  return Date.parse(order.server_time) < until ? until : null;
}
export function getRound(id: string, signal?: AbortSignal) {
  return api<AdminCSARound>(`admin/csa-rounds/${id}`, { signal }).then((round) =>
    requireVersionedRecord(round, id),
  );
}

export function cancelRound(id: string, reason: string, version: number) {
  return api<AdminCSARound>(`admin/csa-rounds/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason.trim(), version }),
  }).then((round) => requireVersionedRecord(round, id));
}

const configurationEndpoint = "admin/csa-round-configurations";

export function csaRoundConfigurationKey(id: string) {
  return ["csa-round-configurations", id.toLowerCase()] as const;
}

export async function getRoundConfigurations(
  page = 1,
  pageSize = 20,
  type?: CSARoundConfigurationType,
  status?: CSAConfigurationStatus,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (type) query.set("type", type);
  if (status) query.set("status", status);
  const payload = await apiEnvelope<CSARoundConfigurationSummary[], PaginationMeta>(
    `${configurationEndpoint}?${query}`,
    { signal },
  );
  return requirePaginatedList(payload, requireResponseEntity);
}

export function getRoundConfiguration(rootId: string, signal?: AbortSignal) {
  return api<CSARoundConfiguration>(`${configurationEndpoint}/${encodeURIComponent(rootId)}`, {
    signal,
  }).then((configuration) => requireVersionedRecord(configuration, rootId));
}

function requireVersionedRecord<T extends { id: string; version: number }>(record: T, id: string) {
  requireResponseEntity(record);
  if (
    record.id.toLowerCase() !== id.toLowerCase() ||
    !Number.isSafeInteger(record.version) ||
    record.version < 1
  )
    throw invalidApiResponse();
  return record;
}

export async function getRoundOccurrences(
  rootId: string,
  { page, status, search }: { page: number; status: CSARoundStatus | ""; search: string },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(page), page_size: "20" });
  if (status) query.set("status", status);
  if (search) query.set("search", search);
  const payload = await apiEnvelope<CSARoundOccurrence[], PaginationMeta>(
    `${configurationEndpoint}/${encodeURIComponent(rootId)}/rounds?${query}`,
    { signal },
  );
  return requirePaginatedList(payload, requireResponseEntity);
}

export function mutateRoundConfiguration(
  id: string,
  action: "publish" | "stop",
  version: number,
  active: () => boolean,
) {
  return api<CSARoundConfiguration>(
    `${configurationEndpoint}/${encodeURIComponent(id)}/${action}`,
    {
      method: "POST",
      body: JSON.stringify({ version }),
    },
    { shouldRedirectToLogin: active },
  ).then((record) => requireVersionedRecord(record, id));
}

export function deleteRoundConfiguration(id: string, version: number, active: () => boolean) {
  return api(
    `${configurationEndpoint}/${encodeURIComponent(id)}`,
    { method: "DELETE", body: JSON.stringify({ version }) },
    {
      response: "no-content",
      shouldRedirectToLogin: active,
    },
  );
}

export type RoundConfigurationInput = RoundDates & {
  name: string;
  recurrence_mode: CSARecurrenceMode | null;
};

export async function saveRoundConfiguration(
  body: RoundConfigurationInput & { version?: number; idempotency_key?: string },
  id?: string,
  active?: () => boolean,
) {
  const init = { method: id ? "PATCH" : "POST", body: JSON.stringify(body) };
  if (!id && body.idempotency_key) {
    const { data, meta } = await apiEnvelope<CSARoundConfiguration>(configurationEndpoint, init, {
      allowMissingData: true,
      shouldRedirectToLogin: active,
    });
    return configurationCreation(data, meta, body.idempotency_key);
  }
  const snapshot = await api<CSARoundConfiguration>(
    id ? `${configurationEndpoint}/${encodeURIComponent(id)}` : configurationEndpoint,
    init,
    { shouldRedirectToLogin: active },
  );
  return {
    id: snapshot.id,
    snapshot: requireVersionedRecord(snapshot, id ?? snapshot.id),
    removed: false,
  };
}

function configurationCreation(
  data: CSARoundConfiguration | null | undefined,
  meta: unknown,
  key: string,
) {
  const id = requireCreationReceipt(meta, key, "create_csa_configuration");
  let snapshot: CSARoundConfiguration | null = null;
  try {
    if (data) snapshot = requireVersionedRecord(data, id);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "invalid_response") throw error;
  }
  return { id, snapshot, removed: data === null };
}

export async function getRoundConfigurationCreation(key: string, signal: AbortSignal) {
  const { data, meta } = await apiEnvelope<CSARoundConfiguration>(
    `${configurationEndpoint}?${new URLSearchParams({ creation_key: key })}`,
    { signal },
    { allowMissingData: true },
  );
  return configurationCreation(data, meta, key);
}

function isCsaProductQuantity(value: unknown): value is RoundParticipants["demand"][number] {
  return (
    isApiObject(value) &&
    typeof value.product_id === "string" &&
    Number.isSafeInteger(value.quantity) &&
    typeof value.name === "string" &&
    typeof value.unit_size === "string" &&
    typeof value.unit_label === "string"
  );
}

function hasRoundDemand(payload: object): payload is Pick<RoundParticipants, "demand"> {
  return (
    "demand" in payload &&
    Array.isArray(payload.demand) &&
    payload.demand.every(isCsaProductQuantity)
  );
}

export async function getRoundParticipants(
  id: string,
  page = 1,
  pageSize = 20,
  locale = "vi",
  signal?: AbortSignal,
): Promise<RoundParticipants> {
  const path = `admin/csa-rounds/${id}/selections?page=${page}&page_size=${pageSize}&locale=${locale}`;
  const payload = signal
    ? await apiEnvelope<CSASelection[], PaginationMeta>(path, { signal })
    : await apiEnvelope<CSASelection[], PaginationMeta>(path);
  const pageResult = requirePaginatedList(payload, undefined, page);
  if (
    !hasRoundDemand(pageResult) ||
    !pageResult.data.every(
      (row) =>
        isApiObject(row) &&
        typeof row.id === "string" &&
        (row.round_id === undefined ||
          (typeof row.round_id === "string" && row.round_id.toLowerCase() === id.toLowerCase())) &&
        Array.isArray(row.lines) &&
        row.lines.every(isCsaProductQuantity),
    )
  ) {
    throw invalidApiResponse();
  }
  return pageResult;
}
export async function getSelectionEvents(id: string, page = 1, signal?: AbortSignal) {
  const payload = await apiEnvelope<CSASelectionEvent[], PaginationMeta>(
    `admin/csa-selections/${id}/events?page=${page}&page_size=20`,
    { signal },
  );
  return requirePaginatedList(
    payload,
    (event) => {
      if (!isApiObject(event) || typeof event.action !== "string" || !isApiObject(event.context)) {
        throw invalidApiResponse();
      }
    },
    page,
  );
}
export function saveRound(
  body: RoundDates & { name: string; version: number },
  id: string,
  active?: () => boolean,
) {
  return api<AdminCSARound>(
    `admin/csa-rounds/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    { shouldRedirectToLogin: active },
  ).then((record) => requireVersionedRecord(record, id));
}

/** Quantity counts selling units; the base-unit label belongs to each unit's size. */
export function formatCsaQuantity(
  line: { quantity: number; unit_size?: string; unit_label: string },
  locale: AdminLocale,
) {
  return line.unit_size
    ? `${line.quantity} × ${formatMembershipUnits(line.unit_size, 1, locale)} ${line.unit_label}`
    : String(line.quantity);
}
