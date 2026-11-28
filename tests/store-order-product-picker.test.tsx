import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("requests the eligible new-order catalog only on open", async () => {
  const list = vi.mocked(listStoreProducts);
  list.mockResolvedValue({ data: [active], meta: { page: 1, page_size: 30, total: 1 } });
  const props = { kind: "new", selected: [active], onClose: vi.fn(), onAdd: vi.fn() } as const;
  const view = render(<StoreOrderProductPicker {...props} opened={false} />, { wrapper });
  expect(list).not.toHaveBeenCalled();
  view.rerender(<StoreOrderProductPicker {...props} opened />);
  expect(await screen.findByText("Basil")).toBeVisible();
  expect(list).toHaveBeenCalledWith(
    { page: 1, search: "", order_kind: "new" },
    expect.any(AbortSignal),
  );
  expect(screen.getByRole("checkbox", { name: /Basil/ })).toBeDisabled();
});

it("keeps selections across eligible historical pages and searches", async () => {
  const list = vi.mocked(listStoreProducts);
  list.mockImplementation(async ({ page = 1, search, product_ids }) => ({
    data: product_ids ? [discontinued, active] : search || page === 2 ? [discontinued] : [active],
    meta: { page, page_size: product_ids ? 50 : 1, total: search ? 1 : 2 },
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
  expect(await screen.findByRole("checkbox", { name: /Carrot/ })).toBeEnabled();
  expect(list).toHaveBeenLastCalledWith(
    { page: 2, search: "", order_kind: "historical" },
    expect.any(AbortSignal),
  );

  fireEvent.change(screen.getByRole("searchbox", { name: "Search name, SKU, or slug" }), {
    target: { value: "Carrot" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  const carrot = await screen.findByRole("checkbox", { name: /Carrot/ });
  expect(list).toHaveBeenLastCalledWith(
    { page: 1, search: "Carrot", order_kind: "historical" },
    expect.any(AbortSignal),
  );
  fireEvent.click(carrot);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add products" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  await waitFor(() => expect(add).toHaveBeenCalledWith([active, discontinued]));
  expect(list).toHaveBeenLastCalledWith(
    { order_kind: "historical", product_ids: [active.id, discontinued.id] },
    expect.any(AbortSignal),
  );
});

it("keeps a selection visible when it disappears and lets the user remove it after verification", async () => {
  const list = vi.mocked(listStoreProducts);
  let changed = false;
  list.mockImplementation(async ({ page = 1, product_ids }) => {
    const eligible = changed ? [discontinued] : [active, discontinued];
    const data = product_ids
      ? eligible.filter(({ id }) => product_ids.includes(id))
      : eligible.slice(page - 1, page);
    return {
      data,
      meta: {
        page,
        page_size: product_ids ? 50 : 1,
        total: product_ids ? data.length : eligible.length,
      },
    };
  });
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
  fireEvent.click(await screen.findByRole("checkbox", { name: /Carrot/ }));
  changed = true;
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  await screen.findByRole("checkbox", { name: /Carrot/ });
  expect(screen.getByRole("button", { name: "2 selected" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  expect(
    await screen.findByText("This product is unavailable for the selected order type."),
  ).toBeVisible();
  expect(screen.getByText("Basil")).toBeVisible();
  expect(screen.getByRole("button", { name: "Add products" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: /Remove Basil/ })).toHaveFocus();
  expect(add).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Remove Basil/ }));
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  await waitFor(() => expect(add).toHaveBeenCalledWith([discontinued]));
});

it("keeps focus in the picker when removing a focused selected row", async () => {
  vi.mocked(listStoreProducts).mockResolvedValue({
    data: [active, discontinued],
    meta: { page: 1, page_size: 30, total: 2 },
  });
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
  fireEvent.click(await screen.findByRole("checkbox", { name: /Select Basil/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Select Carrot/ }));
  fireEvent.click(screen.getByRole("button", { name: "2 selected" }));
  const basil = screen.getByRole("checkbox", { name: /Remove Basil/ });
  const carrot = screen.getByRole("checkbox", { name: /Remove Carrot/ });
  basil.focus();
  fireEvent.click(basil);
  expect(carrot).toHaveFocus();
  fireEvent.click(carrot);
  expect(screen.getByRole("button", { name: "Back to catalog" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Back to catalog" }));
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
});

it("selects only unadded products on the current page and explains when a whole page won't fit", async () => {
  const list = vi.mocked(listStoreProducts);
  const kale = product("4", "Kale", "active");
  list.mockResolvedValue({
    data: [active, discontinued, kale],
    meta: { page: 1, page_size: 30, total: 3 },
  });
  const props = { opened: true, kind: "historical", onClose: vi.fn(), onAdd: vi.fn() } as const;
  const view = render(<StoreOrderProductPicker {...props} selected={[active]} />, { wrapper });
  const selectPage = await screen.findByRole("checkbox", { name: /Select products on this page/ });
  fireEvent.click(selectPage);
  expect(screen.getByRole("button", { name: "2 selected" })).toBeEnabled();
  expect(screen.getByRole("checkbox", { name: /Select Basil/ })).toBeDisabled();
  fireEvent.click(selectPage);
  expect(screen.getByText("0 selected")).toBeVisible();

  const almostFull = [
    active,
    ...Array.from({ length: 48 }, (_, index) => ({ id: `extra-${index}` })),
  ];
  view.rerender(<StoreOrderProductPicker {...props} selected={almostFull} />);
  expect(selectPage).toBeDisabled();
  expect(screen.getByText("Up to 50 product lines per order.")).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: /Select Carrot/ }));
  expect(screen.getByRole("checkbox", { name: /Select Kale/ })).toBeDisabled();
});

it("retains selections after a verification error and retries the same batch with fresh snapshots", async () => {
  const list = vi.mocked(listStoreProducts);
  const meta = { page: 1, page_size: 30, total: 1 };
  const updated = { ...active, sku: "RENAMED", retail_price_vnd: "16000" };
  list
    .mockResolvedValueOnce({ data: [active], meta })
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce({ data: [updated], meta: { ...meta, page_size: 50 } });
  const add = vi.fn();
  render(
    <StoreOrderProductPicker opened kind="new" selected={[]} onClose={vi.fn()} onAdd={add} />,
    { wrapper },
  );
  fireEvent.click(await screen.findByRole("checkbox", { name: /Select Basil/ }));
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("checkbox", { name: /Select Basil/ })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(add).toHaveBeenCalledWith([updated]));
  expect(list).toHaveBeenCalledTimes(3);
  expect(list).toHaveBeenLastCalledWith(
    { order_kind: "new", product_ids: [active.id] },
    expect.any(AbortSignal),
  );
});

it("discards a late verification after the modal closes", async () => {
  const list = vi.mocked(listStoreProducts);
  const response = { data: [active], meta: { page: 1, page_size: 50, total: 1 } };
  let finish = () => {};
  list.mockResolvedValueOnce(response).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(response);
      }),
  );
  const props = { kind: "new", selected: [], onClose: vi.fn(), onAdd: vi.fn() } as const;
  const view = render(<StoreOrderProductPicker {...props} opened />, { wrapper });
  fireEvent.click(await screen.findByRole("checkbox", { name: /Select Basil/ }));
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  const signal = list.mock.calls[1]?.[1];
  view.rerender(<StoreOrderProductPicker {...props} opened={false} />);
  expect(signal?.aborted).toBe(true);
  await act(async () => finish());
  expect(props.onAdd).not.toHaveBeenCalled();
});

it("does not add products when a concurrent catalog read withdraws access", async () => {
  const list = vi.mocked(listStoreProducts);
  const response = { data: [active], meta: { page: 1, page_size: 50, total: 1 } };
  let denyPage = () => {};
  let finishVerification = () => {};
  list.mockImplementation(({ page, product_ids }) => {
    if (product_ids) {
      return new Promise((resolve) => {
        finishVerification = () => resolve(response);
      });
    }
    if (page === 2) {
      return new Promise((_resolve, reject) => {
        denyPage = () => reject(Object.assign(new Error("forbidden"), { status: 403 }));
      });
    }
    return Promise.resolve({ data: [active], meta: { page: 1, page_size: 1, total: 2 } });
  });
  const add = vi.fn();
  render(
    <StoreOrderProductPicker opened kind="new" selected={[]} onClose={vi.fn()} onAdd={add} />,
    { wrapper },
  );
  fireEvent.click(await screen.findByRole("checkbox", { name: /Select Basil/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  await act(async () => denyPage());
  expect(await screen.findByRole("alert")).toBeVisible();
  await act(async () => finishVerification());
  expect(add).not.toHaveBeenCalled();
  expect(screen.queryByText("Basil")).not.toBeInTheDocument();
});
