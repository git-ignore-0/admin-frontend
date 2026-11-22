import { isoDateToAdminInput, membershipLastReceiptDate } from "@/lib/admin-date";
import { requirePaginatedList, requireResponseEntity } from "@/lib/api-response";
import type { PaginationMeta } from "@/lib/types";
import { api, apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import { formatMembershipUnits } from "@/lib/membership-format";
import type { AdminLocale } from "@/lib/admin-i18n";
import { couponDateTimeInput, couponDateTimeToApi } from "@/lib/csa-coupons";

export type CSARoundStatus = "draft" | "scheduled" | "open" | "closed" | "delivery" | "cancelled";
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
export type AdminCSARound = CSARound & { can_edit: boolean };
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
  // Cross-round scheduling is authoritative on the backend at publication.
  return ![a, b, c].every(Number.isFinite) || !(a < b && b < c) ? "schedule" : null;
}
export function validateReopenDeadline(deadline: string, deliveryDate: string, serverNow: number) {
  const end = Date.parse(deadline);
  return Number.isFinite(end) && serverNow < end && end < csaDeliveryStartMs(deliveryDate);
}
export async function getRounds(page = 1, pageSize = 20) {
  const payload = await apiEnvelope<CSARound[], PaginationMeta>(
    `admin/csa-rounds?page=${page}&page_size=${pageSize}`,
  );
  return requirePaginatedList(payload, requireResponseEntity);
}
export function getRound(id: string) {
  return api<AdminCSARound>(`admin/csa-rounds/${id}`);
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
): Promise<RoundParticipants> {
  const payload = await apiEnvelope<CSASelection[], PaginationMeta>(
    `admin/csa-rounds/${id}/selections?page=${page}&page_size=${pageSize}&locale=${locale}`,
  );
  const pageResult = requirePaginatedList(payload);
  if (
    !hasRoundDemand(pageResult) ||
    !pageResult.data.every(
      (row) =>
        isApiObject(row) &&
        typeof row.id === "string" &&
        Array.isArray(row.lines) &&
        row.lines.every(isCsaProductQuantity),
    )
  ) {
    throw invalidApiResponse();
  }
  return pageResult;
}
export async function getSelectionEvents(id: string, page = 1) {
  const payload = await apiEnvelope<CSASelectionEvent[], PaginationMeta>(
    `admin/csa-selections/${id}/events?page=${page}&page_size=20`,
  );
  return requirePaginatedList(payload, (event) => {
    if (!isApiObject(event) || typeof event.action !== "string" || !isApiObject(event.context)) {
      throw invalidApiResponse();
    }
  });
}
export function saveRound(body: RoundDates & { name: string }, id?: string) {
  return api<CSARound>(id ? `admin/csa-rounds/${id}` : "admin/csa-rounds", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  }).then(requireResponseEntity);
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
