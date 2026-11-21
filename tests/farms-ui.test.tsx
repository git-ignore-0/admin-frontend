import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { FarmList } from "@/components/farm-list";
import { FarmEditor } from "@/components/farm-editor";
import { FarmProducts } from "@/components/farm-products";
import { FarmDetail } from "@/components/farm-detail";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ToastProvider } from "@/components/toast-provider";
import type {
  AvailableFarmProduct,
  Farm,
  FarmProduct,
  FarmStockBatch,
  MediaAsset,
} from "@/lib/types";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  deleteImage: vi.fn(),
  linked: vi.fn(),
  add: vi.fn(),
  active: vi.fn(),
  removeLink: vi.fn(),
  batches: vi.fn(),
  createBatch: vi.fn(),
  updateBatch: vi.fn(),
  cancelBatch: vi.fn(),
  productDetail: vi.fn(),
  available: vi.fn(),
  removeFarm: vi.fn(),
  tracker: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/commerce-api", () => ({ getStoreProduct: mocks.productDetail }));
vi.mock("@/lib/farms-api", () => ({
  listFarms: mocks.list,
  getFarm: mocks.get,
  getFarmTracker: mocks.tracker,
  saveFarm: mocks.save,
  deleteFarm: mocks.removeFarm,
  uploadFarmImage: mocks.upload,
  deleteFarmImage: mocks.deleteImage,
  listFarmProducts: mocks.linked,
  listAvailableFarmProducts: mocks.available,
  addFarmProduct: mocks.add,
  setFarmProductActive: mocks.active,
  removeFarmProduct: mocks.removeLink,
  listFarmStockBatches: mocks.batches,
  createFarmStockBatch: mocks.createBatch,
  updateFarmStockBatch: mocks.updateBatch,
  cancelFarmStockBatch: mocks.cancelBatch,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const farm = {
  id: "farm-1",
  name_vi: "Nông trại Xanh",
  name_en: "Green Farm",
  location_vi: "Đà Lạt",
  location_en: "Da Lat",
  description_vi: "Rau sạch",
  description_en: "Organic greens",
  image: null,
  photos: [],
  is_active: true,
  in_stock_product_count: 8,
  out_of_stock_product_count: 4,
  version: 2,
  created_at: "2026-01-01",
  updated_at: "2026-10-15",
} as Farm;
const product: AvailableFarmProduct = {
  id: "product-1",
  sku: "RAU-01",
  name_vi: "Rau muống",
  name_en: "Water spinach",
};
const linkedProduct: FarmProduct = {
  id: "link-1",
  farm_id: "farm-1",
  product_id: "product-1",
  sku: "RAU-01",
  name_vi: "Rau muống",
  name_en: "Water spinach",
  unit_size: "500.000",
  unit_label_vi: "gói",
  unit_label_en: "pack",
  is_active: true,
  initial_quantity: 10,
  net_sold_quantity: 0,
  available_quantity: 10,
  batch_count: 1,
  active_batch_count: 1,
  has_supply_history: true,
  next_expiry_date: "2026-11-01",
};
function linkedResult(data: FarmProduct[], page = 1, total = data.length) {
  return { data, meta: { page, page_size: 20, total } };
}
function farmPhoto(id: string): MediaAsset {
  return { id, url: `/${id}.webp`, width: 120, height: 100, variants: [] };
}
function chooseFarmPhotos(...files: File[]) {
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), { target: { files } });
}
function photoFile(name: string) {
  return new File(["image"], `${name}.webp`, { type: "image/webp" });
}
function view(node: React.ReactNode) {
  return render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>{node}</ToastProvider>
    </AdminI18nProvider>,
  );
}
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.list.mockResolvedValue({ data: [farm], meta: { page: 1, page_size: 20, total: 1 } });
  mocks.get.mockResolvedValue(farm);
  mocks.linked.mockResolvedValue(linkedResult([]));
  mocks.available.mockResolvedValue({
    data: [product],
    meta: { page: 1, page_size: 30, total: 1 },
  });
  mocks.batches.mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } });
  mocks.productDetail.mockResolvedValue({
    id: "product-1",
    unit_size: "0.500",
    unit_label_vi: "kg",
    unit_label_en: "kg",
  });
  mocks.tracker.mockResolvedValue({ signup_count: 24 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("lists canonical Farms with search and status without fetching tracker data", async () => {
  view(<FarmList />);
  expect(await screen.findByText("Nông trại Xanh")).toBeVisible();
  expect(screen.getByText("8 sản phẩm còn hàng")).toBeVisible();
  expect(screen.getByText("4 sản phẩm hết hàng")).toBeVisible();
  expect(screen.getByRole("link", { name: "Quản lý hàng" })).toHaveAttribute(
    "href",
    "/farms/farm-1",
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Đà Lạt" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  await waitFor(() =>
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ search: "Đà Lạt" })),
  );
});

it("keeps Farm shared fields and version in its own editor", async () => {
  mocks.save.mockResolvedValue({ ...farm, version: 3 });
  view(<FarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Tên nông trại *"), {
    target: { value: "Nông trại Mới" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      "farm-1",
      expect.objectContaining({
        name_vi: "Nông trại Mới",
        version: 2,
        photo_ids: [],
      }),
    ),
  );
  expect(mocks.replace).toHaveBeenCalledWith("/farms/farm-1");
});

it("keeps Farm edits and temporary photos when the Admin language changes", async () => {
  const temp = { id: "temp-locale", url: "/temp.webp", width: 100, height: 100, variants: [] };
  mocks.upload.mockResolvedValue(temp);
  mocks.deleteImage.mockResolvedValue(undefined);
  view(
    <>
      <LanguageSwitcher />
      <FarmEditor farmId="farm-1" />
    </>,
  );
  fireEvent.change(await screen.findByDisplayValue("Nông trại Xanh"), {
    target: { value: "Nông trại đang sửa" },
  });
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
    target: { files: [new File(["image"], "farm.webp", { type: "image/webp" })] },
  });
  expect(await screen.findByRole("button", { name: "Chọn ảnh số 1" })).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "EN" }));
  expect(screen.getByDisplayValue("Nông trại đang sửa")).toBeVisible();
  expect(screen.getByRole("button", { name: "Select image 1" })).toBeVisible();
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("groups name, location, and description by locale in the Farm editor", async () => {
  mocks.save.mockResolvedValue({ ...farm, version: 3 });
  view(<FarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  expect(screen.getByLabelText("Địa điểm *")).toHaveValue("Đà Lạt");
  expect(screen.getByLabelText("Mô tả")).toHaveValue("Rau sạch");
  expect(screen.queryByDisplayValue("Da Lat")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: /English/ }));
  expect(screen.getByLabelText("Tên nông trại *")).toHaveValue("Green Farm");
  expect(screen.getByLabelText("Địa điểm *")).toHaveValue("Da Lat");
  expect(screen.getByLabelText("Mô tả")).toHaveValue("Organic greens");
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: "Da Lat City" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      "farm-1",
      expect.objectContaining({ location_vi: "Đà Lạt", location_en: "Da Lat City" }),
    ),
  );
});

it("opens and focuses the missing language field before saving a Farm", async () => {
  mocks.get.mockResolvedValue({ ...farm, location_en: "" });
  view(<FarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Nhập tên và địa điểm ở cả hai ngôn ngữ.");
  expect(screen.getByRole("tab", { name: /English/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Địa điểm *")).toHaveFocus();
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each(["vi", "en"] as const)(
  "focuses the missing %s Farm name through the shared Mantine fields",
  async (language) => {
    mocks.get.mockResolvedValue({ ...farm, [`name_${language}`]: "" });
    view(<FarmEditor farmId="farm-1" />);
    await screen.findByRole("button", { name: "Lưu thay đổi" });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập tên và địa điểm ở cả hai ngôn ngữ.");
    expect(screen.getByLabelText("Tên nông trại *")).toHaveFocus();
    expect(mocks.save).not.toHaveBeenCalled();
  },
);

it("preserves an existing cover image when the older Farm has no gallery rows", async () => {
  const cover = { id: "cover-1", url: "/cover.webp", width: 100, height: 100, variants: [] };
  mocks.get.mockResolvedValue({ ...farm, image: cover, photos: [] });
  mocks.save.mockResolvedValue({ ...farm, image: cover, photos: [cover], version: 3 });
  view(<FarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      "farm-1",
      expect.objectContaining({ photo_ids: ["cover-1"] }),
    ),
  );
});

it("reorders Farm photos and sets the cover using the compact image picker", async () => {
  const photos = ["photo-1", "photo-2", "photo-3"].map((id) => ({
    id,
    url: `/${id}.webp`,
    width: 100,
    height: 100,
    variants: [],
  }));
  mocks.get.mockResolvedValue({ ...farm, image: photos[0], photos });
  mocks.save.mockResolvedValue({ ...farm, image: photos[2], photos, version: 3 });
  view(<FarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Chọn ảnh số 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Đưa ảnh lên trước 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Đặt làm đại diện" }));
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      "farm-1",
      expect.objectContaining({ photo_ids: ["photo-3", "photo-1", "photo-2"] }),
    ),
  );
});

it("promotes the next Farm photo to cover when the existing cover is removed", async () => {
  const photos = [farmPhoto("cover"), farmPhoto("next")];
  mocks.get.mockResolvedValue({ ...farm, image: photos[0], photos });
  mocks.save.mockResolvedValue({ ...farm, image: photos[1], photos: [photos[1]], version: 3 });
  view(<FarmEditor farmId="farm-1" />);

  fireEvent.click(await screen.findByRole("button", { name: "Chọn ảnh số 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
  const next = screen.getByRole("button", { name: "Chọn ảnh số 1" });
  expect(within(next).getByRole("img", { name: "Ảnh trang trại 1" })).toHaveAttribute(
    "src",
    "/next.webp",
  );
  expect(next).toHaveAccessibleDescription("Ảnh đại diện");
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      "farm-1",
      expect.objectContaining({ photo_ids: ["next"], version: 2 }),
    ),
  );
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("clears a legacy Farm cover through the photo order payload", async () => {
  mocks.get.mockResolvedValue({ ...farm, image: farmPhoto("legacy"), photos: [] });
  mocks.save.mockResolvedValue({ ...farm, version: 3 });
  view(<FarmEditor farmId="farm-1" />);

  fireEvent.click(await screen.findByRole("button", { name: "Chọn ảnh số 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
  expect(screen.getByText("0/12")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      "farm-1",
      expect.objectContaining({ photo_ids: [], version: 2 }),
    ),
  );
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("rejects a batch beyond the remaining Farm photo capacity and disables choosing when full", async () => {
  const photos = Array.from({ length: 11 }, (_, index) => farmPhoto(`photo-${index}`));
  mocks.get.mockResolvedValue({ ...farm, photos });
  mocks.upload.mockResolvedValue(farmPhoto("last"));
  mocks.deleteImage.mockResolvedValue(undefined);
  view(<FarmEditor farmId="farm-1" />);
  await screen.findByText("11/12");

  const file = photoFile("last");
  chooseFarmPhotos(file, photoFile("extra"));
  expect(screen.getByRole("alert")).toHaveTextContent("12");
  expect(screen.getByText("11/12")).toBeVisible();
  expect(mocks.upload).not.toHaveBeenCalled();

  chooseFarmPhotos(file);
  expect(await screen.findByText("12/12")).toBeVisible();
  expect(screen.getByLabelText("Chọn ảnh")).toBeDisabled();
});

it("uploads Farm photos one at a time and keeps the successful files after another file fails", async () => {
  let rejectFirst!: (cause: Error) => void;
  const first = photoFile("broken");
  const second = photoFile("working");
  mocks.upload
    .mockReturnValueOnce(
      new Promise<MediaAsset>((_, reject) => {
        rejectFirst = reject;
      }),
    )
    .mockResolvedValueOnce(farmPhoto("working"));
  mocks.save.mockResolvedValue({ ...farm, version: 3 });
  mocks.deleteImage.mockResolvedValue(undefined);
  const rendered = view(<FarmEditor farmId="farm-1" />);
  await screen.findByDisplayValue("Nông trại Xanh");
  chooseFarmPhotos(first, second);
  expect(mocks.upload.mock.calls).toEqual([[first]]);
  expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();

  await act(async () => rejectFirst(new Error("network_error")));
  expect(mocks.upload.mock.calls).toEqual([[first], [second]]);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "Chọn ảnh số 1" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      "farm-1",
      expect.objectContaining({ photo_ids: ["working"], version: 2 }),
    ),
  );
  expect(mocks.replace).toHaveBeenCalledWith("/farms/farm-1");
  rendered.unmount();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("cleans a temporary Farm upload when removed from the draft", async () => {
  mocks.upload.mockResolvedValue(farmPhoto("temporary"));
  mocks.deleteImage.mockResolvedValue(undefined);
  const rendered = view(<FarmEditor />);
  chooseFarmPhotos(photoFile("temporary"));
  fireEvent.click(await screen.findByRole("button", { name: "Chọn ảnh số 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
  expect(screen.getByText("0/12")).toBeVisible();
  await act(async () => undefined);
  rendered.unmount();
  expect(mocks.deleteImage.mock.calls).toEqual([["temporary"]]);
});

it("cleans all temporary uploads when leaving the Farm editor and preserves removed persisted images", async () => {
  const saved = farmPhoto("persisted");
  mocks.get.mockResolvedValue({ ...farm, image: saved, photos: [saved] });
  mocks.upload
    .mockResolvedValueOnce(farmPhoto("temporary-one"))
    .mockResolvedValueOnce(farmPhoto("temporary-two"));
  mocks.deleteImage.mockResolvedValue(undefined);
  const rendered = view(<FarmEditor farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Chọn ảnh số 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
  chooseFarmPhotos(photoFile("temporary-one"), photoFile("temporary-two"));
  await screen.findByText("2/12");
  expect(screen.getByRole("link", { name: "Hủy" })).toHaveAttribute("href", "/farms/farm-1");
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  rendered.unmount();
  expect(mocks.deleteImage.mock.calls).toEqual([
    ["temporary-one", { keepalive: true }],
    ["temporary-two", { keepalive: true }],
  ]);
});

it("keeps a submitted Farm photo when the editor unmounts after a successful save", async () => {
  const uploaded = farmPhoto("accepted");
  mocks.upload.mockResolvedValue(uploaded);
  mocks.save.mockResolvedValue({ ...farm, image: uploaded, photos: [uploaded], version: 3 });
  const rendered = view(<FarmEditor farmId="farm-1" />);
  await screen.findByDisplayValue("Nông trại Xanh");
  chooseFarmPhotos(photoFile("accepted"));
  await screen.findByText("1/12");
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/farms/farm-1"));
  expect(mocks.save).toHaveBeenCalledWith(
    "farm-1",
    expect.objectContaining({ photo_ids: ["accepted"] }),
  );
  rendered.unmount();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("keeps a failed cleanup out of the Farm draft and retries it on unmount", async () => {
  const conflict = Object.assign(new Error("media_asset_referenced"), { status: 409 });
  mocks.upload.mockResolvedValue(farmPhoto("temporary"));
  mocks.deleteImage.mockRejectedValue(conflict);
  const rendered = view(<FarmEditor />);
  chooseFarmPhotos(photoFile("temporary"));
  fireEvent.click(await screen.findByRole("button", { name: "Chọn ảnh số 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByText("0/12")).toBeVisible();
  expect(screen.getByRole("link", { name: "Hủy" })).toHaveAttribute("href", "/farms");
  rendered.unmount();
  expect(mocks.deleteImage.mock.calls).toEqual([["temporary"], ["temporary", { keepalive: true }]]);
});

it("closes Farm photo actions after clicking outside, pressing Escape, or clicking the selected photo", async () => {
  const photos = ["photo-1", "photo-2"].map((id) => ({
    id,
    url: `/${id}.webp`,
    width: 100,
    height: 100,
    variants: [],
  }));
  mocks.get.mockResolvedValue({ ...farm, image: photos[0], photos });
  view(<FarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();

  const secondPhoto = screen.getByRole("button", { name: "Chọn ảnh số 2" });
  fireEvent.click(secondPhoto);
  expect(screen.getByRole("button", { name: "Đưa ảnh lên trước 2" })).toBeVisible();
  fireEvent.pointerDown(screen.getByRole("heading", { name: /Ảnh trang trại/ }));
  expect(screen.queryByRole("button", { name: "Đưa ảnh lên trước 2" })).not.toBeInTheDocument();

  fireEvent.click(secondPhoto);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("button", { name: "Đưa ảnh lên trước 2" })).not.toBeInTheDocument();

  fireEvent.click(secondPhoto);
  fireEvent.click(secondPhoto);
  expect(screen.queryByRole("button", { name: "Đưa ảnh lên trước 2" })).not.toBeInTheDocument();
});

it("opens Farm inventory by default with its stock summary and supporting tabs", async () => {
  view(<FarmDetail farmId="farm-1" />);
  expect(await screen.findByRole("heading", { name: "Nông trại Xanh" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sửa thông tin" })).toHaveAttribute(
    "href",
    "/farms/farm-1/edit",
  );
  fireEvent.click(screen.getByRole("button", { name: "Xóa trang trại" }));
  expect(screen.getByRole("dialog", { name: "Xóa trang trại" })).toBeVisible();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  expect(await screen.findByRole("heading", { name: "Sản phẩm của Farm" })).toBeVisible();
  expect(screen.getByText("8 sản phẩm còn hàng")).toBeVisible();
  expect(screen.getByText("4 sản phẩm hết hàng")).toBeVisible();
  await waitFor(() => expect(mocks.linked).toHaveBeenCalledWith("farm-1", { page: 1, search: "" }));
  expect(screen.getByRole("tab", { name: "Sản phẩm & tồn kho" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.click(screen.getByRole("tab", { name: "Growth Tracker" }));
  expect(screen.getByRole("link", { name: "Quản lý Growth Tracker" })).toHaveAttribute(
    "href",
    "/tracker-farms/farm-1",
  );
});

it("moves Farm detail tabs with arrow, Home and End keys", async () => {
  view(<FarmDetail farmId="farm-1" />);
  const products = await screen.findByRole("tab", { name: "Sản phẩm & tồn kho" });
  const information = screen.getByRole("tab", { name: "Thông tin Farm" });
  const tracker = screen.getByRole("tab", { name: "Growth Tracker" });
  expect(products).toHaveAttribute("tabindex", "0");
  fireEvent.keyDown(products, { key: "ArrowRight" });
  expect(information).toHaveFocus();
  expect(information).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(information, { key: "End" });
  expect(tracker).toHaveFocus();
  fireEvent.keyDown(tracker, { key: "Home" });
  expect(products).toHaveFocus();
});

it("selects the first Farm product and keeps stopped supply distinct from stock", async () => {
  const stopped = {
    ...linkedProduct,
    id: "link-2",
    product_id: "product-2",
    sku: "RAU-02",
    name_vi: "Cải ngọt",
    is_active: false,
    available_quantity: 50,
  };
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct, stopped]));
  view(<FarmProducts farmId="farm-1" inStockCount={1} outOfStockCount={0} />);

  expect(await screen.findByRole("button", { name: "Rau muống, Còn 10" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Cải ngọt, Ngừng cung cấp" })).toBeVisible();
  await waitFor(() =>
    expect(mocks.batches).toHaveBeenCalledWith("farm-1", "product-1", {
      page: 1,
      status: undefined,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cải ngọt, Ngừng cung cấp" }));
  await waitFor(() =>
    expect(mocks.batches).toHaveBeenCalledWith("farm-1", "product-2", {
      page: 1,
      status: undefined,
    }),
  );
});

it("resets batch pagination when selecting another Farm product", async () => {
  const second = {
    ...linkedProduct,
    id: "link-2",
    product_id: "product-2",
    sku: "RAU-02",
    name_vi: "Cải ngọt",
  };
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct, second]));
  mocks.batches.mockImplementation((_farmId, productId, query: { page: number }) =>
    Promise.resolve({
      data: [],
      meta: { page: query.page, page_size: 20, total: productId === "product-1" ? 21 : 0 },
    }),
  );
  view(<FarmProducts farmId="farm-1" />);

  fireEvent.click(await screen.findByRole("button", { name: "Sau" }));
  await waitFor(() =>
    expect(mocks.batches).toHaveBeenCalledWith("farm-1", "product-1", {
      page: 2,
      status: undefined,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cải ngọt, Còn 10" }));
  await waitFor(() =>
    expect(mocks.batches).toHaveBeenCalledWith("farm-1", "product-2", {
      page: 1,
      status: undefined,
    }),
  );
});

it("keeps product action failures visible in the detail pane", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.active.mockRejectedValue(new Error("network_error"));
  view(<FarmProducts farmId="farm-1" />);

  await screen.findByRole("button", { name: "Rau muống, Còn 10" });
  fireEvent.click(screen.getByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ngừng cung cấp" }));

  const detail = document.querySelector(".farm-product-detail-pane");
  expect(detail).not.toBeNull();
  expect(await within(detail as HTMLElement).findByRole("alert")).toBeVisible();
});

it("moves focus into and back from the mobile product detail", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmProducts farmId="farm-1" />);

  const productButton = await screen.findByRole("button", { name: "Rau muống, Còn 10" });
  fireEvent.click(productButton);
  const detailHeading = screen.getByRole("heading", { name: "Các đợt hàng: Rau muống" });
  const back = screen.getByRole("button", { name: "Quay lại sản phẩm" });
  await waitFor(() => expect(detailHeading).toHaveFocus());
  fireEvent.click(back);
  await waitFor(() => expect(productButton).toHaveFocus());
});

it("refreshes Farm inventory totals after changing a product supply status", async () => {
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce({
    ...farm,
    in_stock_product_count: 7,
    out_of_stock_product_count: 4,
  });
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.active.mockResolvedValue({ ...linkedProduct, is_active: false, available_quantity: 0 });
  view(<FarmDetail farmId="farm-1" />);

  expect(await screen.findByText("8 sản phẩm còn hàng")).toBeVisible();
  fireEvent.click(await screen.findByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ngừng cung cấp" }));

  expect(await screen.findByText("7 sản phẩm còn hàng")).toBeVisible();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});

it("explains when a Product was deactivated after catalog selection", async () => {
  mocks.add.mockRejectedValue(Object.assign(new Error("product_inactive"), { status: 409 }));
  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thêm sản phẩm" }));
  const dialog = screen.getByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" });
  fireEvent.change(await within(dialog).findByLabelText("Số lượng đơn vị"), {
    target: { value: "1" },
  });
  fireEvent.click(await within(dialog).findByRole("button", { name: "Thêm sản phẩm" }));
  expect(await within(dialog).findByText(/đã tắt hoạt động/)).toBeVisible();
});

it("shows zero Growth Tracker signups without treating an existing profile as missing", async () => {
  mocks.tracker.mockResolvedValue({ signup_count: 0 });
  view(<FarmDetail farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("tab", { name: "Growth Tracker" }));
  expect(await screen.findByText("0 người đăng ký")).toBeVisible();
  expect(screen.queryByText("Chưa bật profile Growth Tracker")).not.toBeInTheDocument();
});

it("links a catalog Product together with the first current-week stock batch", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-31T03:00:00Z"));
  mocks.add.mockResolvedValue(linkedProduct);
  mocks.linked
    .mockResolvedValueOnce(linkedResult([]))
    .mockResolvedValueOnce(linkedResult([linkedProduct]));
  try {
    view(<FarmProducts farmId="farm-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Thêm sản phẩm" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Thêm sản phẩm" }));
    const addDialog = screen.getByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" });
    expect(await within(addDialog).findByRole("combobox", { name: "Sản phẩm" })).toHaveValue(
      "Rau muống · RAU-01",
    );
    expect(await within(addDialog).findByText("0.5 kg")).toBeVisible();
    expect(within(addDialog).getByLabelText("Ngày bắt đầu")).toHaveValue("2026-10-26");
    expect(within(addDialog).getByLabelText("Ngày kết thúc")).toHaveValue("2026-11-01");
    fireEvent.change(within(addDialog).getByLabelText("Ngày kết thúc"), {
      target: { value: "2026-10-31" },
    });
    expect(within(addDialog).getByRole("radio", { name: "Tùy chọn" })).toBeChecked();
    fireEvent.change(within(addDialog).getByLabelText("Ngày kết thúc"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(within(addDialog).getByLabelText("Số lượng đơn vị"), {
      target: { value: "10" },
    });
    expect(within(addDialog).getByText("5 kg")).toBeVisible();
    fireEvent.click(within(addDialog).getByRole("button", { name: "Thêm sản phẩm" }));
    await waitFor(() =>
      expect(mocks.add).toHaveBeenCalledWith("farm-1", "product-1", {
        start_date: "2026-10-26",
        end_date: "2026-11-01",
        quantity_units: 10,
      }),
    );
  } finally {
    vi.useRealTimers();
  }
});

it("paginates the Farm product catalog during search and preserves the stock draft", async () => {
  const nextProduct = { ...product, id: "product-3", sku: "RAU-03", name_vi: "Rau cải" };
  mocks.available.mockImplementation((_farmId, { page }: { page: number }) =>
    Promise.resolve({
      data: page === 1 ? [product] : [nextProduct],
      meta: { page, page_size: 30, total: 61 },
    }),
  );
  view(<FarmProducts farmId="farm-1" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Thêm sản phẩm" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Thêm sản phẩm" }));
  const dialog = within(screen.getByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" }));

  await dialog.findByRole("navigation", { name: "Trang 1/3" });
  fireEvent.change(dialog.getByRole("searchbox", { name: "Tìm sản phẩm Cửa hàng" }), {
    target: { value: "Rau" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Tìm kiếm" }));
  await dialog.findByLabelText("Số lượng đơn vị");
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị"), { target: { value: "12" } });
  const pages = dialog.getByRole("navigation", { name: "Trang 1/3" });
  fireEvent.click(within(pages).getByRole("button", { name: "3" }));

  await waitFor(() =>
    expect(mocks.available).toHaveBeenLastCalledWith("farm-1", { page: 3, search: "Rau" }),
  );
  expect(dialog.getByRole("combobox", { name: "Sản phẩm" })).toHaveValue("Rau cải · RAU-03");
  expect(await dialog.findByLabelText("Số lượng đơn vị")).toHaveDisplayValue("12");
  expect(mocks.add).not.toHaveBeenCalled();
});

it("offers deactivation instead of removal when a Farm product has batch history", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmProducts farmId="farm-1" />);
  expect(await screen.findByText("Rau muống", { selector: "strong" })).toBeVisible();
  fireEvent.click(screen.getByLabelText("Tùy chọn khác: Rau muống"));
  expect(screen.getByRole("menuitem", { name: "Ngừng cung cấp" })).toBeVisible();
  expect(screen.queryByRole("menuitem", { name: "Gỡ sản phẩm" })).not.toBeInTheDocument();
  expect(mocks.removeLink).not.toHaveBeenCalled();
});

it("lists stock batches and only allows editing an active or upcoming batch", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T03:00:00Z"));
  const active: FarmStockBatch = {
    id: "batch-active",
    farm_product_id: linkedProduct.id,
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
    net_sold_quantity: 4,
    remaining_quantity: 6,
    available_quantity: 6,
    status: "active",
    version: 2,
    created_at: "2026-10-26T00:00:00Z",
    updated_at: "2026-10-26T00:00:00Z",
  };
  const expired: FarmStockBatch = {
    ...active,
    id: "batch-expired",
    start_date: "2026-10-19",
    end_date: "2026-10-25",
    status: "expired",
  };
  const upcoming: FarmStockBatch = {
    ...active,
    id: "batch-upcoming",
    start_date: "2026-11-02",
    end_date: "2026-11-08",
    status: "upcoming",
  };
  const cancelled: FarmStockBatch = {
    ...expired,
    id: "batch-cancelled",
    status: "cancelled",
  };
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.batches.mockResolvedValue({
    data: [active, upcoming, expired, cancelled],
    meta: { page: 1, page_size: 20, total: 4 },
  });
  mocks.updateBatch.mockResolvedValue({ ...active, quantity_units: 12, version: 3 });
  mocks.cancelBatch.mockRejectedValue(
    Object.assign(new Error("version_conflict"), { status: 409 }),
  );

  view(<FarmProducts farmId="farm-1" />);
  expect(
    await screen.findByText("Đang áp dụng", { selector: ".mantine-Badge-label" }),
  ).toBeVisible();
  expect(screen.getByText("Đã hết hạn", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.getByText("Sắp áp dụng", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.getAllByText("Ban đầu 10 · Đã bán ròng 4 · Còn 6 · Khả dụng 6")).toHaveLength(4);
  expect(screen.getAllByText("3000 gói", { selector: "strong" })).toHaveLength(4);
  expect(screen.getAllByRole("button", { name: "Sửa thông tin" })).toHaveLength(2);

  fireEvent.click(screen.getAllByRole("button", { name: "Sửa thông tin" })[0]);
  const dialog = screen.getByRole("dialog", { name: "Sửa đợt hàng" });
  expect(within(dialog).getByLabelText("Ngày bắt đầu")).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Số lượng đơn vị"), {
    target: { value: "12" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.updateBatch).toHaveBeenCalledWith("farm-1", "product-1", "batch-active", {
      start_date: "2026-10-26",
      end_date: "2026-11-01",
      quantity_units: 12,
      version: 2,
    }),
  );

  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Sửa đợt hàng" })).not.toBeInTheDocument(),
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "Hủy đợt hàng" }))[0]);
  const cancelDialog = screen.getByRole("dialog", { name: "Hủy đợt hàng" });
  expect(within(cancelDialog).getByRole("button", { name: "Hủy đợt hàng" })).toHaveStyle({
    "--button-bg": "var(--mantine-color-red-filled)",
  });
  fireEvent.click(within(cancelDialog).getByRole("button", { name: "Hủy đợt hàng" }));
  await waitFor(() =>
    expect(mocks.cancelBatch).toHaveBeenCalledWith("farm-1", "product-1", "batch-active", 2),
  );
  expect(await within(cancelDialog).findByText(/đã được người khác cập nhật/)).toBeVisible();
  fireEvent.click(within(cancelDialog).getByRole("button", { name: "Tải lại dữ liệu" }));
  await waitFor(() => expect(mocks.batches).toHaveBeenCalledTimes(3));
});

it("returns to the first valid batch page after cancelling the only row on page two", async () => {
  const active: FarmStockBatch = {
    id: "batch-page-two",
    farm_product_id: linkedProduct.id,
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
    net_sold_quantity: 0,
    remaining_quantity: 10,
    available_quantity: 10,
    status: "active",
    version: 1,
    created_at: "2026-10-26T00:00:00Z",
    updated_at: "2026-10-26T00:00:00Z",
  };
  let cancelled = false;
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.batches.mockImplementation((_farmId, _productId, query: { page: number }) =>
    Promise.resolve({
      data: cancelled && query.page === 2 ? [] : [active],
      meta: { page: query.page, page_size: 20, total: cancelled ? 20 : 21 },
    }),
  );
  mocks.cancelBatch.mockImplementation(() => {
    cancelled = true;
    return Promise.resolve({ ...active, status: "cancelled", version: 2 });
  });

  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Sau" }));
  await waitFor(() =>
    expect(mocks.batches).toHaveBeenCalledWith("farm-1", "product-1", {
      page: 2,
      status: undefined,
    }),
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "Hủy đợt hàng" }))[0]);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Hủy đợt hàng" })).getByRole("button", {
      name: "Hủy đợt hàng",
    }),
  );

  await waitFor(() =>
    expect(mocks.batches.mock.calls.at(-1)?.[2]).toEqual({ page: 1, status: undefined }),
  );
});

it("returns to the first batch page when reloading after a page-two conflict", async () => {
  const active: FarmStockBatch = {
    id: "batch-conflict-page-two",
    farm_product_id: linkedProduct.id,
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
    net_sold_quantity: 0,
    remaining_quantity: 10,
    available_quantity: 10,
    status: "active",
    version: 1,
    created_at: "2026-10-26T00:00:00Z",
    updated_at: "2026-10-26T00:00:00Z",
  };
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.batches.mockImplementation((_farmId, _productId, query: { page: number }) =>
    Promise.resolve({
      data: [active],
      meta: { page: query.page, page_size: 20, total: 21 },
    }),
  );
  mocks.cancelBatch.mockRejectedValue(
    Object.assign(new Error("version_conflict"), { status: 409 }),
  );

  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Sau" }));
  await waitFor(() =>
    expect(mocks.batches.mock.calls.at(-1)?.[2]).toEqual({ page: 2, status: undefined }),
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "Hủy đợt hàng" }))[0]);
  const dialog = screen.getByRole("dialog", { name: "Hủy đợt hàng" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Hủy đợt hàng" }));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Tải lại dữ liệu" }));

  await waitFor(() =>
    expect(mocks.batches.mock.calls.at(-1)?.[2]).toEqual({ page: 1, status: undefined }),
  );
});

it("adds an overlapping stock batch using the shared date-range form", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.createBatch.mockResolvedValue({
    id: "batch-new",
    farm_product_id: linkedProduct.id,
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
    status: "active",
    version: 1,
    created_at: "2026-10-31T00:00:00Z",
    updated_at: "2026-10-31T00:00:00Z",
  });

  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thêm đợt hàng" }));
  const dialog = screen.getByRole("dialog", { name: "Thêm đợt hàng" });
  fireEvent.change(within(dialog).getByLabelText("Số lượng đơn vị"), {
    target: { value: "10" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Thêm đợt hàng" }));
  await waitFor(() =>
    expect(mocks.createBatch).toHaveBeenCalledWith("farm-1", "product-1", {
      start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      end_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      quantity_units: 10,
    }),
  );
});

it("explains a concurrent product-link change without claiming stock history", async () => {
  mocks.linked.mockResolvedValue(
    linkedResult([{ ...linkedProduct, batch_count: 0, has_supply_history: false }]),
  );
  mocks.removeLink.mockRejectedValue(
    Object.assign(new Error("farm_product_changed"), { status: 409 }),
  );
  view(<FarmProducts farmId="farm-1" />);
  expect(await screen.findByText("Rau muống", { selector: "strong" })).toBeVisible();
  fireEvent.click(screen.getByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Gỡ sản phẩm" }));
  const dialog = screen.getByRole("dialog", { name: "Gỡ sản phẩm" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Gỡ sản phẩm" }));
  expect(await within(dialog).findByText(/Liên kết sản phẩm đã thay đổi/)).toBeVisible();
});

it("searches linked Farm products on the server without fetching each Product detail", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmProducts farmId="farm-1" />);
  expect(await screen.findByText("Rau muống", { selector: "strong" })).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "rau" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  await waitFor(() =>
    expect(mocks.linked).toHaveBeenCalledWith("farm-1", { page: 1, search: "rau" }),
  );
});

it("pages linked Farm products without loading every Product detail", async () => {
  const second = { ...linkedProduct, id: "link-2", product_id: "product-2", sku: "RAU-02" };
  mocks.linked.mockImplementation((_farmId, query: { page: number }) =>
    Promise.resolve(linkedResult(query.page === 1 ? [linkedProduct] : [second], query.page, 21)),
  );
  view(<FarmProducts farmId="farm-1" />);
  expect(await screen.findByText("RAU-01")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sau" }));
  expect(await screen.findByText("RAU-02")).toBeVisible();
  expect(mocks.linked).toHaveBeenCalledWith("farm-1", { page: 2, search: "" });
});

it("retains a stale Farm draft until reload, then cleans its discarded photo and uses the new version", async () => {
  const latest = { ...farm, name_vi: "Nông trại từ máy chủ", version: 3 };
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(latest);
  mocks.upload.mockResolvedValue(farmPhoto("temp-1"));
  mocks.deleteImage.mockResolvedValue(undefined);
  mocks.save
    .mockRejectedValueOnce(Object.assign(new Error("version_conflict"), { status: 409 }))
    .mockResolvedValueOnce({ ...latest, version: 4 });
  view(<FarmEditor farmId="farm-1" />);
  fireEvent.change(await screen.findByDisplayValue("Nông trại Xanh"), {
    target: { value: "Bản nháp" },
  });
  chooseFarmPhotos(photoFile("temp-1"));
  const photo = await screen.findByRole("button", { name: "Chọn ảnh số 1" });
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  const reload = await screen.findByRole("button", { name: "Tải lại dữ liệu" });
  expect(screen.getByDisplayValue("Bản nháp")).toBeVisible();
  expect(photo).toBeVisible();
  expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.deleteImage).not.toHaveBeenCalled();

  fireEvent.click(reload);
  await waitFor(() => expect(mocks.deleteImage).toHaveBeenCalledWith("temp-1"));
  expect(await screen.findByDisplayValue("Nông trại từ máy chủ")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenLastCalledWith(
      "farm-1",
      expect.objectContaining({ version: 3, name_vi: "Nông trại từ máy chủ", photo_ids: [] }),
    ),
  );
});

it("cleans an image upload that finishes after the Farm editor closes", async () => {
  let finish!: (value: MediaAsset) => void;
  mocks.upload.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mocks.deleteImage.mockResolvedValue(undefined);
  const rendered = view(<FarmEditor />);
  const file = photoFile("farm");
  chooseFarmPhotos(file, photoFile("queued"));
  expect(mocks.upload).toHaveBeenCalledWith(file);
  rendered.unmount();
  finish(farmPhoto("orphan-1"));
  await waitFor(() =>
    expect(mocks.deleteImage).toHaveBeenCalledWith("orphan-1", { keepalive: true }),
  );
  expect(mocks.upload).toHaveBeenCalledTimes(1);
});

it("closes the product action menu with Escape and restores its trigger focus", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmProducts farmId="farm-1" />);
  const trigger = await screen.findByRole("button", { name: "Tùy chọn khác: Rau muống" });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.keyDown(await screen.findByRole("menu"), { key: "ArrowDown" });
  const action = await screen.findByRole("menuitem", { name: "Ngừng cung cấp" });
  await waitFor(() => expect(action).toHaveFocus());
  fireEvent.keyDown(action, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(mocks.active).not.toHaveBeenCalled();
});
