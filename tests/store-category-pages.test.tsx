import { selectOption } from "./select-option";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoreCategoryEditor } from "@/components/store-category-editor";
import { StoreCategoryDetail } from "@/components/store-category-detail";
import { StoreCategoryList } from "@/components/store-category-list";
import { AdminQueryProvider } from "@/components/admin-query-provider";
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
  useOptionalAdminI18n: () => undefined,
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
    const loadingList = screen.getByRole("status").closest("[data-list-paper]")!;
    const loadingScroll = loadingList.querySelector<HTMLElement>(
      '[role="region"][aria-hidden="true"]',
    );
    const loadingWidth = loadingScroll?.style.getPropertyValue("--table-min-width");
    expect(loadingWidth).toBe("calc(30rem * var(--mantine-scale))");
    expect(loadingScroll?.querySelectorAll("th")).toHaveLength(4);
    expect(loadingScroll?.querySelector("a, button, input, [tabindex]")).toBeNull();
    expect(await screen.findByRole("link", { name: "leaf" })).toBeVisible();
    expect(screen.getByText("Cấp 3")).toBeVisible();
    const table = screen.getByRole("table", { name: "Danh mục" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    const scroller = screen.getByRole("region", { name: "Danh mục" });
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller).toContainElement(table);
    expect(scroller.style.getPropertyValue("--table-min-width")).toBe(loadingWidth);
    expect(scroller.closest("[data-list-paper]")).toBe(loadingList);
    expect(scroller.closest("[data-list-paper]")?.querySelector("footer")).toBeVisible();
    expect(scroller.querySelector("footer")).toBeNull();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "root",
      "child",
      "leaf",
    ]);
  });

  it("loads the applied status without showing rows from the previous filter", async () => {
    let resolve!: (rows: []) => void;
    const pending = new Promise<[]>((done) => {
      resolve = done;
    });
    mocks.list
      .mockResolvedValueOnce([category("active-only", null, 1)])
      .mockReturnValueOnce(pending);

    render(<StoreCategoryList />);
    expect(await screen.findByRole("link", { name: "active-only" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    selectOption(screen.getByRole("combobox", { name: "Trạng thái" }), "false");
    expect(screen.queryByRole("link", { name: "active-only" })).not.toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Đang tải dữ liệu");
    expect(status.closest("[data-list-paper]")?.querySelector("[aria-hidden] table")).toBeTruthy();
    expect(mocks.list.mock.calls.at(-1)?.[0]).toEqual({ search: "", is_active: false });

    resolve([]);
    expect(await screen.findByText("Không có danh mục khớp bộ lọc.")).toBeVisible();
    const refresh = screen.getByRole("button", { name: "Làm mới danh sách" });
    mocks.list.mockResolvedValueOnce([category("refreshed", null, 1)]);
    fireEvent.click(refresh);
    expect(await screen.findByRole("link", { name: "refreshed" })).toBeVisible();
    expect(mocks.list).toHaveBeenCalledTimes(3);
    expect(mocks.list.mock.calls.at(-1)?.[0]).toEqual({ search: "", is_active: false });
  });

  it("excludes descendants as parents and saves an incomplete inactive draft", async () => {
    mocks.get.mockResolvedValue(category("child", "root", 2));
    mocks.save.mockResolvedValue(category("child", "root", 2));
    render(<StoreCategoryEditor categoryId="child" />);
    const parent = await screen.findByLabelText("Danh mục cha");
    expect(parent).toHaveValue("root");
    fireEvent.click(parent);
    expect(screen.queryByRole("option", { name: "leaf" })).not.toBeInTheDocument();
    selectOption(screen.getByLabelText("Trạng thái"), "inactive");
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
    fireEvent.click(parent);
    expect(screen.getByRole("option", { name: "root" })).toBeInTheDocument();
  });

  it("keeps a protected category and offers deactivation after a 409 delete", async () => {
    mocks.get.mockResolvedValue(category("root", null, 1));
    mocks.remove.mockRejectedValue({ status: 409 });
    mocks.save.mockResolvedValue({ ...category("root", null, 1), is_active: false });
    render(
      <AdminQueryProvider>
        <StoreCategoryDetail categoryId="root" />
      </AdminQueryProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Xóa" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
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
    render(
      <AdminQueryProvider>
        <StoreCategoryDetail categoryId="root" />
      </AdminQueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    expect(await screen.findByRole("heading", { name: "root" })).toBeVisible();
  });
});
