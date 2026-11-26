export const FARM_LIST_PATH = "/farms";

type SearchReader = Pick<URLSearchParams, "get">;
export type FarmRouteSearch = Record<string, string | string[] | undefined>;
export const farmDetailTabs = ["products", "information", "tracker"] as const;
export type FarmDetailTab = (typeof farmDetailTabs)[number];
type FarmDestination = {
  id?: string;
  mode?: "new" | "edit";
  tab?: FarmDetailTab;
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
  const page = Number(search?.get("page"));
  return {
    search: search?.get("search")?.trim() ?? "",
    status: status === "true" || status === "false" ? status : "",
    page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1,
  } as const;
}

export function readFarmDetailTab(search: SearchReader | null): FarmDetailTab {
  const tab = search?.get("tab");
  return tab === "tracker" || tab === "information" ? tab : "products";
}

export function farmHref(search: SearchReader | null, destination: FarmDestination = {}) {
  const { id, mode, tab } = destination;
  const path =
    mode === "new"
      ? `${FARM_LIST_PATH}/new`
      : id
        ? `${FARM_LIST_PATH}/${encodeURIComponent(id)}${mode === "edit" ? "/edit" : ""}`
        : FARM_LIST_PATH;
  const filters = readFarmListContext(search);
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("is_active", filters.status);
  if (filters.page > 1) query.set("page", String(filters.page));
  const detailTab = tab ?? readFarmDetailTab(search);
  if (id && mode !== "new" && detailTab !== "products") query.set("tab", detailTab);

  return query.size ? `${path}?${query}` : path;
}

export function legacyTrackerHref(search: FarmRouteSearch, id?: string) {
  const destination =
    id && id !== "new" && /^[a-z0-9_-]+$/i.test(id) ? { id, tab: "tracker" as const } : {};
  return farmHref(readFarmRouteSearch(search), destination);
}
