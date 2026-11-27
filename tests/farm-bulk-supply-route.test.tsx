import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import FarmBulkSupplyPage from "@/app/(admin)/farms/[id]/stock-batches/new/page";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { ToastProvider } from "@/components/toast-provider";
import { FarmBulkSupply } from "@/components/farm-bulk-supply";
import { getFarm, listFarmProducts } from "@/lib/farms-api";
import type { Farm } from "@/lib/types";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not_found");
  }),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  search: new URLSearchParams(
    "search=%2B8491&page=4&supply_search=rau&supply_page=2&supply_status=all",
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => nav.search,
  notFound: nav.notFound,
  redirect: nav.redirect,
}));
vi.mock("@/lib/farms-api", async (original) => ({
  ...(await original<typeof import("@/lib/farms-api")>()),
  getFarm: vi.fn(),
  listFarmProducts: vi.fn(),
}));
vi.mock("@/components/farm-bulk-supply-form", () => ({
  FarmSupplyForm: ({
    pagination,
    onSearch,
    onCancel,
  }: {
    pagination?: { page: number; onChange: (page: number) => void };
    onSearch: (value: string) => void;
    onCancel: () => void;
  }) => (
    <>
      <button disabled={!pagination} onClick={() => pagination?.onChange(2)}>
        Page two
      </button>
      <button onClick={() => onSearch("  tomato  ")}>Apply search</button>
      <button onClick={onCancel}>Cancel route</button>
    </>
  ),
}));

const id = "aaaaaaaa-1234-4567-8934-123456789abc";
const farm: Farm = {
  id,
  name_en: "Green Farm",
  name_vi: "Trang trại Xanh",
  location_en: "Da Lat",
  location_vi: "Đà Lạt",
  contact_phone: "",
  description_en: "",
  description_vi: "",
  version: 2,
  is_active: false,
  image: null,
  photos: [],
  in_stock_product_count: 0,
  out_of_stock_product_count: 25,
  created_at: "2026-11-01",
  updated_at: "2026-11-01",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("fetches eligible pages only for the opened Farm and keeps return context", async () => {
  vi.mocked(getFarm).mockResolvedValue(farm);
  vi.mocked(listFarmProducts).mockImplementation(async (_id, query) => ({
    data: [],
    meta: { page: query?.page ?? 1, page_size: 20, total: 25 },
  }));
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>
        <ToastProvider>
          <FarmBulkSupply farmId={id} />
        </ToastProvider>
      </AdminQueryProvider>
    </AdminI18nProvider>,
  );
  await screen.findByText("Green Farm");
  await waitFor(() => expect(screen.getByRole("button", { name: "Page two" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Page two" }));
  await waitFor(() =>
    expect(listFarmProducts).toHaveBeenLastCalledWith(
      id,
      { supplyStatus: "supplying", productStatus: "active", search: "", page: 2 },
      expect.any(AbortSignal),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply search" }));
  await waitFor(() =>
    expect(listFarmProducts).toHaveBeenLastCalledWith(
      id,
      { supplyStatus: "supplying", productStatus: "active", search: "tomato", page: 1 },
      expect.any(AbortSignal),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel route" }));
  expect(nav.replace).toHaveBeenCalledWith(
    `/farms/${id}?search=%2B8491&page=4&supply_search=rau&supply_status=all&supply_page=2`,
  );
  expect(getFarm).toHaveBeenCalledTimes(1);
});

it("validates the Farm UUID and canonicalizes uppercase links", async () => {
  await expect(
    FarmBulkSupplyPage({
      params: Promise.resolve({ id: "bad" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("not_found");
  await expect(
    FarmBulkSupplyPage({
      params: Promise.resolve({ id: id.toUpperCase() }),
      searchParams: Promise.resolve({ supply_page: "2" }),
    }),
  ).rejects.toThrow("redirect");
  expect(nav.redirect).toHaveBeenCalledWith(`/farms/${id}/stock-batches/new?supply_page=2`);
});
