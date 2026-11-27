import { hashKey, notifyManager, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { requireResponseEntity, requireResponseList } from "@/lib/api-response";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import type { CSACustomer } from "@/lib/types";

export const csaCustomerPath = "/csa-customers";
export const csaCustomerListKey = ["csa-customers", "list"] as const;
export const csaCustomerDetailKey = (id: string) => ["csa-customers", "detail", id] as const;

export const csaCustomerLinks = ["linked", "managed"] as const;
export const csaMembershipStatuses = ["active", "scheduled", "ended", "revoked"] as const;

export function requireCSACustomer(row: CSACustomer, id?: string) {
  requireResponseEntity(row, id);
  if (
    typeof row.name !== "string" ||
    typeof row.address !== "string" ||
    !["active", "scheduled", "history_only", "new"].includes(row.status) ||
    ![row.phone, row.province_code, row.ward_code].every(
      (value) => value === null || typeof value === "string",
    ) ||
    !(row.user === null || (isApiObject(row.user) && typeof row.user.name === "string"))
  )
    throw invalidApiResponse();
  if (row.user) requireResponseEntity(row.user);
  if (row.memberships !== undefined) requireResponseList(row.memberships, requireResponseEntity);
  return row;
}

export function retireCSACustomers(client: QueryClient, failed?: QueryKey) {
  const criteria = { queryKey: [csaCustomerListKey[0]] };
  notifyManager.batch(() => {
    void client.cancelQueries({
      ...criteria,
      predicate: (query) => query.queryHash !== (failed && hashKey(failed)),
    });
    client.setQueriesData(criteria, () => null);
  });
}

export function readCsaCustomerListContext(params: Pick<URLSearchParams, "get">) {
  const page = Number(params.get("page"));
  return {
    search: (params.get("search") ?? "").trim(),
    linked: csaCustomerLinks.find((value) => value === params.get("linked")) ?? "",
    status: csaMembershipStatuses.find((value) => value === params.get("membership_status")) ?? "",
    page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1,
  };
}

type CustomerListContext = ReturnType<typeof readCsaCustomerListContext>;

function csaCustomerSearch({ search, linked, status, page }: CustomerListContext) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (linked) params.set("linked", linked);
  if (status) params.set("membership_status", status);
  if (page > 1) params.set("page", String(page));
  return params;
}

export function csaCustomerHref(context: CustomerListContext, id?: string) {
  const query = csaCustomerSearch(context).toString();
  const path = id ? `${csaCustomerPath}/${encodeURIComponent(id)}` : csaCustomerPath;
  return query ? `${path}?${query}` : path;
}

export function csaCustomerAssignmentHref(context: CustomerListContext, id: string) {
  const params = new URLSearchParams({ customerId: id });
  csaCustomerSearch(context).forEach((value, key) => params.set(key, value));
  return `/memberships/assign?${params}`;
}
