export const csaCustomerPath = "/csa-customers";
export const csaCustomerListKey = ["csa-customers", "list"] as const;
export const csaCustomerDetailKey = (id: string) => ["csa-customers", "detail", id] as const;

export const csaCustomerLinks = ["linked", "managed"] as const;
export const csaMembershipStatuses = ["active", "scheduled", "ended", "revoked"] as const;

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
