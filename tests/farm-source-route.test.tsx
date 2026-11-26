import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import FarmSourcePage from "@/app/(admin)/farms/[id]/products/[productId]/page";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmDetail } from "@/components/farm-detail";
import { getFarm } from "@/lib/farms-api";
import type { Farm } from "@/lib/types";

const router = { push: vi.fn(), replace: vi.fn() };
const search = new URLSearchParams();
const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("not_found");
  }),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search,
  notFound,
  redirect,
}));
vi.mock("@/lib/farms-api", () => ({ getFarm: vi.fn() }));
vi.mock("@/components/farm-products", () => ({
  FarmProducts: () => <div>Supply directory</div>,
}));
vi.mock("@/components/farm-source-detail", () => ({
  FarmSourceDetail: ({
    productId,
    onAccessLost,
  }: {
    productId: string;
    onAccessLost: (cause: unknown) => void;
  }) => (
    <>
      <h1>Supply detail {productId}</h1>
      <button onClick={() => onAccessLost(Object.assign(new Error("forbidden"), { status: 403 }))}>
        Lose access
      </button>
    </>
  ),
}));

const farm: Farm = {
  id: "farm-1",
  name_en: "Green Valley",
  name_vi: "Thung lũng Xanh",
  location_en: "Da Lat",
  location_vi: "Đà Lạt",
  description_en: "",
  description_vi: "",
  image: null,
  photos: [],
  is_active: true,
  in_stock_product_count: 1,
  out_of_stock_product_count: 0,
  version: 1,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function scope(productId?: string) {
  return (
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>
        <FarmDetail key={productId ?? "list"} farmId={farm.id} productId={productId} />
      </AdminQueryProvider>
    </AdminI18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("reuses the Farm read between full-width supply routes", async () => {
  vi.mocked(getFarm).mockResolvedValue(farm);
  const view = render(scope());
  expect(await screen.findByText("Supply directory")).toBeVisible();

  view.rerender(scope("product-1"));
  expect(await screen.findByRole("heading", { name: "Supply detail product-1" })).toBeVisible();
  expect(screen.queryByText("Supply directory")).not.toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

  view.rerender(scope());
  expect(await screen.findByText("Supply directory")).toBeVisible();
  expect(getFarm).toHaveBeenCalledExactlyOnceWith(farm.id, expect.any(AbortSignal));
});

it("removes the Farm snapshot after a protected source error and allows a fresh read", async () => {
  vi.mocked(getFarm).mockResolvedValue(farm);
  render(scope("product-1"));
  fireEvent.click(await screen.findByRole("button", { name: "Lose access" }));
  const error = await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: "Supply detail product-1" })).toBeNull();
  expect(getFarm).toHaveBeenCalledTimes(1);
  fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Supply detail product-1" })).toBeVisible();
  expect(getFarm).toHaveBeenCalledTimes(2);
});

it("identifies a missing parent Farm before attempting to display its source", async () => {
  vi.mocked(getFarm).mockRejectedValue(Object.assign(new Error("not_found"), { status: 404 }));
  render(scope("product-1"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Farm not found.");
  expect(screen.queryByRole("heading", { name: "Supply detail product-1" })).toBeNull();
  expect(getFarm).toHaveBeenCalledTimes(1);
});

it("rejects invalid route IDs and canonicalizes valid UUIDs with both contexts", async () => {
  const id = "AAAAAAAA-BAAA-CAAA-DAAA-EAAAAAAAAAAA";
  const productId = "AAAAAAAA-BAAA-CAAA-DAAA-EAAAAAAAAAAB";
  await expect(
    FarmSourcePage({
      params: Promise.resolve({ id, productId: "../different-product" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("not_found");
  expect(notFound).toHaveBeenCalledOnce();
  await expect(
    FarmSourcePage({
      params: Promise.resolve({ id, productId }),
      searchParams: Promise.resolve({
        search: "green",
        page: "2",
        supply_status: "removed",
        supply_page: "3",
        next: "//example.invalid",
      }),
    }),
  ).rejects.toThrow("redirect");
  expect(redirect).toHaveBeenCalledExactlyOnceWith(
    "/farms/aaaaaaaa-baaa-caaa-daaa-eaaaaaaaaaaa/products/aaaaaaaa-baaa-caaa-daaa-eaaaaaaaaaab?search=green&page=2&supply_status=removed&supply_page=3",
  );
});
