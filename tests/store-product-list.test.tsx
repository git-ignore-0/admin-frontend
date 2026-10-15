import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoreProductList } from "@/components/store-product-list";
import { adminDictionaries } from "@/lib/admin-i18n";

const mocks = vi.hoisted(() => ({
  search: new URLSearchParams(),
  push: vi.fn(),
  categories: vi.fn(),
  products: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.search,
}));
vi.mock("@/components/admin-i18n-provider", () => ({
  useAdminI18n: () => ({ locale: "vi", t: adminDictionaries.vi }),
}));
vi.mock("@/lib/commerce-api", () => ({
  listStoreCategories: mocks.categories,
  listStoreProducts: mocks.products,
}));

beforeEach(() => {
  mocks.search = new URLSearchParams("page=2&search=rau&is_published=false");
  mocks.push.mockReset();
  mocks.categories.mockReset();
  mocks.products.mockReset();
  mocks.categories.mockResolvedValue([]);
  mocks.products.mockResolvedValue({ data: [], meta: { page: 2, page_size: 30, total: 70 } });
});
afterEach(cleanup);

describe("store product filters", () => {
  it("loads deep-linked filters and keeps changes in the URL for Back navigation", async () => {
    render(<StoreProductList />);
    await waitFor(() =>
      expect(mocks.products).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, search: "rau", is_published: false }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Hình thức bán"), { target: { value: "true" } });
    expect(mocks.push).toHaveBeenCalledWith(
      "/store-catalog/products?search=rau&is_published=false&csa_eligible=true",
      { scroll: false },
    );
  });
});
