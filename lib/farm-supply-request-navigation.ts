import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { normalizeFarmSupplySearch } from "@/lib/farm-navigation";
import type { SupplyRequestStatus } from "@/lib/farm-supply-request-api";

export const farmSupplyRequestsPath = "/farm-supply-requests";

type ListContext = { page: number; search: string; farm_id?: string; status?: SupplyRequestStatus };

export function readSupplyRequestContext(params: Pick<URLSearchParams, "get"> | null): ListContext {
  const farmId = params?.get("farm_id");
  const status = params?.get("status");
  const page = Number(params?.get("page"));
  return {
    page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1,
    search: normalizeFarmSupplySearch(params?.get("search") ?? ""),
    farm_id: farmId && UUID_PATH_SEGMENT.test(farmId) ? farmId.toLowerCase() : undefined,
    status:
      status === "pending" || status === "approved" || status === "rejected" ? status : undefined,
  };
}

export function supplyRequestHref(
  { page, search, farm_id, status }: ListContext,
  requestId?: string,
) {
  const path = requestId
    ? `${farmSupplyRequestsPath}/${encodeURIComponent(requestId)}`
    : farmSupplyRequestsPath;
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (farm_id) params.set("farm_id", farm_id);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  return params.size ? `${path}?${params}` : path;
}
