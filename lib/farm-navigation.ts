import type { FarmSupplyFilter } from "@/lib/types";

export const FARM_LIST_PATH = "/farms";

type SearchReader = Pick<URLSearchParams, "get">;
export type FarmRouteSearch = Record<string, string | string[] | undefined>;
export const farmDetailTabs = ["products", "information"] as const;
export type FarmDetailTab = (typeof farmDetailTabs)[number];
export type FarmSupplyContext = {
  search: string;
  status: FarmSupplyFilter;
  page: number;
};
type FarmDestination = {
  id?: string;
  mode?: "new";
  tab?: FarmDetailTab;
  productId?: string;
  supply?: FarmSupplyContext;
};

export function readFarmRouteSearch(search: FarmRouteSearch): SearchReader {
  return {
    get(name) {
      const value = search[name];
      return typeof value === "string" ? value : (value?.[0] ?? null);
    },
  };
}

export function readFarmListContext(search: SearchReader | null) {
  const status = search?.get("is_active");
  return {
    search: search?.get("search")?.trim() ?? "",
    status: status === "true" || status === "false" ? status : "",
    page: readPage(search?.get("page")),
  } as const;
}

function readPage(value: string | null | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1;
}

export function normalizeFarmSupplySearch(value: string) {
  return Array.from(value.trim()).slice(0, 200).join("");
}

export function readFarmSupplyContext(search: SearchReader | null): FarmSupplyContext {
  const status = search?.get("supply_status");
  return {
    search: normalizeFarmSupplySearch(search?.get("supply_search") ?? ""),
    status: status === "removed" || status === "all" ? status : "supplying",
    page: readPage(search?.get("supply_page")),
  };
}

export function readFarmDetailTab(search: SearchReader | null): FarmDetailTab {
  const tab = search?.get("tab");
  return tab === "tracker" || tab === "information" ? "information" : "products";
}

export function farmHref(search: SearchReader | null, destination: FarmDestination = {}) {
  const { id, mode, tab, productId, supply } = destination;
  const suffix = productId ? `/products/${encodeURIComponent(productId)}` : "";
  const path =
    mode === "new"
      ? `${FARM_LIST_PATH}/new`
      : id
        ? `${FARM_LIST_PATH}/${encodeURIComponent(id)}${suffix}`
        : FARM_LIST_PATH;
  const filters = readFarmListContext(search);
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("is_active", filters.status);
  if (filters.page > 1) query.set("page", String(filters.page));
  if (id && mode !== "new") {
    const sourceFilters = supply ?? readFarmSupplyContext(search);
    if (sourceFilters.search) query.set("supply_search", sourceFilters.search);
    if (sourceFilters.status !== "supplying") query.set("supply_status", sourceFilters.status);
    if (sourceFilters.page > 1) query.set("supply_page", String(sourceFilters.page));
    const detailTab = tab ?? readFarmDetailTab(search);
    if (!productId && detailTab !== "products") query.set("tab", detailTab);
  }

  return query.size ? `${path}?${query}` : path;
}

export function legacyTrackerHref(search: FarmRouteSearch, id?: string) {
  const destination =
    id && id !== "new" && /^[a-z0-9_-]+$/i.test(id) ? { id, tab: "information" as const } : {};
  return farmHref(readFarmRouteSearch(search), destination);
}
