import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoreCategoryEditor } from "@/components/store-category-editor";
import { StoreCategoryDetail } from "@/components/store-category-detail";
import { StoreCategoryList } from "@/components/store-category-list";
import { adminDictionaries } from "@/lib/admin-i18n";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/commerce-api", () => ({
  listStoreCategories: mocks.list,
  getStoreCategory: mocks.get,
  saveStoreCategory: mocks.save,
  deleteStoreCategory: mocks.remove,
}));
vi.mock("@/components/admin-i18n-provider", () => ({
  useAdminI18n: () => ({ locale: "vi", t: adminDictionaries.vi }),
}));
vi.mock("@/components/toast-provider", () => ({ useToast: () => mocks.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, back: vi.fn() }),
}));

const category = (id: string, parent_id: string | null, depth: number) => ({
  id,
  parent_id,
  slug: id,
  sort_order: 0,
  is_active: true,
  depth,
  has_children: depth < 3,
  product_count: 0,
  translations: [{ locale: "vi", name: id, description: "" }],
  created_at: "",
  updated_at: "",
});

beforeEach(() => {
  mocks.list.mockReset();
  mocks.get.mockReset();
  mocks.save.mockReset();
  mocks.remove.mockReset();
  mocks.replace.mockReset();
  mocks.toast.mockReset();
  mocks.list.mockResolvedValue([
    category("leaf", "child", 3),
    category("root", null, 1),
    category("child", "root", 2),
  ]);
});
afterEach(cleanup);

describe("store category administration", () => {
  it("renders an unordered response as a labelled three-level list", async () => {
    render(<StoreCategoryList />);
    expect(await screen.findByRole("link", { name: "leaf" })).toBeVisible();
    expect(screen.getByText("Cấp 3")).toBeVisible();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "root",
      "child",
      "leaf",
    ]);
  });

  it("excludes descendants as parents and saves an incomplete inactive draft", async () => {
    mocks.get.mockResolvedValue(category("child", "root", 2));
    mocks.save.mockResolvedValue(category("child", "root", 2));
    render(<StoreCategoryEditor categoryId="child" />);
    const parent = await screen.findByLabelText("Danh mục cha");
    expect(parent).toHaveValue("root");
    expect(screen.queryByRole("option", { name: "leaf" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "inactive" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].is_active).toBe(false);
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("slug");
    expect(screen.queryByLabelText(/Đường dẫn/)).not.toBeInTheDocument();
  });

  it("keeps the current inactive parent visible while editing an inactive child", async () => {
    const inactiveRoot = { ...category("root", null, 1), is_active: false };
    const inactiveChild = { ...category("child", "root", 2), is_active: false };
    mocks.list.mockResolvedValue([inactiveRoot, inactiveChild]);
    mocks.get.mockResolvedValue(inactiveChild);

    render(<StoreCategoryEditor categoryId="child" />);

    const parent = await screen.findByLabelText("Danh mục cha");
    expect(parent).toHaveValue("root");
    expect(screen.getByRole("option", { name: "root" })).toBeInTheDocument();
  });

  it("keeps a protected category and offers deactivation after a 409 delete", async () => {
    mocks.get.mockResolvedValue(category("root", null, 1));
    mocks.remove.mockRejectedValue({ status: 409 });
    mocks.save.mockResolvedValue({ ...category("root", null, 1), is_active: false });
    render(<StoreCategoryDetail categoryId="root" />);
    fireEvent.click(await screen.findByRole("button", { name: "Xóa" }));
    fireEvent.click(screen.getByRole("dialog").querySelector(".button.danger")!);
    expect(await screen.findByText(/đang được sử dụng/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Tắt hiển thị" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false }),
        "root",
      ),
    );
  });

  it("recovers from a transient detail error when retrying", async () => {
    mocks.get
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(category("root", null, 1));
    render(<StoreCategoryDetail categoryId="root" />);

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    expect(await screen.findByRole("heading", { name: "root" })).toBeVisible();
  });
});
