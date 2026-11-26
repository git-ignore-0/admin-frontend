import { selectOption } from "./select-option";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoreProductList } from "@/components/store-product-list";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";
import { adminDictionaries } from "@/lib/admin-i18n";
import { ADMIN_SESSION_CHANGED_EVENT } from "@/lib/client-api";

const mocks = vi.hoisted(() => ({
  search: new URLSearchParams(),
  push: vi.fn(),
  categories: vi.fn(),
  products: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.search,
  usePathname: () => "/store-catalog/products",
}));
vi.mock("@/lib/commerce-api", () => ({
  listStoreCategories: mocks.categories,
  listStoreProducts: mocks.products,
}));

beforeEach(() => {
  mocks.search = new URLSearchParams("page=2&search=rau&status=draft");
  mocks.push.mockReset();
  mocks.categories.mockReset();
  mocks.products.mockReset();
  mocks.categories.mockResolvedValue([]);
  mocks.products.mockResolvedValue({ data: [], meta: { page: 2, page_size: 30, total: 70 } });
});
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.adminPageSession;
});

function renderList(element = <StoreProductList />) {
  return render(element, {
    wrapper: ({ children }) => <AdminI18nProvider initialLocale="vi">{children}</AdminI18nProvider>,
  });
}

describe("store product filters", () => {
  it("loads deep-linked filters and keeps changes in the URL for Back navigation", async () => {
    renderList();
    await waitFor(() =>
      expect(mocks.products).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, search: "rau", status: "draft" }),
        expect.any(AbortSignal),
      ),
    );
    selectOption(screen.getByLabelText("Hình thức bán"), "true");
    expect(mocks.push).toHaveBeenCalledWith(
      "/store-catalog/products?search=rau&status=draft&csa_eligible=true",
      { scroll: false },
    );
  });

  it("defaults to selling and distinguishes the explicit all filter", async () => {
    mocks.search = new URLSearchParams();
    const view = renderList();
    await waitFor(() =>
      expect(mocks.products).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "active", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    selectOption(screen.getByLabelText("Trạng thái"), "all");
    expect(mocks.push).toHaveBeenCalledWith("/store-catalog/products?status=all", {
      scroll: false,
    });
    mocks.search = new URLSearchParams("status=all");
    view.rerender(<StoreProductList />);
    await waitFor(() =>
      expect(mocks.products).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: undefined, page: 1 }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("shows product dates in the shared dd/MM/yyyy admin format", async () => {
    mocks.products.mockResolvedValue({
      data: [
        {
          id: "product-1",
          sku: "RAU-01",
          category_id: "category-1",
          category_slug: "rau",
          translations: [{ locale: "vi", name: "Rau muống" }],
          primary_image: null,
          retail_price_vnd: "10000",
          csa_quota_group_id: null,
          status: "active",
          updated_at: "2026-10-15T00:00:00Z",
        },
      ],
      meta: { page: 2, page_size: 30, total: 70 },
    });
    renderList();
    expect(await screen.findByText("Rau muống")).toBeVisible();
    expect(screen.getByText("15/10/2026")).toBeVisible();
  });

  it("distinguishes loading and a completed empty result with applied filters", async () => {
    const pending = Promise.withResolvers<{
      data: [];
      meta: { page: number; page_size: number; total: number };
    }>();
    mocks.products.mockReturnValueOnce(pending.promise);
    renderList();
    const copy = adminDictionaries.vi.storeCatalog;
    expect(screen.getByRole("status")).toHaveTextContent(copy.loading);
    expect(screen.queryByText(copy.noMatchingProducts)).not.toBeInTheDocument();
    await act(async () =>
      pending.resolve({ data: [], meta: { page: 2, page_size: 30, total: 0 } }),
    );
    expect(screen.getByText(copy.noMatchingProducts)).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("hides rows and totals for superseded filter and page requests", async () => {
    const oldFilter = Promise.withResolvers<ReturnType<typeof productPage>>();
    const newPage = Promise.withResolvers<ReturnType<typeof productPage>>();
    mocks.products
      .mockResolvedValueOnce(productPage("Previous query", 2, 70))
      .mockReturnValueOnce(oldFilter.promise)
      .mockReturnValueOnce(newPage.promise);
    const view = renderList();
    expect(await screen.findByText("Previous query")).toBeVisible();
    expect(screen.getByText("70 kết quả")).toBeVisible();

    mocks.search = new URLSearchParams("status=all");
    view.rerender(<StoreProductList />);
    expect(screen.queryByText("Previous query")).not.toBeInTheDocument();
    expect(screen.queryByText("70 kết quả")).not.toBeInTheDocument();
    const oldSignal = mocks.products.mock.calls[1][1] as AbortSignal;
    expect(oldSignal.aborted).toBe(false);

    mocks.search = new URLSearchParams("status=all&page=3");
    view.rerender(<StoreProductList />);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => newPage.reject(new Error("network_error")));
    expect(screen.getByRole("alert")).toHaveTextContent(adminDictionaries.vi.common.networkError);
    await act(async () => oldFilter.resolve(productPage("Late response", 1, 42)));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("42 kết quả")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it.each([403, 401])("retires rows and categories when a refresh receives %s", async (status) => {
    const pending = Promise.withResolvers<ReturnType<typeof productPage>>();
    mocks.search = new URLSearchParams();
    mocks.categories.mockResolvedValue([
      { id: "category-1", slug: "rau", translations: [{ locale: "vi", name: "Tên danh mục" }] },
    ]);
    mocks.products
      .mockResolvedValueOnce(productPage("Protected product", 1, 70))
      .mockReturnValueOnce(pending.promise);
    renderList();
    expect(await screen.findByText("Protected product")).toBeVisible();
    expect(within(screen.getByRole("table")).getByText("Tên danh mục")).toBeVisible();
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByText("Protected product")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      adminDictionaries.vi.storeCatalog.refreshing,
    );
    await act(async () =>
      pending.reject(
        Object.assign(new Error(status === 403 ? "forbidden" : "session_expired"), { status }),
      ),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Tên danh mục")).not.toBeInTheDocument();
    expect(screen.queryByText("70 kết quả")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("requires a fresh catalog read after the category filter loses access", async () => {
    const category = Promise.withResolvers<[]>();
    const products = Promise.withResolvers<ReturnType<typeof productPage>>();
    mocks.search = new URLSearchParams();
    mocks.categories.mockReturnValueOnce(category.promise);
    mocks.products
      .mockResolvedValueOnce(productPage("Original list", 1, 70))
      .mockReturnValueOnce(products.promise);
    renderList();
    expect(await screen.findByText("Original list")).toBeVisible();
    await act(async () => category.reject(Object.assign(new Error("forbidden"), { status: 403 })));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("70 kết quả")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(mocks.products).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Original list")).not.toBeInTheDocument();
    await act(async () => products.resolve(productPage("Verified list", 1, 1)));
    expect(screen.getByText("Verified list")).toBeVisible();
  });

  it("unmounts the protected list and aborts refresh when the bound session changes", async () => {
    const pending = Promise.withResolvers<ReturnType<typeof productPage>>();
    mocks.search = new URLSearchParams();
    mocks.products
      .mockResolvedValueOnce(productPage("Old session product", 1, 70))
      .mockReturnValueOnce(pending.promise);
    renderList(
      <AdminShell
        user={{ name: "Admin", email: null, login_phone_number: null }}
        sessionBinding="catalog-session"
      >
        <StoreProductList />
      </AdminShell>,
    );
    expect(await screen.findByText("Old session product")).toBeVisible();
    fireEvent.submit(screen.getByRole("search"));
    const signal = mocks.products.mock.calls[1][1] as AbortSignal;
    act(() => {
      window.dispatchEvent(
        new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: "catalog-session" }),
      );
    });
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await act(async () => pending.resolve(productPage("Late old session product", 1, 70)));
    expect(screen.queryByText("Late old session product")).not.toBeInTheDocument();
  });
});

function productPage(name: string, page: number, total: number) {
  return {
    data: [
      {
        id: "product-1",
        sku: "RAU-01",
        category_id: "category-1",
        category_slug: "rau",
        translations: [{ locale: "vi", name }],
        primary_image: null,
        retail_price_vnd: "10000",
        csa_quota_group_id: null,
        status: "active",
        updated_at: "2026-10-15T00:00:00Z",
      },
    ],
    meta: { page, page_size: 30, total },
  };
}
