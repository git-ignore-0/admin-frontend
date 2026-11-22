export const csaPurchasePath = "/csa-purchase-requests";
export const csaPurchaseStatuses = [
  "pending",
  "payment_confirmed",
  "approved",
  "rejected",
  "expired",
] as const;

export function readCsaPurchaseListContext(params: Pick<URLSearchParams, "get">) {
  const page = Number(params.get("page"));
  return {
    search: (params.get("search") ?? "").trim(),
    status: csaPurchaseStatuses.find((value) => value === params.get("status")) ?? "",
    page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1,
  };
}

export function csaPurchaseHref(
  { search, status, page }: ReturnType<typeof readCsaPurchaseListContext>,
  id?: string,
) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  const path = id ? `${csaPurchasePath}/${encodeURIComponent(id)}` : csaPurchasePath;
  return query ? `${path}?${query}` : path;
}
