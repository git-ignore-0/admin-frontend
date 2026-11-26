import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { NextRouter } from "next/router";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminNavigationProvider } from "@/components/admin-navigation-link";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmList } from "@/components/farm-list";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { Farm } from "@/lib/types";

const navigate = vi.fn();
const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn().mockResolvedValue(undefined) };
let searchParams = new URLSearchParams();
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

const farm: Farm = {
  id: "farm-1",
  name_en: "Green Valley",
  name_vi: "Thung lũng Xanh",
  location_en: "Da Lat",
  location_vi: "Đà Lạt",
  description_en: "English description",
  description_vi: "Mô tả Việt",
  image: null,
  photos: [],
  is_active: true,
  in_stock_product_count: 8,
  out_of_stock_product_count: 4,
  version: 1,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function renderFarmList(locale: "en" | "vi" = "vi") {
  render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>
        <AdminQueryProvider>
          <RouterContext.Provider value={router as unknown as NextRouter}>
            <AdminNavigationProvider value={navigate}>
              <FarmList />
            </AdminNavigationProvider>
          </RouterContext.Provider>
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  searchParams = new URLSearchParams();
  vi.resetAllMocks();
});

it("shows a single directory with normal farm links for obsolete Tracker list contexts", async () => {
  searchParams = new URLSearchParams(
    "search=green&is_active=true&page=3&setup=tracker&tab=tracker&view=tracker",
  );
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [{ ...farm, in_stock_product_count: 1, out_of_stock_product_count: 0 }],
    meta: { page: 3, page_size: 20, total: 51 },
  });
  vi.mocked(api).mockResolvedValue([]);
  renderFarmList("en");

  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  const farmLink = await screen.findByRole("link", { name: "Green Valley" });
  expect(farmLink).toHaveAttribute("href", "/farms/farm-1?search=green&is_active=true&page=3");
  expect(screen.getByRole("link", { name: "Add farm" })).toHaveAttribute(
    "href",
    "/farms/new?search=green&is_active=true&page=3",
  );
  expect(screen.getByText("1 product")).toBeVisible();
  expect(screen.queryByText(/Growth Tracker|Save order|Drag.*reorder/)).not.toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();
  expect(apiEnvelope).toHaveBeenCalledExactlyOnceWith(
    "admin/farms?page=3&search=green&is_active=true",
    {
      signal: expect.any(AbortSignal),
    },
  );

  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    document.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(farmLink, modifier);
  }
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(farmLink);
  expect(navigate).toHaveBeenCalledExactlyOnceWith(
    "/farms/farm-1?search=green&is_active=true&page=3",
    { replace: undefined, scroll: undefined },
  );
});

it("shows total supplied products and current stock coverage in one column", async () => {
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [
      farm,
      {
        ...farm,
        id: "farm-2",
        name_vi: "Trang trại Sông",
        in_stock_product_count: 6,
        out_of_stock_product_count: 0,
      },
      {
        ...farm,
        id: "farm-3",
        name_vi: "Trang trại Núi",
        in_stock_product_count: 0,
        out_of_stock_product_count: 4,
        is_active: false,
      },
      {
        ...farm,
        id: "farm-4",
        name_vi: "Trang trại Mới",
        in_stock_product_count: 0,
        out_of_stock_product_count: 0,
      },
    ],
    meta: { page: 1, page_size: 20, total: 4 },
  });
  renderFarmList();

  const table = await screen.findByRole("table", { name: "Danh sách trang trại" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual(["Trang trại", "Sản phẩm", "Trạng thái"]);
  const productCell = (name: RegExp) =>
    within(within(table).getByRole("row", { name })).getAllByRole("cell")[1];
  expect(productCell(/Thung lũng Xanh/)).toHaveTextContent(/12 sản phẩm\s*8 có hàng/);
  expect(productCell(/Trang trại Sông/)).toHaveTextContent(/6 sản phẩm\s*6 có hàng/);
  expect(productCell(/Trang trại Núi/)).toHaveTextContent(/4 sản phẩm\s*Chưa có hàng/);
  expect(productCell(/Trang trại Mới/)).toHaveTextContent("Chưa có sản phẩm");
  expect(within(table).queryByText(/tồn khả dụng|hết hàng/i)).not.toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();
  expect(apiEnvelope).toHaveBeenCalledTimes(1);
});
