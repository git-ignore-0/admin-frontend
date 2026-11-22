export type CatalogResource = "products" | "packages";

export function readCatalogListContext(params?: Pick<URLSearchParams, "get"> | null) {
  const active = params?.get("active");
  const page = Number(params?.get("page"));
  return {
    search: (params?.get("search") ?? "").trim(),
    active: active === "true" || active === "false" ? active : "",
    page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1,
  };
}

export function withCatalogListContext(
  path: string,
  context: ReturnType<typeof readCatalogListContext>,
) {
  const { search, active, page } = context;
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (active) params.set("active", active);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function catalogPath(resource: CatalogResource, id?: string, action?: "edit") {
  const list = `/membership-catalog/${resource}`;
  if (!id) return list;
  return `${list}/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;
}

export function catalogHref(
  resource: CatalogResource,
  context: ReturnType<typeof readCatalogListContext>,
  id?: string,
  action?: "edit",
) {
  return withCatalogListContext(catalogPath(resource, id, action), context);
}
