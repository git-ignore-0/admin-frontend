import { UUID_PATH_SEGMENT } from "@/lib/backend-target";

export const FARM_TOKEN = /^[A-Za-z0-9_-]{43}$/u;
export const PRODUCT_IDENTITY = /^[0-9a-f]{64}$/u;

export const supplyRequestStatuses = ["pending", "approved", "rejected"] as const;
export type SupplyRequestStatus = (typeof supplyRequestStatuses)[number];

export function validSupplyQuery(params: URLSearchParams, allowed: readonly string[]) {
  return [...params].every(([name, value]) => {
    if (!allowed.includes(name) || params.getAll(name).length !== 1) return false;
    if (name === "page")
      return /^[0-9]+$/u.test(value) && Number(value) >= 1 && Number(value) <= 10_000;
    if (name === "search") return Array.from(value.trim()).length <= 200;
    if (name === "farm_id") return UUID_PATH_SEGMENT.test(value);
    return supplyRequestStatuses.some((status) => status === value);
  });
}
