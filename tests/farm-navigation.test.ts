import { beforeEach, expect, it, vi } from "vitest";

import EditFarmPage from "@/app/(admin)/farms/[id]/edit/page";
import FarmsPage from "@/app/(admin)/farms/page";
import LegacyTrackerList from "@/app/(admin)/tracker-farms/page";
import LegacyTrackerCreate from "@/app/(admin)/tracker-farms/new/page";
import LegacyTrackerDetail from "@/app/(admin)/tracker-farms/[id]/page";
import { adminDictionaries } from "@/lib/admin-i18n";
import { adminNavigation, resolveAdminBreadcrumbs } from "@/lib/admin-navigation";
import {
  farmDetailTabs,
  farmHref,
  legacyTrackerHref,
  readFarmDetailTab,
  readFarmSupplyContext,
} from "@/lib/farm-navigation";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  redirect.mockClear();
});

it("exposes Products first and Information second", () => {
  expect(farmDetailTabs).toEqual(["products", "information"]);
});

it.each([
  ["", "products"],
  ["tab=unknown", "products"],
  ["tab=products", "products"],
  ["tab=information", "information"],
  ["tab=tracker", "information"],
])("opens the appropriate tab for the detail query %j", (query, tab) => {
  expect(readFarmDetailTab(new URLSearchParams(query))).toBe(tab);
});

it("redirects each legacy Tracker route and keeps only its supported query context", async () => {
  const searchParams = Promise.resolve({
    search: ["Đà Lạt", "ignored"],
    page: "2",
    is_active: "false",
    next: "https://other.example",
    tab: "products",
    supply_search: "rau sach",
    supply_status: "removed",
    supply_page: "3",
  });
  const query = "search=%C4%90%C3%A0+L%E1%BA%A1t&is_active=false&page=2";
  await LegacyTrackerList({ searchParams });
  await LegacyTrackerCreate({ searchParams });
  await LegacyTrackerDetail({ params: Promise.resolve({ id: "farm-1" }), searchParams });
  expect(redirect.mock.calls).toEqual([
    [`/farms?${query}`],
    [`/farms?${query}`],
    [
      `/farms/farm-1?${query}&supply_search=rau+sach&supply_status=removed&supply_page=3&tab=information`,
    ],
  ]);
});

it("redirects old edit links to Information with both browsing contexts", async () => {
  await EditFarmPage({
    params: Promise.resolve({ id: "farm-1" }),
    searchParams: Promise.resolve({
      search: "green",
      page: "4",
      is_active: "false",
      supply_search: "rau sach",
      supply_status: "all",
      supply_page: "2",
      tab: "products",
      next: "https://other.example",
    }),
  });
  expect(redirect).toHaveBeenCalledExactlyOnceWith(
    "/farms/farm-1?search=green&is_active=false&page=4&supply_search=rau+sach&supply_status=all&supply_page=2&tab=information",
  );
});

it("uses the Farm detail breadcrumb while an old edit route redirects", () => {
  const dictionary = adminDictionaries.vi;
  const farms = adminNavigation(dictionary).find(({ key }) => key === "farms")?.items[0];
  expect(resolveAdminBreadcrumbs("/farms/farm-1/edit", farms, dictionary)).toEqual([
    { label: "Danh sách trang trại", href: "/farms" },
    { label: "Chi tiết trang trại" },
  ]);
});

it.each([{ tab: "tracker" }, { setup: "tracker" }, { view: "tracker" }])(
  "normalizes an obsolete Farm list query with %j",
  async (obsolete) => {
    await FarmsPage({
      searchParams: Promise.resolve({
        search: "green",
        is_active: "true",
        page: "3",
        ...obsolete,
      }),
    });
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/farms?search=green&is_active=true&page=3");
  },
);

it("keeps normalized Farm lists on the same route", async () => {
  await FarmsPage({ searchParams: Promise.resolve({ search: "green", page: "2" }) });
  expect(redirect).not.toHaveBeenCalled();
});

it("preserves the supported list context when navigating to a Farm tab or the create form", () => {
  const context = new URLSearchParams(
    "search=green&page=4&is_active=false&view=tracker&setup=tracker&tab=information",
  );
  expect(farmHref(context)).toBe("/farms?search=green&is_active=false&page=4");
  expect(farmHref(context, { mode: "new" })).toBe("/farms/new?search=green&is_active=false&page=4");
  expect(farmHref(context, { id: "farm-1" })).toBe(
    "/farms/farm-1?search=green&is_active=false&page=4&tab=information",
  );
  expect(farmHref(context, { id: "farm-1", tab: "products" })).toBe(
    "/farms/farm-1?search=green&is_active=false&page=4",
  );
});

it("keeps unsafe legacy record paths and unsupported filters out of redirects", () => {
  expect(legacyTrackerHref({ page: "10001", is_active: "maybe" }, "../other")).toBe("/farms");
});

it("keeps supply browsing separate from Farm list browsing", () => {
  const context = new URLSearchParams(
    "search=hue&page=4&is_active=true&supply_search=rau+sach&supply_page=2&supply_status=removed&tab=tracker",
  );
  expect(readFarmSupplyContext(context)).toEqual({
    search: "rau sach",
    status: "removed",
    page: 2,
  });
  expect(farmHref(context)).toBe("/farms?search=hue&is_active=true&page=4");
  expect(farmHref(context, { id: "farm-1", tab: "products", productId: "product-1" })).toBe(
    "/farms/farm-1/products/product-1?search=hue&is_active=true&page=4&supply_search=rau+sach&supply_status=removed&supply_page=2",
  );
  expect(farmHref(context, { id: "farm-1" })).toBe(
    "/farms/farm-1?search=hue&is_active=true&page=4&supply_search=rau+sach&supply_status=removed&supply_page=2&tab=information",
  );
});

it("normalizes unsupported supply filters and resets their page independently", () => {
  const context = new URLSearchParams(
    "search=hue&page=4&supply_search=%20rau%20&supply_page=10001&supply_status=pause&next=//bad.example",
  );
  expect(readFarmSupplyContext(context)).toEqual({ search: "rau", status: "supplying", page: 1 });
  expect(
    farmHref(context, {
      id: "farm-1",
      supply: { search: "", status: "all", page: 1 },
    }),
  ).toBe("/farms/farm-1?search=hue&page=4&supply_status=all");
});
