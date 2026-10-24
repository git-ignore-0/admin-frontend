import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoreProductDetail } from "@/components/store-product-detail";
import { StoreProductEditor } from "@/components/store-product-editor";
import { adminDictionaries } from "@/lib/admin-i18n";

const mocks = vi.hoisted(() => ({
  locale: "vi" as "vi" | "en",
  categories: vi.fn(),
  groups: vi.fn(),
  product: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  deleteImage: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
}));
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const createObjectUrl = vi.fn(() => "blob:store-product-preview");
const revokeObjectUrl = vi.fn();
vi.mock("@/lib/commerce-api", () => ({
  listStoreCategories: mocks.categories,
  saveStoreProduct: mocks.save,
  getStoreProduct: mocks.product,
  deleteStoreProduct: mocks.remove,
  uploadStoreProductImage: mocks.upload,
  deleteStoreProductImage: mocks.deleteImage,
}));
vi.mock("@/lib/membership-catalog-adapter", () => ({ listActiveQuotaGroups: mocks.groups }));
vi.mock("@/components/admin-i18n-provider", () => ({
  useAdminI18n: () => ({ locale: mocks.locale, t: adminDictionaries[mocks.locale] }),
}));
vi.mock("@/components/toast-provider", () => ({ useToast: () => mocks.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, back: vi.fn() }),
}));

beforeEach(() => {
  mocks.locale = "vi";
  Object.values(mocks).forEach((mock) => {
    if (typeof mock === "function") mock.mockReset();
  });
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
  is_active: true,
  is_published: false,
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
  fireEvent.change(screen.getByLabelText(/Danh mục sản phẩm/), { target: { value: "leaf" } });
  fireEvent.change(screen.getByLabelText(/Khối lượng \/ số lượng/), {
    target: { value: "0.500" },
  });
  fireEvent.change(screen.getByLabelText(/Đơn vị bán \(tiếng Việt\)/), {
    target: { value: "kg" },
  });
  fireEvent.change(screen.getByLabelText(/Đơn vị bán \(tiếng Anh\)/), {
    target: { value: "kg" },
  });
  fireEvent.change(screen.getByLabelText(/Giá bán lẻ/), { target: { value: "90000" } });
}

describe("store product editor", () => {
  it("explains why a selling unit cannot change after weekly supply exists", async () => {
    mocks.product.mockResolvedValue(storedProduct);
    mocks.save.mockRejectedValue(Object.assign(new Error("product_unit_in_use"), { status: 409 }));
    render(<StoreProductEditor productId="product-1" />);
    fireEvent.change(await screen.findByLabelText(/Khối lượng \/ số lượng/), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(
      await screen.findByText(/Không thể đổi quy cách hoặc đơn vị bán vì sản phẩm đã có số lượng/),
    ).toBeVisible();
    expect(mocks.save).toHaveBeenCalled();
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
    expect(await screen.findByRole("option", { name: "Rau lá" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  });

  it("shows names as optional for drafts and required for published products", async () => {
    render(<StoreProductEditor />);
    expect(await screen.findByLabelText("Tên sản phẩm")).not.toBeRequired();
    fireEvent.change(screen.getByLabelText("Xuất bản"), { target: { value: "true" } });
    expect(screen.getByLabelText("Tên sản phẩm *")).toBeRequired();
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
    fireEvent.change(await screen.findByLabelText("Sale type"), { target: { value: "yes" } });
    expect(await screen.findByRole("option", { name: "Vegetables" })).toBeInTheDocument();
  });
  it("explains SKU and selling-unit fields with examples", async () => {
    render(<StoreProductEditor />);
    expect(await screen.findByPlaceholderText("VD: RAU-MUONG-500G")).toHaveAccessibleDescription(
      /Mã duy nhất để quản lý sản phẩm/,
    );
    expect(screen.getByPlaceholderText("VD: 500 hoặc 1")).toHaveAccessibleDescription(
      /Chỉ nhập phần số/,
    );
    expect(screen.getByPlaceholderText("VD: g, kg, mớ, bó, quả")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("VD: g, kg, bunch, piece")).toBeInTheDocument();
    const unitVi = screen.getByLabelText(/Đơn vị bán \(tiếng Việt\)/);
    const unitEn = screen.getByLabelText(/Đơn vị bán \(tiếng Anh\)/);
    const unitSize = screen.getByLabelText(/Khối lượng \/ số lượng/);
    expect(unitVi.compareDocumentPosition(unitEn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      unitEn.compareDocumentPosition(unitSize) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows only selectable categories with their full hierarchy", async () => {
    render(<StoreProductEditor />);
    expect(
      await screen.findByRole("option", { name: "Thực phẩm → Rau → Rau lá" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Thực phẩm" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Danh mục sản phẩm/)).toHaveAccessibleDescription(
      /Chọn cấp cụ thể nhất/,
    );
  });

  it("keeps the full description inside the matching language tab", async () => {
    render(<StoreProductEditor />);
    await screen.findByRole("heading", { name: "Nội dung song ngữ" });
    expect(screen.getByLabelText(/Tên sản phẩm/).closest("label")).toHaveClass("full");

    fireEvent.change(screen.getByLabelText("Mô tả chi tiết"), {
      target: { value: "Chi tiết tiếng Việt" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /English/ }));
    expect(screen.getByLabelText("Mô tả chi tiết")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Mô tả chi tiết"), {
      target: { value: "English details" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /Tiếng Việt/ }));

    expect(screen.getByLabelText("Mô tả chi tiết")).toHaveValue("Chi tiết tiếng Việt");
    expect(screen.queryByRole("heading", { name: "Mô tả chi tiết" })).not.toBeInTheDocument();
  });

  it("saves a retail-only draft without a quota group", async () => {
    render(<StoreProductEditor />);
    await fillBase();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      sku: "RAU-01",
      retail_price_vnd: "90000",
      csa_quota_group_id: null,
      csa_quota_cost: 0,
      is_published: false,
    });
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("slug");
    expect(screen.queryByLabelText(/Đường dẫn/)).not.toBeInTheDocument();
  });

  it("saves a CSA-eligible draft with a positive quota cost", async () => {
    render(<StoreProductEditor />);
    await fillBase();
    fireEvent.change(screen.getByLabelText("Hình thức bán"), { target: { value: "yes" } });
    fireEvent.change(await screen.findByLabelText(/Nhóm quyền lợi CSA/), {
      target: { value: "quota" },
    });
    fireEvent.change(screen.getByLabelText(/Số lượt cần trừ/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      csa_quota_group_id: "quota",
      csa_quota_cost: 2,
    });
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

  it("does not publish without translations and an image", async () => {
    render(<StoreProductEditor />);
    await fillBase();
    fireEvent.change(screen.getByLabelText("Xuất bản"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/tiếng Việt và tiếng Anh/);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("retains a successful upload when product save fails and retries without another upload", async () => {
    mocks.save
      .mockRejectedValueOnce(new Error("request_failed"))
      .mockResolvedValueOnce({ id: "saved" });
    const { container } = render(<StoreProductEditor />);
    await fillBase();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["image"], "rau.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].primary_image_id).toBe("image-1");
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
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
    mocks.save.mockRejectedValueOnce(new Error("request_failed"));
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
    rejectSave(new Error("request_failed"));
    await waitFor(() =>
      expect(mocks.deleteImage).toHaveBeenCalledWith("image-1", { keepalive: true }),
    );
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

describe("store product detail", () => {
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
    expect(await screen.findByText(/CSA benefit group: Vegetables/)).toBeInTheDocument();
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
