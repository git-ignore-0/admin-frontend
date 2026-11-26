export const FARM_LIST_PATH = "/farms";

type SearchReader = Pick<URLSearchParams, "get">;
type RouteSearch = Record<string, string | string[] | undefined>;
export const farmDetailTabs = ["products", "information", "tracker"] as const;
export type FarmDetailTab = (typeof farmDetailTabs)[number];
type FarmDestination = {
  id?: string;
  mode?: "new" | "edit";
  tab?: FarmDetailTab;
  view?: "farms" | "tracker";
  setup?: boolean;
};

export function readFarmListContext(search: SearchReader | null) {
  const status = search?.get("is_active");
  const page = Number(search?.get("page"));
  return {
    search: search?.get("search")?.trim() ?? "",
    status: status === "true" || status === "false" ? status : "",
    page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1,
    setup: search?.get("setup") === "tracker",
  } as const;
}

export function readFarmDetailTab(search: SearchReader | null): FarmDetailTab {
  const tab = search?.get("tab");
  return tab === "tracker" || tab === "information" ? tab : "products";
}

export function farmHref(search: SearchReader | null, destination: FarmDestination = {}) {
  const { id, mode, tab, view, setup } = destination;
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
  if (setup ?? filters.setup) query.set("setup", "tracker");

  const fromTracker =
    view === "tracker" || (view === undefined && search?.get("view") === "tracker");
  if (path === FARM_LIST_PATH && fromTracker) query.set("tab", "tracker");
  if (path !== FARM_LIST_PATH && fromTracker) query.set("view", "tracker");
  const detailTab = tab ?? readFarmDetailTab(search);
  if (id && mode !== "new" && detailTab !== "products") query.set("tab", detailTab);

  return query.size ? `${path}?${query}` : path;
}

export function legacyTrackerHref(search: RouteSearch, id?: string) {
  return farmHref(
    {
      get(name) {
        const value = search[name];
        return typeof value === "string" ? value : (value?.[0] ?? null);
      },
    },
    id === "new"
      ? { view: "farms", setup: true }
      : id && /^[a-z0-9_-]+$/i.test(id)
        ? { id, view: "farms", tab: "tracker", setup: false }
        : { view: "tracker", setup: false },
  );
}
