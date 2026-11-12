import type { PaginationMeta } from "@/lib/types";
import { api, apiEnvelope } from "@/lib/client-api";
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
  delivery_at: string;
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
export type RoundDates = Pick<CSARound, "opens_at" | "closes_at" | "delivery_at">;
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
export function validateRoundDates(dates: RoundDates) {
  const a = Date.parse(dates.opens_at),
    b = Date.parse(dates.closes_at),
    c = Date.parse(dates.delivery_at);
  // Cross-round scheduling is authoritative on the backend at publication.
  return ![a, b, c].every(Number.isFinite) || !(a < b && b < c) ? "schedule" : null;
}
export function validateReopenDeadline(deadline: string, deliveryAt: string, serverNow: number) {
  const end = Date.parse(deadline);
  return Number.isFinite(end) && serverNow < end && end < Date.parse(deliveryAt);
}
export async function getRounds(page = 1, pageSize = 20) {
  return (await apiEnvelope<CSARound[], PaginationMeta>(
    `admin/csa-rounds?page=${page}&page_size=${pageSize}`,
  )) as RoundPage<CSARound>;
}
export function getRound(id: string) {
  return api<AdminCSARound>(`admin/csa-rounds/${id}`);
}
export async function getRoundParticipants(
  id: string,
  page = 1,
  pageSize = 20,
  locale = "vi",
): Promise<RoundParticipants> {
  return (await apiEnvelope<CSASelection[], PaginationMeta>(
    `admin/csa-rounds/${id}/selections?page=${page}&page_size=${pageSize}&locale=${locale}`,
  )) as RoundParticipants;
}
export async function getSelectionEvents(id: string, page = 1) {
  return (await apiEnvelope<CSASelectionEvent[], PaginationMeta>(
    `admin/csa-selections/${id}/events?page=${page}&page_size=20`,
  )) as RoundPage<CSASelectionEvent>;
}
export function saveRound(body: RoundDates & { name: string }, id?: string) {
  return api<CSARound>(id ? `admin/csa-rounds/${id}` : "admin/csa-rounds", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
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
