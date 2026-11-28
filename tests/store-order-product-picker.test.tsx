import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { StoreOrderProductPicker } from "@/components/store-order-product-picker";
import { listStoreProducts } from "@/lib/commerce-api";
import type { StoreProduct } from "@/lib/types";

vi.mock("@/lib/commerce-api", () => ({ listStoreProducts: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const active = product("1", "Basil", "active");
const draft = product("2", "Cauliflower", "draft");
const discontinued = product("3", "Carrot", "discontinued");

function product(id: string, name: string, status: StoreProduct["status"]): StoreProduct {
  return {
    id,
    category_id: "category",
    category_slug: "vegetables",
    sku: `SKU-${id}`,
    slug: name.toLowerCase(),
    unit_size: "1.0",
    unit_label_vi: "kg",
    unit_label_en: "kg",
    retail_price_vnd: "12000",
    csa_quota_group_id: null,
    csa_quota_group: null,
    csa_quota_cost: 0,
    primary_image_id: null,
    primary_image: null,
    status,
    translations: [{ locale: "en", name, description: "", short_description: "" }],
    created_at: "2026-07-20T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>{children}</AdminQueryProvider>
    </AdminI18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("requests the catalog only on open and uses the active filter for new orders", async () => {
  const list = vi.mocked(listStoreProducts);
  list.mockResolvedValue({ data: [active], meta: { page: 1, page_size: 30, total: 1 } });
  const props = { kind: "new", selected: [active], onClose: vi.fn(), onAdd: vi.fn() } as const;
  const view = render(<StoreOrderProductPicker {...props} opened={false} />, { wrapper });
  expect(list).not.toHaveBeenCalled();
  view.rerender(<StoreOrderProductPicker {...props} opened />);
  expect(await screen.findByText("Basil")).toBeVisible();
  expect(list).toHaveBeenCalledWith(
    { page: 1, search: "", status: "active" },
    expect.any(AbortSignal),
  );
  expect(screen.getByRole("checkbox", { name: /Basil/ })).toBeDisabled();
});

it("keeps selections across pages and searches while draft rows cannot be added to a historical order", async () => {
  const list = vi.mocked(listStoreProducts);
  list.mockImplementation(async ({ page = 1, search }) => ({
    data: search ? [discontinued] : page === 1 ? [active] : [draft],
    meta: { page, page_size: 1, total: search ? 1 : 2 },
  }));
  const add = vi.fn();
  render(
    <StoreOrderProductPicker
      opened
      kind="historical"
      selected={[]}
      onClose={vi.fn()}
      onAdd={add}
    />,
    { wrapper },
  );

  fireEvent.click(await screen.findByRole("checkbox", { name: /Basil/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByRole("checkbox", { name: /Cauliflower/ })).toBeDisabled();
  expect(list).toHaveBeenLastCalledWith(
    { page: 2, search: "", status: undefined },
    expect.any(AbortSignal),
  );

  fireEvent.change(screen.getByRole("searchbox", { name: "Search name, SKU, or slug" }), {
    target: { value: "Carrot" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  const carrot = await screen.findByRole("checkbox", { name: /Carrot/ });
  expect(list).toHaveBeenLastCalledWith(
    { page: 1, search: "Carrot", status: undefined },
    expect.any(AbortSignal),
  );
  fireEvent.click(carrot);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add products" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  expect(add).toHaveBeenCalledWith([active, discontinued]);
});

it("drops a selected product that a later catalog response now marks as draft", async () => {
  const list = vi.mocked(listStoreProducts);
  let changed = false;
  list.mockImplementation(async ({ page = 1 }) => ({
    data: page === 1 ? [{ ...active, status: changed ? "draft" : "active" }] : [discontinued],
    meta: { page, page_size: 1, total: 2 },
  }));
  render(
    <StoreOrderProductPicker
      opened
      kind="historical"
      selected={[]}
      onClose={vi.fn()}
      onAdd={vi.fn()}
    />,
    { wrapper },
  );
  fireEvent.click(await screen.findByRole("checkbox", { name: /Basil/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("checkbox", { name: /Carrot/ });
  changed = true;
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(await screen.findByText("Draft")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("checkbox", { name: /Carrot/ });
  expect(screen.getByRole("button", { name: "Add products" })).toBeDisabled();
});
