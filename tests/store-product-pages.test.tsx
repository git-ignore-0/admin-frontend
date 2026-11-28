import { selectOption } from "./select-option";
import {
  act,
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "@/tests/deferred";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Editor } from "@tiptap/react";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { StoreProductDetail } from "@/components/store-product-detail";
import { StoreProductEditor } from "@/components/store-product-editor";
import ProductRouteLoading from "@/app/(admin)/store-catalog/products/loading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { farmDetailKey, farmListKey } from "@/lib/farm-query";

function render(ui: ReactElement) {
  const client = new QueryClient();
  return renderView(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

const mocks = vi.hoisted(() => ({
  locale: "vi" as "vi" | "en",
  search: new URLSearchParams(),
  pathname: "/store-catalog/products",
  categories: vi.fn(),
  groups: vi.fn(),
  product: vi.fn(),
  save: vi.fn(),
  creation: vi.fn(),
  transition: vi.fn(),
  refresh: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  deleteImage: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  isCurrent: vi.fn(),
}));
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const createObjectUrl = vi.fn(() => "blob:store-product-preview");
const revokeObjectUrl = vi.fn();
vi.mock("@/lib/commerce-api", () => ({
  listStoreCategories: mocks.categories,
  saveStoreProduct: mocks.save,
  getStoreProductCreation: mocks.creation,
  transitionStoreProduct: mocks.transition,
  getStoreProduct: mocks.product,
  deleteStoreProduct: mocks.remove,
  uploadStoreProductImage: mocks.upload,
  deleteStoreProductImage: mocks.deleteImage,
}));
vi.mock("@/lib/membership-catalog-adapter", () => ({ listActiveQuotaGroups: mocks.groups }));
vi.mock("@/components/admin-i18n-provider", () => ({
  useOptionalAdminI18n: () => undefined,
  useAdminI18n: () => ({ locale: mocks.locale, t: adminDictionaries[mocks.locale] }),
}));
vi.mock("@/components/toast-provider", () => ({ useToast: () => mocks.toast }));
vi.mock("@/components/admin-query-provider", () => ({
  useIsAdminQueryScopeCurrent: () => mocks.isCurrent,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh, back: vi.fn() }),
  useSearchParams: () => mocks.search,
  usePathname: () => mocks.pathname,
}));

beforeEach(() => {
  mocks.locale = "vi";
  mocks.search = new URLSearchParams();
  mocks.pathname = "/store-catalog/products";
  Object.values(mocks).forEach((mock) => {
    if (typeof mock === "function") mock.mockReset();
  });
  mocks.isCurrent.mockReturnValue(true);
  createObjectUrl.mockClear();
  revokeObjectUrl.mockClear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectUrl,
  });
  mocks.categories.mockResolvedValue([
    {
      id: "root",
      slug: "thuc-pham",
      parent_id: null,
      is_active: true,
      has_children: true,
      translations: [{ locale: "vi", name: "Thực phẩm", description: "" }],
    },
    {
      id: "vegetables",
      slug: "rau",
      parent_id: "root",
      is_active: true,
      has_children: true,
      translations: [{ locale: "vi", name: "Rau", description: "" }],
    },
    {
      id: "leaf",
      slug: "rau-la",
      parent_id: "vegetables",
      is_active: true,
      has_children: false,
      translations: [{ locale: "vi", name: "Rau lá", description: "" }],
    },
  ]);
  mocks.groups.mockResolvedValue({
    data: [{ id: "quota", name: "Rau", is_active: true, translations: [] }],
    meta: { page: 1, page_size: 30, total: 1 },
  });
  mocks.save.mockResolvedValue({ id: "saved" });
  mocks.product.mockResolvedValue(null);
  mocks.deleteImage.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue({
    id: "image-1",
    url: "/image",
    width: 10,
    height: 10,
    variants: [],
  });
});

const storedProduct = {
  version: 1,
  id: "product-1",
  category_id: "leaf",
  category_slug: "rau-la",
  sku: "RAU-01",
  slug: "rau-01",
  unit_size: "0.500",
  unit_label_vi: "kg",
  unit_label_en: "kg",
  retail_price_vnd: "90000",
  csa_quota_group_id: "quota",
  csa_quota_group: { id: "quota", name: "Rau", translations: [] },
  csa_quota_cost: 1,
  primary_image_id: null,
  primary_image: null,
  status: "draft",
  capabilities: {
    edit_identity: { allowed: true, reasons: [] },
    edit_csa: { allowed: true, reasons: [] },
    delete: { allowed: true, reasons: [] },
  },
  translations: [
    { locale: "vi" as const, name: "Rau muống", short_description: "", description: "" },
    { locale: "en" as const, name: "Water spinach", short_description: "", description: "" },
  ],
  created_at: "",
  updated_at: "",
};
afterEach(cleanup);
afterAll(() => {
  if (originalCreateObjectUrl)
    Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
  else delete (URL as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL;
  if (originalRevokeObjectUrl)
    Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
  else delete (URL as { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL;
});

async function fillBase() {
  await screen.findByLabelText(/Mã quản lý sản phẩm/);
  fireEvent.change(screen.getByLabelText(/Mã quản lý sản phẩm/), {
    target: { value: "rau-01" },
  });
  selectOption(screen.getByRole("combobox", { name: /Danh mục sản phẩm/ }), "leaf");
  fireEvent.change(screen.getByLabelText(/Số lượng mỗi đơn vị bán/), {
    target: { value: "0.500" },
  });
  fireEvent.change(screen.getByLabelText(/Tên đơn vị \(tiếng Việt\)/), {
    target: { value: "kg" },
  });
  fireEvent.change(screen.getByLabelText(/Tên đơn vị \(tiếng Anh\)/), {
    target: { value: "kg" },
  });
  fireEvent.change(screen.getByLabelText(/Giá mỗi đơn vị bán/), { target: { value: "90000" } });
}

function ProductTrail() {
  const items = useAdminBreadcrumbs([]);
  return (
    <nav aria-label="Product trail">
      {items.map(({ label, href }) =>
        href ? (
          <a key={label} href={href}>
            {label}
          </a>
        ) : (
          <span key={label}>{label}</span>
        ),
      )}
    </nav>
  );
}

it("retains Product ancestor links in the route loading fallback", () => {
  mocks.locale = "en";
  mocks.pathname = "/store-catalog/products/product-1/edit";
  mocks.search = new URLSearchParams("search=spinach&status=discontinued&page=2");
  render(
    <AdminBreadcrumbProvider pathname={mocks.pathname} search={mocks.search.toString()}>
      <ProductTrail />
      <ProductRouteLoading />
    </AdminBreadcrumbProvider>,
  );
  const trail = within(screen.getByRole("navigation", { name: "Product trail" }));
  expect(trail.getByRole("link", { name: "Products" })).toHaveAttribute(
    "href",
    "/store-catalog/products?search=spinach&status=discontinued&page=2",
  );
  expect(trail.getByRole("link", { name: "Product details" })).toHaveAttribute(
    "href",
    "/store-catalog/products/product-1?search=spinach&status=discontinued&page=2",
  );
  expect(trail.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Edit" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Loading page");
  expect(mocks.product).not.toHaveBeenCalled();
});

describe("store product editor", () => {
  it.each([
    [undefined, "", "/store-catalog/products"],
    [
      undefined,
      "?search=rau&category_id=leaf&status=draft&csa_eligible=false&page=2",
      "/store-catalog/products",
    ],
    ["product-1", "", "/store-catalog/products/product-1"],
    [
      "product-1",
      "?search=rau&category_id=leaf&status=draft&csa_eligible=false&page=2",
      "/store-catalog/products/product-1",
    ],
  ])(
    "cancels from the %s editor to a stable destination with its list context",
    async (id, query, path) => {
      mocks.search = new URLSearchParams(query);
      mocks.product.mockResolvedValue(storedProduct);
      render(<StoreProductEditor productId={id} />);
      fireEvent.click(await screen.findByRole("button", { name: "Hủy" }));
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(`${path}${query}`));
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );

  it("keeps a single create heading and a contextual parent breadcrumb", async () => {
    mocks.search = new URLSearchParams("search=rau&page=2");
    render(
      <AdminBreadcrumbProvider
        pathname="/store-catalog/products/new"
        search={mocks.search.toString()}
      >
        <ProductTrail />
        <StoreProductEditor />
      </AdminBreadcrumbProvider>,
    );
    await screen.findByRole("button", { name: /^Lưu$/ });
    const trail = within(screen.getByRole("navigation", { name: "Product trail" }));
    expect(trail.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute(
      "href",
      "/store-catalog/products?search=rau&page=2",
    );
    expect(trail.getByText("Thêm sản phẩm")).toBeVisible();
    expect(trail.queryByRole("link", { name: "Thêm sản phẩm" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("Thêm sản phẩm");
    expect(screen.queryByRole("link", { name: /quay lại/i })).not.toBeInTheDocument();
    expect(mocks.product).not.toHaveBeenCalled();
  });

  it("uses a localized edit breadcrumb during loading and clears the product name after access is lost", async () => {
    let finish!: (value: typeof storedProduct) => void;
    mocks.search = new URLSearchParams("search=rau&page=2");
    mocks.product.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mocks.save.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    render(
      <AdminBreadcrumbProvider
        pathname="/store-catalog/products/product-1/edit"
        search={mocks.search.toString()}
      >
        <ProductTrail />
        <StoreProductEditor productId="product-1" />
      </AdminBreadcrumbProvider>,
    );
    const trail = within(screen.getByRole("navigation", { name: "Product trail" }));
    expect(trail.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute(
      "href",
      "/store-catalog/products?search=rau&page=2",
    );
    expect(
      trail.getByRole("link", { name: adminDictionaries.vi.breadcrumb.productDetails }),
    ).toHaveAttribute("href", "/store-catalog/products/product-1?search=rau&page=2");
    expect(trail.queryByRole("link", { name: "Chỉnh sửa" })).not.toBeInTheDocument();
    await act(async () => finish(storedProduct));
    expect(trail.getByRole("link", { name: "Rau muống" })).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Lưu$/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Hủy$/ })).toHaveLength(1);
    expect(screen.getAllByText(adminDictionaries.vi.storeCatalog.productDraft)).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Tên sản phẩm" }), {
      target: { value: "Tên chưa lưu" },
    });
    expect(trail.getByRole("link", { name: "Rau muống" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Lưu$/ }));
    await waitFor(() => expect(trail.queryByText("Rau muống")).not.toBeInTheDocument());
    expect(trail.getByText(adminDictionaries.vi.breadcrumb.productDetails)).toBeVisible();
  });

  it("shows stored selling-unit quantities without insignificant zeroes", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    const page = render(<StoreProductEditor productId="product-1" />);

    expect(await screen.findByLabelText(/Số lượng mỗi đơn vị bán/)).toHaveValue("0.5");

    page.unmount();
    render(<StoreProductDetail productId="product-1" />);
    expect(await screen.findByText(/0\.5 kg/)).toBeVisible();
    expect(screen.queryByText(/0\.500 kg/)).not.toBeInTheDocument();
  });

  it("explains why a selling unit cannot change after stock batches exist", async () => {
    mocks.product.mockResolvedValueOnce(storedProduct).mockResolvedValueOnce({
      ...storedProduct,
      capabilities: {
        ...storedProduct.capabilities,
        edit_identity: { allowed: false, reasons: [{ code: "stock_batch" }] },
      },
    });
    mocks.save.mockRejectedValue(Object.assign(new Error("product_unit_in_use"), { status: 409 }));
    render(<StoreProductEditor productId="product-1" />);
    fireEvent.change(await screen.findByLabelText(/Số lượng mỗi đơn vị bán/), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText(/Không thể thay đổi mã SKU và đơn vị bán/)).toBeVisible();
    expect(screen.getByLabelText(/Số lượng mỗi đơn vị bán/)).toHaveAttribute("readonly");
    expect(mocks.save).toHaveBeenCalled();
  });

  it("blocks saving after a failed lock reload and recovers only server-locked fields", async () => {
    const locked = {
      ...storedProduct,
      status: "active",
      sku: "RAU-SERVER",
      unit_size: "2.000",
      csa_quota_group_id: "new-quota",
      csa_quota_group: {
        id: "new-quota",
        name: "Nhóm quota từ máy chủ",
        translations: [],
      },
      csa_quota_cost: 3,
      capabilities: {
        ...storedProduct.capabilities,
        edit_identity: { allowed: false, reasons: [{ code: "csa_hold" }] },
        edit_csa: { allowed: false, reasons: [{ code: "csa_hold" }] },
      },
    };
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(locked);
    mocks.save.mockRejectedValueOnce(
      Object.assign(new Error("product_csa_hold_in_use"), { status: 409 }),
    );
    const { container } = render(<StoreProductEditor productId="product-1" />);
    fireEvent.change(await screen.findByLabelText(/Mã quản lý sản phẩm/), {
      target: { value: "RAU-DRAFT" },
    });
    fireEvent.change(screen.getByLabelText(/Giá mỗi đơn vị bán/), { target: { value: "95000" } });
    const editor = (await screen.findByLabelText("Mô tả chi tiết")) as HTMLElement & {
      editor: Editor;
    };
    act(() => editor.editor.commands.setContent("<p>Giữ mô tả đang sửa</p>", true));
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    const retry = await screen.findByRole("button", { name: "Thử lại" });
    expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();
    expect(screen.queryByText(/Đã tải lại thông tin sản phẩm/)).not.toBeInTheDocument();
    fireEvent.submit(container.querySelector("form")!);
    expect(mocks.save).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);
    expect(await screen.findByDisplayValue("RAU-SERVER")).toHaveAttribute("readonly");
    expect(screen.getByDisplayValue("2")).toHaveAttribute("readonly");
    const lockedQuotaGroup = screen.getByRole("textbox", { name: "Nhóm quota CSA" });
    expect(lockedQuotaGroup).toHaveValue("Nhóm quota từ máy chủ");
    expect(lockedQuotaGroup).toHaveAttribute("readonly");
    fireEvent.click(lockedQuotaGroup);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toHaveAttribute("readonly");
    expect(screen.getByDisplayValue("95000")).toBeVisible();
    expect(screen.getByText("Đang bán")).toBeVisible();
    expect(screen.getByAltText(adminDictionaries.vi.storeCatalog.imagePreviewAlt)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    const [payload, id] = mocks.save.mock.calls[1];
    expect(id).toBe("product-1");
    expect(payload).toMatchObject({
      retail_price_vnd: "95000",
      primary_image_id: "image-1",
      translations: expect.arrayContaining([
        expect.objectContaining({ locale: "vi", description: "Giữ mô tả đang sửa" }),
      ]),
    });
    for (const field of [
      "sku",
      "unit_size",
      "unit_label_vi",
      "unit_label_en",
      "csa_quota_group_id",
      "csa_quota_cost",
      "status",
      "is_active",
      "is_published",
    ]) {
      expect(payload).not.toHaveProperty(field);
    }
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  });

  it("hides protected product fields if a capability recovery returns 403", async () => {
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
    mocks.save.mockRejectedValueOnce(
      Object.assign(new Error("product_unit_in_use"), { status: 409 }),
    );
    render(<StoreProductEditor productId="product-1" />);
    await screen.findByDisplayValue("RAU-01");
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText(adminDictionaries.vi.common.forbidden)).toBeVisible();
    expect(screen.queryByDisplayValue("RAU-01")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it.each([
    { ...storedProduct, capabilities: undefined },
    { ...storedProduct, id: "wrong-product" },
  ])("keeps saving blocked after an invalid recovery response", async (response) => {
    mocks.product.mockResolvedValueOnce(storedProduct).mockResolvedValueOnce(response);
    mocks.save.mockRejectedValueOnce(
      Object.assign(new Error("product_unit_in_use"), { status: 409 }),
    );
    render(<StoreProductEditor productId="product-1" />);
    fireEvent.change(await screen.findByLabelText(/Giá mỗi đơn vị bán/), {
      target: { value: "95000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByRole("button", { name: "Thử lại" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();
    expect(screen.getByDisplayValue("95000")).toBeVisible();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("ignores late capability recovery for a product the editor has left", async () => {
    let finishRecovery!: (value: typeof storedProduct) => void;
    const pendingRecovery = new Promise<typeof storedProduct>((resolve) => {
      finishRecovery = resolve;
    });
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockReturnValueOnce(pendingRecovery)
      .mockResolvedValueOnce({ ...storedProduct, id: "product-2", sku: "RAU-02" });
    mocks.save.mockRejectedValueOnce(
      Object.assign(new Error("product_unit_in_use"), { status: 409 }),
    );
    const page = render(<StoreProductEditor productId="product-1" />);
    await screen.findByDisplayValue("RAU-01");
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.product).toHaveBeenCalledTimes(2));
    const signal = mocks.product.mock.calls[1][1] as AbortSignal;

    page.rerender(<StoreProductEditor productId="product-2" />);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByDisplayValue("RAU-01")).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("RAU-02")).toBeEnabled();
    await act(async () => finishRecovery(storedProduct));
    expect(screen.getByDisplayValue("RAU-02")).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("updates selling-state validation after a draft started selling during editing", async () => {
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockResolvedValueOnce({ ...storedProduct, status: "active" });
    mocks.save.mockRejectedValueOnce(
      Object.assign(new Error("validation_error"), { status: 400, field: "primary_image_id" }),
    );
    render(<StoreProductEditor productId="product-1" />);
    fireEvent.change(await screen.findByLabelText(/Giá mỗi đơn vị bán/), {
      target: { value: "95000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đang bán")).toBeVisible();
    expect(screen.getByDisplayValue("95000")).toBeVisible();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText(adminDictionaries.vi.storeCatalog.imageRequired)).toBeVisible();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error("network_error"),
    Object.assign(new Error("upstream_timeout"), { status: 504 }),
    Object.assign(new Error("invalid_response"), { status: 200 }),
  ])(
    "checks the product after an uncertain PATCH and keeps its referenced image",
    async (reason) => {
      const savedImage = { id: "image-1", url: "/image", width: 10, height: 10, variants: [] };
      mocks.product.mockResolvedValueOnce(storedProduct).mockResolvedValueOnce({
        ...storedProduct,
        primary_image_id: savedImage.id,
        primary_image: savedImage,
      });
      mocks.save.mockRejectedValueOnce(reason);
      const { container, unmount } = render(<StoreProductEditor productId="product-1" />);
      fireEvent.change(await screen.findByLabelText(/Giá mỗi đơn vị bán/), {
        target: { value: "95000" },
      });
      const editor = (await screen.findByLabelText("Mô tả chi tiết")) as HTMLElement & {
        editor: Editor;
      };
      act(() => editor.editor.commands.setContent("<p><strong>Bản đang sửa</strong></p>", true));
      fireEvent.change(container.querySelector('input[type="file"]')!, {
        target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
      });
      fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/Có thể sản phẩm đã được lưu/i);
      expect(screen.getByRole("button", { name: "Lưu" })).toBeEnabled();
      expect(screen.getByDisplayValue("95000")).toBeVisible();
      expect(editor.querySelector("strong")).toHaveTextContent("Bản đang sửa");
      expect(screen.getByAltText(adminDictionaries.vi.storeCatalog.imagePreviewAlt)).toBeVisible();
      expect(mocks.product).toHaveBeenCalledTimes(2);
      expect(mocks.product.mock.calls[1][0]).toBe("product-1");
      expect(mocks.save).toHaveBeenCalledTimes(1);
      expect(mocks.toast).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
      expect(screen.getByText("Chưa chọn ảnh")).toBeVisible();
      unmount();
      expect(mocks.deleteImage).not.toHaveBeenCalled();
    },
  );

  it("blocks PATCH until a failed verification is retried with GET", async () => {
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(storedProduct);
    mocks.save.mockRejectedValueOnce(new Error("request_timeout"));
    const { container, unmount } = render(<StoreProductEditor productId="product-1" />);
    fireEvent.change(await screen.findByLabelText(/Giá mỗi đơn vị bán/), {
      target: { value: "95000" },
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    const retry = await screen.findByRole("button", { name: "Thử lại" });
    expect(screen.getByRole("alert")).toHaveTextContent(/Có thể sản phẩm đã được lưu/i);
    expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();
    fireEvent.submit(container.querySelector("form")!);
    expect(mocks.save).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu" })).toBeEnabled());
    expect(screen.getByDisplayValue("95000")).toBeVisible();
    expect(screen.getByAltText(adminDictionaries.vi.storeCatalog.imagePreviewAlt)).toBeVisible();
    expect(mocks.product.mock.calls.map(([id]) => id)).toEqual([
      "product-1",
      "product-1",
      "product-1",
    ]);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
    unmount();
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  });

  it("protects the pending upload when switching products during uncertain PATCH recovery", async () => {
    const latest = {
      ...storedProduct,
      primary_image_id: "image-1",
      primary_image: { id: "image-1", url: "/image", width: 10, height: 10, variants: [] },
    };
    let finishRecovery!: (value: typeof latest) => void;
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockReturnValueOnce(new Promise((resolve) => (finishRecovery = resolve)))
      .mockResolvedValueOnce({ ...storedProduct, id: "product-2", sku: "RAU-02" });
    mocks.save.mockRejectedValueOnce(new Error("network_error"));
    const page = render(<StoreProductEditor productId="product-1" />);
    await screen.findByDisplayValue("RAU-01");
    fireEvent.change(page.container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.product).toHaveBeenCalledTimes(2));
    const signal = mocks.product.mock.calls[1][1] as AbortSignal;

    page.rerender(<StoreProductEditor productId="product-2" />);
    expect(signal.aborted).toBe(true);
    expect(await screen.findByDisplayValue("RAU-02")).toBeEnabled();
    await act(async () => finishRecovery(latest));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.deleteImage).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps unsaved product edits when the Admin language changes", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    const page = render(<StoreProductEditor productId="product-1" />);
    fireEvent.change(await screen.findByDisplayValue("RAU-01"), {
      target: { value: "RAU-DRAFT" },
    });
    fireEvent.change(screen.getAllByLabelText("Chọn ảnh")[0], {
      target: { files: [new File(["image"], "draft.webp", { type: "image/webp" })] },
    });
    mocks.locale = "en";
    page.rerender(<StoreProductEditor productId="product-1" />);
    expect(screen.getByDisplayValue("RAU-DRAFT")).toBeVisible();
    expect(screen.getByText("draft.webp")).toBeVisible();
    expect(mocks.product).toHaveBeenCalledTimes(1);
    expect(mocks.categories).toHaveBeenCalledTimes(1);
  });

  it("keeps an inactive current category selectable while editing a draft", async () => {
    mocks.categories.mockResolvedValue([
      {
        id: "leaf",
        slug: "rau-la",
        parent_id: null,
        is_active: false,
        has_children: false,
        translations: [{ locale: "vi", name: "Rau lá", description: "" }],
      },
    ]);
    mocks.product.mockResolvedValue(storedProduct);
    render(<StoreProductEditor productId="product-1" />);
    fireEvent.click(await screen.findByRole("combobox", { name: /Danh mục sản phẩm/ }));
    expect(await screen.findByRole("option", { name: "Rau lá" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  });

  it("shows names as optional when creating a draft", async () => {
    render(<StoreProductEditor />);
    expect(await screen.findByLabelText("Tên sản phẩm")).not.toBeRequired();
    expect(screen.queryByLabelText("Xuất bản")).not.toBeInTheDocument();
  });

  it("localizes the CSA quota group in the editor", async () => {
    mocks.locale = "en";
    mocks.groups.mockResolvedValue({
      data: [
        {
          id: "quota",
          name: "Rau",
          is_active: true,
          translations: [
            { locale: "vi", name: "Rau", short_description: "" },
            { locale: "en", name: "Vegetables", short_description: "" },
          ],
        },
      ],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    render(<StoreProductEditor />);
    selectOption(await screen.findByRole("combobox", { name: "Sale type" }), "yes");
    const quotaGroup = await screen.findByRole("combobox", { name: /CSA quota group/ });
    await waitFor(() => expect(quotaGroup).toBeEnabled());
    fireEvent.click(quotaGroup);
    expect(await screen.findByRole("option", { name: "Vegetables" })).toBeInTheDocument();
  });
  it("explains SKU and selling-unit fields with examples", async () => {
    render(<StoreProductEditor />);
    const sku = await screen.findByPlaceholderText("VD: RAU-MUONG-500G");
    expect(sku).toBeRequired();
    expect(sku).toHaveAccessibleDescription(/Mã duy nhất để quản lý sản phẩm/);
    expect(screen.getByPlaceholderText("VD: 500 hoặc 1")).toHaveAccessibleDescription(
      /Chỉ nhập phần số/,
    );
    expect(screen.getByPlaceholderText("VD: g, kg, mớ, bó, quả")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("VD: g, kg, bunch, piece")).toBeInTheDocument();
    const unitVi = screen.getByLabelText(/Tên đơn vị \(tiếng Việt\)/);
    const unitEn = screen.getByLabelText(/Tên đơn vị \(tiếng Anh\)/);
    const unitSize = screen.getByLabelText(/Số lượng mỗi đơn vị bán/);
    expect(unitVi.compareDocumentPosition(unitEn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      unitSize.compareDocumentPosition(unitVi) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows only selectable categories with their full hierarchy", async () => {
    render(<StoreProductEditor />);
    fireEvent.click(await screen.findByRole("combobox", { name: /Danh mục sản phẩm/ }));
    expect(
      await screen.findByRole("option", { name: "Thực phẩm → Rau → Rau lá" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Thực phẩm" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Danh mục sản phẩm/ })).toHaveAccessibleDescription(
      /Chọn cấp cụ thể nhất/,
    );
  });

  it("keeps the full description inside the matching language tab", async () => {
    render(<StoreProductEditor />);
    await screen.findByRole("heading", { name: "Nội dung sản phẩm" });
    expect(screen.getByLabelText(/Tên sản phẩm/)).not.toBeRequired();
    expect(screen.getByLabelText(/Tên sản phẩm/)).toHaveAttribute("maxlength", "200");

    const viEditor = await screen.findByLabelText("Mô tả chi tiết");
    act(() =>
      (viEditor as HTMLElement & { editor: Editor }).editor.commands.setContent(
        "<p>Chi tiết tiếng Việt</p>",
        true,
      ),
    );
    fireEvent.click(screen.getByRole("tab", { name: /English/ }));
    const enEditor = await screen.findByLabelText("Mô tả chi tiết");
    expect(enEditor).toHaveTextContent("");
    act(() =>
      (enEditor as HTMLElement & { editor: Editor }).editor.commands.setContent(
        "<p>English details</p>",
        true,
      ),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Tiếng Việt/ }));

    expect(await screen.findByLabelText("Mô tả chi tiết")).toHaveTextContent("Chi tiết tiếng Việt");
    expect(screen.queryByRole("heading", { name: "Mô tả chi tiết" })).not.toBeInTheDocument();
  });

  it("preserves legacy descriptions byte-for-byte when only another field is changed", async () => {
    const legacy = "  <b>Rau tươi</b>\r\nDòng hai\n\n  ";
    mocks.product.mockResolvedValue({
      ...storedProduct,
      translations: [
        { ...storedProduct.translations[0], description: legacy },
        storedProduct.translations[1],
      ],
    });
    render(<StoreProductEditor productId="product-1" />);
    const editor = await screen.findByLabelText("Mô tả chi tiết");
    expect(editor).toHaveTextContent("<b>Rau tươi</b>");
    expect(editor.querySelector("b")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Giá mỗi đơn vị bán/), { target: { value: "95000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const viTranslation = mocks.save.mock.calls[0][0].translations[0];
    expect(viTranslation.description).toBe(legacy);
    expect(viTranslation).not.toHaveProperty("description_document");
  });

  it("keeps formatted content in both language payloads and preserves it after API rejection", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    mocks.save.mockRejectedValue(
      Object.assign(new Error("validation_error"), { status: 400, field: "unit_size" }),
    );
    render(<StoreProductEditor productId="product-1" />);
    const viEditor = await screen.findByLabelText("Mô tả chi tiết");
    act(() =>
      (viEditor as HTMLElement & { editor: Editor }).editor.commands.setContent(
        "<h2>Bảo quản</h2><ul><li><p><strong>Giữ mát</strong></p></li></ul>",
        true,
      ),
    );
    expect(
      screen.queryByRole("button", { name: adminDictionaries.vi.richText.image }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /English/ }));
    const enEditor = await screen.findByLabelText("Mô tả chi tiết");
    act(() =>
      (enEditor as HTMLElement & { editor: Editor }).editor.commands.setContent(
        "<p><em>Keep cool</em></p>",
        true,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const translations = mocks.save.mock.calls[0][0].translations;
    expect(translations[0]).toMatchObject({
      description: "Bảo quản\nGiữ mát",
      description_document: {
        type: "doc",
        content: [
          expect.objectContaining({ type: "heading" }),
          expect.objectContaining({ type: "bulletList" }),
        ],
      },
    });
    expect(translations[1].description_document.content[0].content[0].marks).toContainEqual({
      type: "italic",
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Mô tả chi tiết")).toHaveAttribute("contenteditable", "true"),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Tiếng Việt/ }));
    expect(await screen.findByRole("heading", { name: "Bảo quản" })).toBeInTheDocument();
    expect(screen.getByText("Giữ mát").closest("strong")).not.toBeNull();
  });

  it("renders saved rich descriptions in Admin detail without an editing toolbar", async () => {
    mocks.product.mockResolvedValue({
      ...storedProduct,
      translations: [
        {
          ...storedProduct.translations[0],
          description: "Legacy",
          description_document: {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 3 },
                content: [{ type: "text", text: "Đặc điểm" }],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: "Rau tươi", marks: [{ type: "bold" }] }],
              },
            ],
          },
        },
      ],
    });
    render(<StoreProductDetail productId="product-1" />);
    expect(await screen.findByRole("heading", { name: "Đặc điểm" })).toBeInTheDocument();
    expect(screen.getByText("Rau tươi").closest("strong")).not.toBeNull();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mô tả chi tiết")).toHaveAttribute("contenteditable", "false");
  });

  it("creates a retail-only draft and opens its detail", async () => {
    mocks.search = new URLSearchParams("status=draft&page=2");
    mocks.save.mockResolvedValueOnce({ ...storedProduct, id: "draft-created" });
    render(<StoreProductEditor />);
    await fillBase();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      sku: "RAU-01",
      retail_price_vnd: "90000",
      csa_quota_group_id: null,
      csa_quota_cost: 0,
    });
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("slug");
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("status");
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("is_active");
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("is_published");
    expect(mocks.save.mock.calls[0][1]).toBeUndefined();
    expect(mocks.replace).toHaveBeenCalledWith(
      "/store-catalog/products/draft-created?status=draft&page=2",
    );
    expect(screen.queryByLabelText(/Đường dẫn/)).not.toBeInTheDocument();
  });

  it("saves edits and opens the same record with its list context", async () => {
    mocks.search = new URLSearchParams("search=rau&status=active&csa_eligible=true&page=3");
    mocks.product.mockResolvedValue(storedProduct);
    mocks.save.mockResolvedValue(storedProduct);
    render(<StoreProductEditor productId="product-1" />);
    fireEvent.change(await screen.findByLabelText(/Giá mỗi đơn vị bán/), {
      target: { value: "95000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/store-catalog/products/product-1?search=rau&csa_eligible=true&page=3",
      ),
    );
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ retail_price_vnd: "95000", version: 1 }),
      "product-1",
      expect.any(Function),
    );
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it("saves a CSA-eligible draft with a fractional point cost", async () => {
    render(<StoreProductEditor />);
    await fillBase();
    selectOption(screen.getByRole("combobox", { name: "Hình thức bán" }), "yes");
    selectOption(await screen.findByRole("combobox", { name: /Nhóm quota CSA/ }), "quota");
    fireEvent.change(screen.getByLabelText(/Điểm CSA mỗi đơn vị bán/), {
      target: { value: ".25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      csa_quota_group_id: "quota",
      csa_quota_cost: 0.25,
    });
  });

  it.each(["0.1", "0.9", "1.25", "2.5", "0", "-0.25", "0.001", "Infinity", "NaN", "2147483647.01"])(
    "rejects invalid point cost %s without saving",
    async (cost) => {
      render(<StoreProductEditor />);
      await fillBase();
      selectOption(screen.getByRole("combobox", { name: "Hình thức bán" }), "yes");
      selectOption(await screen.findByRole("combobox", { name: /Nhóm quota CSA/ }), "quota");
      fireEvent.change(screen.getByLabelText(/Điểm CSA mỗi đơn vị bán/), {
        target: { value: cost },
      });
      fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );

  it("loads and retains a fractional cost when editing", async () => {
    mocks.product.mockResolvedValue({ ...storedProduct, csa_quota_cost: 0.25 });
    render(<StoreProductEditor productId={storedProduct.id} />);
    expect(await screen.findByLabelText(/Điểm CSA mỗi đơn vị bán/)).toHaveValue("0.25");
  });

  it("previews the selected primary image and releases its object URL when removed", async () => {
    const { container } = render(<StoreProductEditor />);
    await screen.findByText("Chưa chọn ảnh");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["image"], "rau-muong.jpg", { type: "image/jpeg" })] },
    });

    expect(
      await screen.findByRole("img", { name: "Ảnh đại diện sản phẩm đang chọn" }),
    ).toHaveAttribute("src", "blob:store-product-preview");
    expect(screen.getByText("rau-muong.jpg")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
    expect(await screen.findByText("Chưa chọn ảnh")).toBeVisible();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:store-product-preview");
  });

  it("keeps translation validation when editing a selling product", async () => {
    mocks.product.mockResolvedValue({ ...storedProduct, status: "active" });
    render(<StoreProductEditor productId="product-1" />);
    expect(await screen.findByLabelText("Tên sản phẩm *")).toBeRequired();
    expect(screen.getByText("Đang bán")).toBeInTheDocument();
    expect(screen.queryByLabelText("Xuất bản")).not.toBeInTheDocument();
  });

  it("shows definite product validation and reuses the upload on a deliberate retry", async () => {
    mocks.save
      .mockRejectedValueOnce(
        Object.assign(new Error("validation_error"), { status: 400, field: "sku" }),
      )
      .mockResolvedValueOnce({ id: "saved" });
    const { container } = render(<StoreProductEditor />);
    await fillBase();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Mã quản lý sản phẩm/);
    await waitFor(() => expect(screen.getByLabelText(/Mã quản lý sản phẩm/)).toHaveFocus());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0].primary_image_id).toBe("image-1");
    expect(mocks.product).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("warns about the attempted SKU after an uncertain draft creation", async () => {
    mocks.save.mockRejectedValueOnce(Object.assign(new Error("invalid_response"), { status: 201 }));
    const { container, unmount } = render(<StoreProductEditor />);
    await fillBase();
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent(/SKU RAU-01.*trước khi tạo lại/i);
    expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Mã quản lý sản phẩm/), {
      target: { value: "RAU-CHANGED" },
    });
    expect(warning).toHaveTextContent("RAU-01");
    expect(screen.getByAltText(adminDictionaries.vi.storeCatalog.imagePreviewAlt)).toBeVisible();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.product).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    const sent = mocks.save.mock.calls[0][0];
    mocks.creation.mockResolvedValueOnce({ id: "confirmed-product", removed: false });
    fireEvent.click(within(warning).getByRole("button", { name: "Kiểm tra kết quả tạo" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/store-catalog/products/confirmed-product"),
    );
    expect(mocks.creation).toHaveBeenCalledWith(sent.idempotency_key, expect.any(AbortSignal));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    unmount();
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  });

  it("does not request CSA groups for a retail-only product", async () => {
    mocks.product.mockResolvedValue({
      ...storedProduct,
      csa_quota_group_id: null,
      csa_quota_group: null,
      csa_quota_cost: 0,
    });
    render(<StoreProductEditor productId="product-1" />);
    await screen.findByLabelText(/Mã quản lý sản phẩm/);
    expect(mocks.groups).not.toHaveBeenCalled();
  });

  it("retains a product draft on CSRF rejection without a recovery read", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    mocks.save.mockRejectedValueOnce(Object.assign(new Error("csrf_rejected"), { status: 403 }));
    render(<StoreProductEditor productId="product-1" />);
    const sku = await screen.findByLabelText(/Mã quản lý sản phẩm/);
    fireEvent.change(sku, { target: { value: "MY-DRAFT" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await screen.findByRole("alert");
    expect(sku).toBeVisible();
    expect(sku).toHaveValue("MY-DRAFT");
    expect(mocks.product).toHaveBeenCalledTimes(1);
  });

  it("clears a transient load error after retrying", async () => {
    mocks.categories.mockRejectedValueOnce(new Error("network_error"));
    render(<StoreProductEditor />);
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByLabelText(/Mã quản lý sản phẩm/)).toBeVisible();
  });

  it("retries quota groups without reloading or overwriting the edited product", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    mocks.groups.mockRejectedValueOnce(new Error("network_error")).mockResolvedValueOnce({
      data: [{ id: "quota", name: "Rau", is_active: true, translations: [] }],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    render(<StoreProductEditor productId="product-1" />);

    const sku = await screen.findByLabelText(/Mã quản lý sản phẩm/);
    fireEvent.change(sku, { target: { value: "RAU-DA-SUA" } });
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(mocks.groups).toHaveBeenCalledTimes(2));
    expect(mocks.product).toHaveBeenCalledTimes(1);
    expect(sku).toHaveValue("RAU-DA-SUA");
  });

  it("cleans up an uploaded pending image when the editor is left after a save failure", async () => {
    mocks.save.mockRejectedValueOnce(
      Object.assign(new Error("validation_error"), { status: 400, field: "sku" }),
    );
    const { container, unmount } = render(<StoreProductEditor />);
    await fillBase();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));

    unmount();

    await waitFor(() =>
      expect(mocks.deleteImage).toHaveBeenCalledWith("image-1", { keepalive: true }),
    );
  });

  it("keeps Cancel locked during a save and discards a safe pending image before leaving", async () => {
    mocks.search = new URLSearchParams("status=draft&page=2");
    const write = deferred<typeof storedProduct>();
    const discard = deferred<void>();
    mocks.save.mockReturnValueOnce(write.promise);
    mocks.deleteImage.mockReturnValueOnce(discard.promise);
    const { container } = render(<StoreProductEditor />);
    await fillBase();
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    const cancel = screen.getByRole("button", { name: "Hủy" });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(cancel).toBeDisabled();
    fireEvent.click(cancel);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.deleteImage).not.toHaveBeenCalled();

    await act(async () =>
      write.reject(Object.assign(new Error("validation_error"), { status: 400, field: "sku" })),
    );
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    expect(mocks.deleteImage).toHaveBeenCalledExactlyOnceWith("image-1");
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => discard.resolve());
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      "/store-catalog/products?status=draft&page=2",
    );
  });

  it("deletes an upload that finishes after leaving and never saves the product", async () => {
    let resolveUpload!: (value: { id: string }) => void;
    mocks.upload.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const { container, unmount } = render(<StoreProductEditor />);
    await fillBase();
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    unmount();
    resolveUpload({ id: "late-image" });
    await waitFor(() =>
      expect(mocks.deleteImage).toHaveBeenCalledWith("late-image", { keepalive: true }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("waits for a pending save result before deciding whether to delete its image", async () => {
    let rejectSave!: (reason: Error) => void;
    mocks.save.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    const { container, unmount } = render(<StoreProductEditor />);
    await fillBase();
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    unmount();
    expect(mocks.deleteImage).not.toHaveBeenCalled();
    rejectSave(Object.assign(new Error("validation_error"), { status: 400, field: "sku" }));
    await waitFor(() =>
      expect(mocks.deleteImage).toHaveBeenCalledWith("image-1", { keepalive: true }),
    );
  });

  it("leaves the image intact if a pending PATCH times out after leaving", async () => {
    let rejectSave!: (reason: Error) => void;
    mocks.product.mockResolvedValueOnce(storedProduct);
    mocks.save.mockReturnValueOnce(new Promise((_resolve, reject) => (rejectSave = reject)));
    const { container, unmount } = render(<StoreProductEditor productId="product-1" />);
    await screen.findByDisplayValue("RAU-01");
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => rejectSave(new Error("request_timeout")));

    expect(mocks.deleteImage).not.toHaveBeenCalled();
    expect(mocks.product).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the image if a pending save succeeds after leaving", async () => {
    let resolveSave!: (value: typeof storedProduct) => void;
    mocks.save.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { container, unmount } = render(<StoreProductEditor />);
    await fillBase();
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    unmount();
    resolveSave(storedProduct);
    await waitFor(() => expect(mocks.deleteImage).not.toHaveBeenCalled());
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("Store description numbered-list contract", () => {
  it("keeps zero as the list start when typing the numbered-list input rule", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    render(<StoreProductEditor productId="product-1" />);
    const element = await screen.findByLabelText("Mô tả chi tiết");
    const editor = (element as HTMLElement & { editor: Editor }).editor;
    act(() => {
      editor.commands.setContent("<p></p>", true);
      editor.commands.insertContent("0.");
      const position = editor.state.selection.from;
      editor.view.someProp("handleTextInput", (handler) =>
        handler(editor.view, position, position, " ", () =>
          editor.state.tr.insertText(" ", position, position),
        ),
      );
      editor.commands.insertContent("Giữ mát");
    });
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "orderedList",
      attrs: { start: 0, type: null },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].translations[0]).toMatchObject({
      description: "Giữ mát",
      description_document: {
        type: "doc",
        content: [{ type: "orderedList", attrs: { start: 0, type: null } }],
      },
    });
  });

  it("sends the actual ordered-list attributes produced by the installed editor", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    render(<StoreProductEditor productId="product-1" />);
    const element = await screen.findByLabelText("Mô tả chi tiết");
    const editor = (element as HTMLElement & { editor: Editor }).editor;
    act(() => editor.commands.setContent("<p>Giữ mát</p>", true));
    fireEvent.click(
      screen.getByRole("button", { name: `1. ${adminDictionaries.vi.richText.orderedList}` }),
    );
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "orderedList",
      attrs: { start: 1, type: null },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].translations[0]).toMatchObject({
      description: "Giữ mát",
      description_document: {
        type: "doc",
        content: [
          {
            type: "orderedList",
            attrs: { start: 1, type: null },
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Giữ mát" }] }],
              },
            ],
          },
        ],
      },
    });
  });
});

describe("Store description link editing regression", () => {
  it("keeps the caret after a pasted link and only normalizes its URL in the save payload", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    render(<StoreProductEditor productId="product-1" />);
    const element = await screen.findByLabelText("Mô tả chi tiết");
    const editor = (element as HTMLElement & { editor: Editor }).editor;
    act(() => editor.commands.setContent("<p>First paragraph</p><p>Second paragraph</p>", true));
    act(() => {
      editor.commands.setTextSelection(6);
      editor.commands.insertContent('<a href="http://example.com">inserted</a>');
    });
    expect(editor.state.selection.from).toBe(14);
    expect(
      editor
        .getJSON()
        .content?.[0].content?.find((node) => node.marks?.some((mark) => mark.type === "link"))
        ?.marks?.find((mark) => mark.type === "link")?.attrs?.href,
    ).toBe("http://example.com");
    act(() => editor.commands.insertContent("NEXT"));
    expect(
      editor
        .getJSON()
        .content?.[0].content?.map((node) => node.text ?? "")
        .join(""),
    ).toBe("FirstinsertedNEXT paragraph");
    expect(editor.getJSON().content?.[1].content?.[0].text).toBe("Second paragraph");
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const document = mocks.save.mock.calls[0][0].translations[0].description_document;
    expect(
      document.content[0].content
        .find((node: { marks?: { type: string }[] }) =>
          node.marks?.some((mark) => mark.type === "link"),
        )
        .marks.find((mark: { type: string }) => mark.type === "link").attrs.href,
    ).toBe("https://example.com/");
  });

  it("does not rewrite saved link attributes when only another product field changes", async () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    mocks.product.mockResolvedValue({
      ...storedProduct,
      translations: [
        { ...storedProduct.translations[0], description: "Link", description_document: document },
        storedProduct.translations[1],
      ],
    });
    render(<StoreProductEditor productId="product-1" />);
    await screen.findByLabelText("Mô tả chi tiết");
    fireEvent.change(screen.getByLabelText(/Giá mỗi đơn vị bán/), { target: { value: "95000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].translations[0].description_document).toEqual(document);
  });
});

it("locks identity and CSA fields from server capabilities without submitting them", async () => {
  const reason = { code: "csa_hold", id: "round-1", label: "Đợt mùa thu" };
  mocks.product.mockResolvedValue({
    ...storedProduct,
    capabilities: {
      ...storedProduct.capabilities,
      edit_identity: { allowed: false, reasons: [reason] },
      edit_csa: { allowed: false, reasons: [reason] },
    },
  });
  render(<StoreProductEditor productId="product-1" />);
  expect(await screen.findByLabelText(/Mã quản lý sản phẩm/)).toHaveAttribute("readonly");
  expect(screen.getByLabelText(/Số lượng mỗi đơn vị bán/)).toHaveAttribute("readonly");
  expect(screen.getByLabelText(/Điểm CSA mỗi đơn vị bán/)).toHaveAttribute("readonly");
  const disclosures = screen.getAllByRole("button", { name: "Xem lý do" });
  expect(disclosures).toHaveLength(2);
  disclosures.forEach((disclosure) => fireEvent.click(disclosure));
  expect(screen.getAllByText(/Đợt mùa thu/)).toHaveLength(2);
  fireEvent.change(screen.getByLabelText(/Giá mỗi đơn vị bán/), { target: { value: "95000" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  const payload = mocks.save.mock.calls[0][0];
  expect(payload.retail_price_vnd).toBe("95000");
  for (const key of [
    "sku",
    "unit_size",
    "unit_label_vi",
    "unit_label_en",
    "csa_quota_group_id",
    "csa_quota_cost",
  ]) {
    expect(payload).not.toHaveProperty(key);
  }
});

describe("store product detail", () => {
  it("groups record labels and values semantically and keeps one lifecycle badge", async () => {
    mocks.product.mockResolvedValue({
      ...storedProduct,
      primary_image_id: "image-1",
      primary_image: {
        id: "image-1",
        url: "/product.jpg",
        width: 1280,
        height: 880,
        variants: [{ url: "/product-640.jpg", width: 640, height: 440 }],
      },
    });
    render(<StoreProductDetail productId="product-1" />);

    const copy = adminDictionaries.vi.storeCatalog;
    const category = await screen.findByText(copy.category, { selector: "dt" });
    expect(category.parentElement?.parentElement?.tagName).toBe("DL");
    expect(category.nextElementSibling).toHaveProperty("tagName", "DD");
    expect(category.nextElementSibling).toHaveTextContent(storedProduct.category_slug);
    expect(screen.getAllByText(copy.productDraft)).toHaveLength(1);
    expect(screen.queryByText(copy.status, { selector: "dt" })).not.toBeInTheDocument();
    const image = screen.getByRole("img", { name: "Rau muống" });
    expect(image).toHaveAttribute("src", expect.stringMatching(/\/product-640\.jpg$/));
    expect(image).toHaveAttribute("width", "96");
    expect(image).toHaveAttribute("height", "96");
    expect(screen.getByRole("link", { name: copy.edit })).toHaveAttribute(
      "href",
      "/store-catalog/products/product-1/edit",
    );
  });

  it("discontinues through the transition action and displays the new status", async () => {
    mocks.product.mockResolvedValue({ ...storedProduct, status: "active" });
    mocks.transition.mockResolvedValue({ ...storedProduct, status: "discontinued" });
    render(<StoreProductDetail productId="product-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ngừng bán" }));
    expect(screen.getByText(/lượt giữ hợp lệ/)).toBeVisible();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ngừng bán" }));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith(
        "product-1",
        "active",
        "discontinued",
        1,
        expect.any(Function),
      ),
    );
    expect(await screen.findByRole("button", { name: "Bán lại" })).toBeVisible();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("moves actions above the description and guards against duplicate confirmation", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    let finish!: (value: unknown) => void;
    mocks.transition.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<StoreProductDetail productId="product-1" />);
    const action = await screen.findByRole("button", { name: "Đưa lên bán" });
    const description = screen.getByRole("heading", { name: "Nội dung sản phẩm" });
    expect(
      action.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(action);
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Đưa lên bán" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ...storedProduct, status: "active" }));
    expect(await screen.findByRole("button", { name: "Ngừng bán" })).toBeVisible();
  });

  it("invalidates cached Farm capability when a Product changes status", async () => {
    const client = new QueryClient();
    const farmKey = farmDetailKey("farm-1");
    client.setQueryData(farmKey, { capabilities: { can_add_supply: false } });
    client.setQueryData(farmListKey, []);
    mocks.product.mockResolvedValue(storedProduct);
    mocks.transition.mockResolvedValue({ ...storedProduct, status: "active" });
    renderView(
      <QueryClientProvider client={client}>
        <StoreProductDetail productId="product-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Đưa lên bán" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Đưa lên bán" }),
    );
    expect(await screen.findByRole("button", { name: "Ngừng bán" })).toBeVisible();
    expect(client.getQueryState(farmKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(farmListKey)?.isInvalidated).toBe(false);
  });

  it("returns a discontinued product to active through its own transition", async () => {
    mocks.product.mockResolvedValue({ ...storedProduct, status: "discontinued" });
    mocks.transition.mockResolvedValue({ ...storedProduct, status: "active" });
    render(<StoreProductDetail productId="product-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Bán lại" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Bán lại" }));
    expect(await screen.findByRole("button", { name: "Ngừng bán" })).toBeVisible();
    expect(mocks.transition).toHaveBeenCalledExactlyOnceWith(
      "product-1",
      "discontinued",
      "active",
      1,
      expect.any(Function),
    );
  });

  it.each([
    ["product_status_changed", "statusConflict"],
    ["product_transition_invalid", "productTransitionInvalid"],
  ] as const)("refreshes capabilities before showing %s", async (code, message) => {
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockResolvedValueOnce({ ...storedProduct, status: "discontinued" });
    mocks.transition.mockRejectedValue(Object.assign(new Error(code), { status: 409 }));
    render(<StoreProductDetail productId="product-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Đưa lên bán" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Đưa lên bán" }),
    );
    expect(await screen.findByText(adminDictionaries.vi.storeCatalog[message])).toBeVisible();
    expect(screen.getByRole("button", { name: "Bán lại" })).toBeVisible();
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("reloads after an uncertain transition and blocks all actions if recovery fails", async () => {
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({ ...storedProduct, status: "active" });
    mocks.transition.mockRejectedValue(new Error("invalid_response"));
    render(<StoreProductDetail productId="product-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Đưa lên bán" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Đưa lên bán" }),
    );
    const retry = await screen.findByRole("button", { name: "Thử lại" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Chỉnh sửa" })).not.toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalled();
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "Ngừng bán" })).toBeVisible();
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("refreshes capabilities and shows fresh delete protection", async () => {
    const locked = {
      ...storedProduct,
      status: "active",
      capabilities: {
        ...storedProduct.capabilities,
        delete: { allowed: false, reasons: [{ code: "store_order", label: "DH-101" }] },
      },
    };
    mocks.product.mockResolvedValueOnce(storedProduct).mockResolvedValueOnce(locked);
    mocks.remove.mockRejectedValue(Object.assign(new Error("product_in_use"), { status: 409 }));
    render(<StoreProductDetail productId="product-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Thao tác khác" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Xóa" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xem lý do" }));
    expect(await screen.findByText(/DH-101/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it("hides delete and edit after a delete conflict whose recovery loses access", async () => {
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
    mocks.remove.mockRejectedValue(Object.assign(new Error("product_in_use"), { status: 409 }));
    render(<StoreProductDetail productId="product-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Thao tác khác" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Xóa" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
    expect(await screen.findByRole("button", { name: "Thử lại" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Chỉnh sửa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("does not keep old product actions or route away after a late delete result", async () => {
    let finish!: () => void;
    mocks.remove.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    mocks.product
      .mockResolvedValueOnce(storedProduct)
      .mockImplementationOnce(() => new Promise(() => {}));
    const view = render(<StoreProductDetail productId="product-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Thao tác khác" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Xóa" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
    view.rerender(<StoreProductDetail productId="product-2" />);
    expect(screen.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => finish());
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("localizes the CSA quota group on the detail page", async () => {
    mocks.locale = "en";
    mocks.product.mockResolvedValue({
      ...storedProduct,
      csa_quota_group: {
        id: "quota",
        name: "Rau",
        translations: [
          { locale: "vi", name: "Rau", short_description: "" },
          { locale: "en", name: "Vegetables", short_description: "" },
        ],
      },
    });
    render(<StoreProductDetail productId="product-1" />);
    const group = await screen.findByText("CSA quota group", { selector: "dt" });
    expect(group.nextElementSibling).toHaveTextContent("Vegetables");
  });
  it("recovers from a transient detail error when retrying", async () => {
    mocks.product
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(storedProduct);
    render(<StoreProductDetail productId="product-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    expect(await screen.findByRole("heading", { name: "Rau muống" })).toBeVisible();
  });
});

it("focuses the visible category select when its required selection is missing", async () => {
  render(<StoreProductEditor />);
  await fillBase();
  const category = screen.getByRole("combobox", { name: /Danh mục sản phẩm/ });
  expect(category).toBeRequired();
  expect(new FormData(category.closest("form")!).get("category_id")).toBe("leaf");
  selectOption(category, "");
  expect(new FormData(category.closest("form")!).get("category_id")).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  await waitFor(() => expect(category).toHaveFocus());
  expect(mocks.save).not.toHaveBeenCalled();
});
