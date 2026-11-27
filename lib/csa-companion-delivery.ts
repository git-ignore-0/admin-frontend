import { api } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import type { CSARound } from "@/lib/csa-rounds";

export type CompanionDelivery = {
  version: number;
  companion_delivery_enabled: boolean;
  companion_delivery_cutoff: string | null;
};
export type CompanionDeliveryUpdate = {
  version: number;
  companion_delivery_enabled?: boolean;
  companion_delivery_cutoff?: string;
};
function requireCompanionDelivery(row: CompanionDelivery) {
  if (
    !isApiObject(row) ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1 ||
    typeof row.companion_delivery_enabled !== "boolean" ||
    !(
      row.companion_delivery_cutoff === null ||
      (typeof row.companion_delivery_cutoff === "string" &&
        Number.isFinite(Date.parse(row.companion_delivery_cutoff)))
    ) ||
    (row.companion_delivery_enabled && !row.companion_delivery_cutoff)
  )
    throw invalidApiResponse();
  return row;
}
export function getCompanionDelivery(id: string, signal?: AbortSignal) {
  return api<CompanionDelivery>(`admin/csa-rounds/${id}/companion-delivery`, { signal }).then(
    requireCompanionDelivery,
  );
}
export function updateCompanionDelivery(id: string, body: CompanionDeliveryUpdate) {
  return api<CompanionDelivery>(`admin/csa-rounds/${id}/companion-delivery`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }).then(requireCompanionDelivery);
}
export function companionDeliveryStatus(value: CompanionDelivery, round: CSARound, now: number) {
  if (round.status === "cancelled") return "cancelled";
  if (!value.companion_delivery_enabled)
    return value.companion_delivery_cutoff ? "closed" : "not_enabled";
  if (!value.companion_delivery_cutoff) return "not_enabled";
  if (Date.parse(value.companion_delivery_cutoff) <= now) return "expired";
  return round.status === "draft" ? "draft" : "accepting";
}

/** Anchor to the server timestamp and elapsed monotonic time, not the device wall clock. */
export function roundServerNow(round: CSARound, receivedAt: number) {
  return Date.parse(round.server_time) + Math.max(0, performance.now() - receivedAt);
}
