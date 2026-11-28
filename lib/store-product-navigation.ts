export const STORE_PRODUCTS_PATH = "/store-catalog/products";

type SearchReader = Pick<URLSearchParams, "get">;

export function readStoreProductListContext(params: SearchReader | null) {
  const status = params?.get("status");
  const csa = params?.get("csa_eligible");
  const page = Number(params?.get("page"));
  return {
    search: params?.get("search") ?? "",
    categoryId: params?.get("category_id") ?? "",
    status: status === "draft" || status === "discontinued" || status === "all" ? status : "active",
    csa: csa === "true" || csa === "false" ? csa : "",
    page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1,
  } as const;
}

export function storeProductHref(
  search: SearchReader | null,
  productId?: string,
  mode?: "edit" | "new",
) {
  const path =
    mode === "new"
      ? `${STORE_PRODUCTS_PATH}/new`
      : productId
        ? `${STORE_PRODUCTS_PATH}/${encodeURIComponent(productId)}${mode === "edit" ? "/edit" : ""}`
        : STORE_PRODUCTS_PATH;
  const context = readStoreProductListContext(search);
  const query = new URLSearchParams();
  if (context.search) query.set("search", context.search);
  if (context.categoryId) query.set("category_id", context.categoryId);
  if (context.status !== "active") query.set("status", context.status);
  if (context.csa) query.set("csa_eligible", context.csa);
  if (context.page > 1) query.set("page", String(context.page));
  return query.size ? `${path}?${query}` : path;
}
