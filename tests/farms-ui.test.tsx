import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";

import { FarmList } from "@/components/farm-list";
import { FarmEditor } from "@/components/farm-editor";
import { FarmProducts } from "@/components/farm-products";
import { FarmDetail } from "@/components/farm-detail";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ToastProvider } from "@/components/toast-provider";
import type {
  AvailableFarmProduct,
  Farm,
  FarmProduct,
  FarmStockBatch,
  MediaAsset,
  TrackerFarm,
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
  enableTracker: vi.fn(),
  updateTracker: vi.fn(),
  disableTracker: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/commerce-api", () => ({ getStoreProduct: mocks.productDetail }));
vi.mock("@/lib/farms-api", () => ({
  listFarms: mocks.list,
  getFarm: mocks.get,
  getFarmTracker: mocks.tracker,
  enableFarmTracker: mocks.enableTracker,
  updateFarmTracker: mocks.updateTracker,
  disableFarmTracker: mocks.disableTracker,
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
  useSearchParams: () => useSyncExternalStore(subscribeRoute, readSearch),
}));

let search = new URLSearchParams();
const readSearch = () => search;
function subscribeRoute(listener: () => void) {
  window.addEventListener("test:farm-navigation", listener);
  return () => window.removeEventListener("test:farm-navigation", listener);
}
function setRoute(href: string) {
  search = new URL(href, "https://admin.example.test").searchParams;
  window.dispatchEvent(new Event("test:farm-navigation"));
}

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
const trackerProfile: TrackerFarm = {
  ...farm,
  signup_count: 24,
  one_month_signup_count: 8,
  is_visible: true,
  sort_order: 0,
};
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
  product_status: "active",
  initial_quantity: 10,
  net_sold_quantity: 0,
  available_quantity: 10,
  batch_count: 1,
  active_batch_count: 1,
  has_supply_history: true,
  next_expiry_date: "2026-11-01",
};
const pausedSupply: FarmProduct = {
  ...linkedProduct,
  is_active: false,
  initial_quantity: 0,
  available_quantity: 0,
  active_batch_count: 0,
  next_expiry_date: null,
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
function view(node: React.ReactNode, locale: "vi" | "en" = "vi") {
  const shell = (content: React.ReactNode) => (
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>
        <AdminQueryProvider>{content}</AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
  const rendered = render(shell(node));
  return { ...rendered, close: () => rendered.rerender(shell(null)) };
}
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  search = new URLSearchParams();
  mocks.push.mockImplementation(setRoute);
  mocks.replace.mockImplementation(setRoute);
  mocks.list.mockResolvedValue({ data: [farm], meta: { page: 1, page_size: 20, total: 1 } });
  mocks.get.mockResolvedValue(farm);
  mocks.linked.mockResolvedValue(linkedResult([]));
  mocks.available.mockResolvedValue({
    data: [product],
    meta: { page: 1, page_size: 30, total: 1 },
  });
  mocks.batches.mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } });
  mocks.productDetail.mockImplementation(async (id: string) => ({
    id,
    status: "active",
    unit_size: "0.500",
    unit_label_vi: "kg",
    unit_label_en: "kg",
  }));
  mocks.tracker.mockResolvedValue(trackerProfile);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("lists canonical Farms with search and status without fetching tracker data", async () => {
  view(<FarmList />);
  expect(await screen.findByText("Nông trại Xanh")).toBeVisible();
  expect(screen.getByText("8 có hàng")).toBeVisible();
  expect(screen.getByText("12 sản phẩm")).toBeVisible();
  expect(screen.getByRole("link", { name: "Nông trại Xanh" })).toHaveAttribute(
    "href",
    "/farms/farm-1",
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Đà Lạt" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  await waitFor(() =>
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: "Đà Lạt" }),
      expect.any(AbortSignal),
    ),
  );
  expect(mocks.tracker).not.toHaveBeenCalled();
});

it("keeps Farm shared fields and version in its own editor", async () => {
  mocks.save.mockResolvedValue({ ...farm, version: 3 });
  view(<FarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Tên trang trại *"), {
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
  expect(screen.getByLabelText("Tên trang trại *")).toHaveValue("Green Farm");
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
    expect(screen.getByLabelText("Tên trang trại *")).toHaveFocus();
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
  rendered.close();
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
  rendered.close();
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
  fireEvent.click(screen.getByRole("button", { name: "Tùy chọn khác" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Xóa trang trại" }));
  expect(screen.getByRole("dialog", { name: "Xóa trang trại" })).toBeVisible();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  expect(await screen.findByRole("heading", { name: "Sản phẩm của trang trại" })).toBeVisible();
  await waitFor(() =>
    expect(mocks.linked).toHaveBeenCalledWith(
      "farm-1",
      { page: 1, search: "" },
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByRole("tab", { name: "Sản phẩm & nguồn cung" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(mocks.tracker).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Growth Tracker" }));
  expect(await screen.findByLabelText("Số người đăng ký 6 tháng")).toHaveValue(24);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.tracker).toHaveBeenCalledExactlyOnceWith("farm-1", expect.any(AbortSignal));
});

it("moves Farm detail tabs with arrow, Home and End keys", async () => {
  view(<FarmDetail farmId="farm-1" />);
  const products = await screen.findByRole("tab", { name: "Sản phẩm & nguồn cung" });
  const information = screen.getByRole("tab", { name: "Thông tin" });
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

it.each([
  [
    "vi",
    "Rau muống, Đang bán, Đang cung cấp, Còn trong các đợt hiệu lực: 10 đơn vị bán",
    "Cải ngọt, Đang bán, Ngừng cung cấp, Còn trong các đợt hiệu lực: 0 đơn vị bán",
    "Số lượng còn lại: 50 đơn vị bán",
  ],
  [
    "en",
    "Water spinach, Selling, Supplying, Units from active batches: 10",
    "Choy sum, Selling, Not supplying, Units from active batches: 0",
    "Remaining selling units: 50",
  ],
] as const)(
  "shows availability separately from batch stock for stopped supply in %s",
  async (locale, firstLabel, stoppedLabel, batchInventory) => {
    prepareInventory();
    const stopped = {
      ...pausedSupply,
      id: "link-2",
      product_id: "product-2",
      sku: "RAU-02",
      name_vi: "Cải ngọt",
      name_en: "Choy sum",
    };
    mocks.linked.mockResolvedValue(linkedResult([linkedProduct, stopped]));
    mocks.batches.mockImplementation((_farmId, productId) =>
      Promise.resolve({
        data:
          productId === stopped.product_id
            ? [
                {
                  ...liveBatch,
                  farm_product_id: stopped.id,
                  quantity_units: 50,
                  remaining_quantity: 50,
                  available_quantity: 0,
                },
              ]
            : [liveBatch],
        meta: { page: 1, page_size: 20, total: 1 },
      }),
    );
    view(<FarmProducts farmId="farm-1" />, locale);

    expect(await screen.findByRole("button", { name: firstLabel })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const stoppedButton = screen.getByRole("button", { name: stoppedLabel });
    expect(stoppedButton).toBeVisible();
    await waitFor(() =>
      expect(mocks.batches).toHaveBeenCalledWith(
        "farm-1",
        "product-1",
        {
          page: 1,
          status: undefined,
        },
        { signal: expect.any(AbortSignal), linkId: "link-1" },
      ),
    );
    fireEvent.click(stoppedButton);
    await waitFor(() =>
      expect(mocks.batches).toHaveBeenCalledWith(
        "farm-1",
        "product-2",
        {
          page: 1,
          status: undefined,
        },
        { signal: expect.any(AbortSignal), linkId: "link-2" },
      ),
    );
    expect(await screen.findByText(new RegExp(batchInventory))).toBeVisible();
    expect(
      screen.getAllByText(
        locale === "vi"
          ? "Còn trong các đợt hiệu lực: 0 đơn vị bán"
          : "Units from active batches: 0",
      ),
    ).toHaveLength(1);
    expect(
      screen.getByText(
        locale === "vi" ? "Tính vào nguồn cung: 0 đơn vị bán" : "Units counted toward supply: 0",
      ),
    ).toBeVisible();
    expect(mocks.productDetail).not.toHaveBeenCalled();
  },
);

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
    expect(mocks.batches).toHaveBeenCalledWith(
      "farm-1",
      "product-1",
      {
        page: 2,
        status: undefined,
      },
      { signal: expect.any(AbortSignal), linkId: "link-1" },
    ),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Cải ngọt, Đang bán, Đang cung cấp, Còn trong các đợt hiệu lực: 10 đơn vị bán",
    }),
  );
  await waitFor(() =>
    expect(mocks.batches).toHaveBeenCalledWith(
      "farm-1",
      "product-2",
      {
        page: 1,
        status: undefined,
      },
      { signal: expect.any(AbortSignal), linkId: "link-2" },
    ),
  );
});

it("keeps a product action failure visible when the refreshed list no longer has that link", async () => {
  mocks.linked
    .mockResolvedValueOnce(linkedResult([linkedProduct]))
    .mockResolvedValue(linkedResult([]));
  mocks.active.mockRejectedValue(new Error("network_error"));
  view(<FarmProducts farmId="farm-1" />);

  await screen.findByRole("button", {
    name: "Rau muống, Đang bán, Đang cung cấp, Còn trong các đợt hiệu lực: 10 đơn vị bán",
  });
  fireEvent.click(screen.getByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ngừng cung cấp" }));

  expect(await screen.findByText("Trang trại chưa có sản phẩm nào.")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Không thể kết nối.");
  expect(screen.queryByRole("region", { name: "Các đợt cung cấp RAU-01" })).not.toBeInTheDocument();
  expect(mocks.active).toHaveBeenCalledOnce();
});

it("moves focus into and back from the mobile product detail", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmProducts farmId="farm-1" />);

  const productButton = await screen.findByRole("button", {
    name: "Rau muống, Đang bán, Đang cung cấp, Còn trong các đợt hiệu lực: 10 đơn vị bán",
  });
  fireEvent.click(productButton);
  const detailHeading = screen.getByRole("heading", { name: "Các đợt cung cấp: Rau muống" });
  const back = screen.getByRole("button", { name: "Quay lại sản phẩm" });
  await waitFor(() => expect(detailHeading).toHaveFocus());
  fireEvent.click(back);
  await waitFor(() => expect(productButton).toHaveFocus());
});

it("uses the toggle response and refreshes batches without rereading Farm or its products", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.active.mockResolvedValue(pausedSupply);
  view(<FarmDetail farmId="farm-1" />);

  fireEvent.click(await screen.findByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ngừng cung cấp" }));

  expect(
    await screen.findByRole("button", {
      name: "Rau muống, Đang bán, Ngừng cung cấp, Còn trong các đợt hiệu lực: 0 đơn vị bán",
    }),
  ).toBeVisible();
  await waitFor(() => expect(mocks.batches).toHaveBeenCalledTimes(2));
  expect(mocks.linked).toHaveBeenCalledTimes(1);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

it("explains when a Product was deactivated after catalog selection", async () => {
  mocks.add.mockRejectedValue(Object.assign(new Error("product_inactive"), { status: 409 }));
  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thêm sản phẩm" }));
  const dialog = screen.getByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" });
  fireEvent.change(await within(dialog).findByLabelText("Số lượng đơn vị bán"), {
    target: { value: "1" },
  });
  fireEvent.click(await within(dialog).findByRole("button", { name: "Thêm sản phẩm" }));
  expect(await within(dialog).findByText(/không còn Đang bán/)).toBeVisible();
});

it("shows zero Growth Tracker signups without treating an existing profile as missing", async () => {
  mocks.tracker.mockResolvedValue({ ...trackerProfile, signup_count: 0 });
  view(<FarmDetail farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("tab", { name: "Growth Tracker" }));
  expect(await screen.findByLabelText("Số người đăng ký 6 tháng")).toHaveValue(0);
  expect(screen.getByRole("button", { name: "Lưu Growth Tracker" })).toBeVisible();
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
    expect(await within(addDialog).findByText("Đơn vị bán")).toBeVisible();
    expect(within(addDialog).getByText("Tổng số lượng")).toBeVisible();
    expect(await within(addDialog).findByText("0.5 kg")).toBeVisible();
    expect(within(addDialog).getByLabelText("Số lượng đơn vị bán")).toHaveAccessibleDescription(
      "Ví dụ: với đơn vị bán 500 g, nhập 3 để tính tổng 1,5 kg.",
    );
    expect(within(addDialog).getByLabelText("Ngày bắt đầu")).toHaveValue("26/10/2026");
    expect(within(addDialog).getByLabelText("Ngày kết thúc")).toHaveValue("01/11/2026");
    fireEvent.click(within(addDialog).getByRole("radio", { name: "Tháng hiện tại" }));
    expect(within(addDialog).getByLabelText("Ngày bắt đầu")).toHaveValue("01/10/2026");
    expect(within(addDialog).getByLabelText("Ngày kết thúc")).toHaveValue("31/10/2026");
    fireEvent.click(within(addDialog).getByRole("radio", { name: "Tuần hiện tại" }));
    fireEvent.change(within(addDialog).getByLabelText("Ngày kết thúc"), {
      target: { value: "31102026" },
    });
    expect(within(addDialog).getByRole("radio", { name: "Tùy chọn" })).toBeChecked();
    fireEvent.change(within(addDialog).getByLabelText("Ngày kết thúc"), {
      target: { value: "01/11/2026" },
    });
    fireEvent.change(within(addDialog).getByLabelText("Số lượng đơn vị bán"), {
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
  await dialog.findByLabelText("Số lượng đơn vị bán");
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "12" } });
  const pages = dialog.getByRole("navigation", { name: "Trang 1/3" });
  fireEvent.click(within(pages).getByRole("button", { name: "3" }));

  await waitFor(() =>
    expect(mocks.available).toHaveBeenLastCalledWith(
      "farm-1",
      { page: 3, search: "Rau" },
      expect.any(AbortSignal),
    ),
  );
  expect(dialog.getByRole("combobox", { name: "Sản phẩm" })).toHaveValue("Rau cải · RAU-03");
  expect(await dialog.findByLabelText("Số lượng đơn vị bán")).toHaveDisplayValue("12");
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
    available_quantity: 0,
    status: "expired",
  };
  const upcoming: FarmStockBatch = {
    ...active,
    id: "batch-upcoming",
    start_date: "2026-11-02",
    end_date: "2026-11-08",
    available_quantity: 0,
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
    await screen.findByText("Đang hiệu lực", { selector: ".mantine-Badge-label" }),
  ).toBeVisible();
  expect(screen.getByText("Đã hết hạn", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.getByText("Sắp bắt đầu", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.getAllByText("Ban đầu 10 · Đã bán sau hoàn trả 4")).toHaveLength(4);
  expect(screen.getAllByText("Số lượng còn lại: 6 đơn vị bán")).toHaveLength(4);
  expect(screen.getByText(/Đơn vị bán: 500 gói/)).toBeVisible();
  expect(screen.getAllByText("Tính vào nguồn cung: 0 đơn vị bán")).toHaveLength(3);
  expect(screen.getAllByRole("button", { name: "Sửa đợt cung cấp" })).toHaveLength(2);

  fireEvent.click(screen.getAllByRole("button", { name: "Sửa đợt cung cấp" })[0]);
  const dialog = screen.getByRole("dialog", { name: "Sửa đợt cung cấp" });
  expect(within(dialog).getByLabelText("Ngày bắt đầu")).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Số lượng đơn vị bán"), {
    target: { value: "12" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() =>
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      "farm-1",
      "product-1",
      "batch-active",
      {
        start_date: "2026-10-26",
        end_date: "2026-11-01",
        quantity_units: 12,
        version: 2,
      },
      linkedProduct.id,
    ),
  );

  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Sửa đợt cung cấp" })).not.toBeInTheDocument(),
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "Hủy đợt cung cấp" }))[0]);
  const cancelDialog = screen.getByRole("dialog", { name: "Hủy đợt cung cấp" });
  expect(within(cancelDialog).getByRole("button", { name: "Hủy đợt cung cấp" })).toHaveStyle({
    "--button-bg": "var(--mantine-color-red-filled)",
  });
  fireEvent.click(within(cancelDialog).getByRole("button", { name: "Hủy đợt cung cấp" }));
  await waitFor(() =>
    expect(mocks.cancelBatch).toHaveBeenCalledWith(
      "farm-1",
      "product-1",
      "batch-active",
      2,
      linkedProduct.id,
    ),
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
    expect(mocks.batches).toHaveBeenCalledWith(
      "farm-1",
      "product-1",
      {
        page: 2,
        status: undefined,
      },
      { signal: expect.any(AbortSignal), linkId: "link-1" },
    ),
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "Hủy đợt cung cấp" }))[0]);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Hủy đợt cung cấp" })).getByRole("button", {
      name: "Hủy đợt cung cấp",
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
  fireEvent.click((await screen.findAllByRole("button", { name: "Hủy đợt cung cấp" }))[0]);
  const dialog = screen.getByRole("dialog", { name: "Hủy đợt cung cấp" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Hủy đợt cung cấp" }));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Tải lại dữ liệu" }));

  await waitFor(() =>
    expect(mocks.batches.mock.calls.at(-1)?.[2]).toEqual({ page: 1, status: undefined }),
  );
});

it("shows selling, supplying, and available stock independently for a stopped product", async () => {
  mocks.linked.mockResolvedValue(
    linkedResult([{ ...linkedProduct, product_status: "discontinued" }]),
  );
  view(<FarmProducts farmId="farm-1" />);
  const addBatch = await screen.findByRole("button", { name: "Thêm đợt cung cấp" });
  expect(addBatch).toBeDisabled();
  expect(screen.getByText(/Chỉ sản phẩm Đang bán/)).toBeVisible();
  expect(screen.getAllByText("Ngừng bán").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Đang cung cấp").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Còn trong các đợt hiệu lực: 10 đơn vị bán").length).toBeGreaterThan(
    0,
  );
});

it("retires old Farm inventory and actions when the summary reload is denied after a selling conflict", async () => {
  mocks.linked
    .mockResolvedValueOnce(linkedResult([linkedProduct]))
    .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
  mocks.createBatch.mockRejectedValue(
    Object.assign(new Error("product_not_selling"), { status: 409 }),
  );
  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thêm đợt cung cấp" }));
  const dialog = screen.getByRole("dialog", { name: "Thêm đợt cung cấp" });
  fireEvent.change(within(dialog).getByLabelText("Số lượng đơn vị bán"), {
    target: { value: "10" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Thêm đợt cung cấp" }));
  await waitFor(() => expect(mocks.linked).toHaveBeenCalledTimes(2));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Các đợt cung cấp: Rau muống" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm đợt cung cấp" })).not.toBeInTheDocument();
  });
  expect(mocks.createBatch).toHaveBeenCalledOnce();
});

const liveBatch: FarmStockBatch = {
  id: "batch-1",
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
function prepareInventory() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T03:00:00Z"));
  mocks.batches.mockResolvedValue({
    data: [liveBatch],
    meta: { page: 1, page_size: 20, total: 1 },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

it("keeps impossible and incomplete date drafts, then submits manually entered ISO dates", async () => {
  prepareInventory();
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.createBatch.mockResolvedValue(liveBatch);
  view(<FarmProducts farmId="farm-1" />);

  fireEvent.click(await screen.findByRole("button", { name: "Thêm đợt cung cấp" }));
  const dialog = within(screen.getByRole("dialog", { name: "Thêm đợt cung cấp" }));
  const start = dialog.getByRole("textbox", { name: "Ngày bắt đầu" });
  const end = dialog.getByRole("textbox", { name: "Ngày kết thúc" });
  const submit = dialog.getByRole("button", { name: "Thêm đợt cung cấp" });
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "5" } });
  fireEvent.change(start, { target: { value: "31022027" } });
  fireEvent.change(end, { target: { value: "03/11/202" } });
  fireEvent.blur(end);
  fireEvent.click(submit);

  expect(start).toHaveValue("31/02/2027");
  expect(end).toHaveValue("03/11/202");
  expect(start).toBeInvalid();
  expect(end).toBeInvalid();
  expect(start).toHaveAccessibleDescription(/dd\/mm\/yyyy/);
  expect(end).toHaveAccessibleDescription(/dd\/mm\/yyyy/);
  expect(mocks.createBatch).not.toHaveBeenCalled();

  fireEvent.change(start, { target: { value: "02112026" } });
  fireEvent.change(end, { target: { value: "03112026" } });
  fireEvent.click(submit);
  expect(mocks.createBatch).toHaveBeenCalledExactlyOnceWith(
    "farm-1",
    "product-1",
    { start_date: "2026-11-02", end_date: "2026-11-03", quantity_units: 5 },
    "link-1",
  );
});

it("selects a date from the Foundation calendar and closes an open calendar during an update", async () => {
  prepareInventory();
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  const pending = deferred<FarmStockBatch>();
  mocks.updateBatch.mockReturnValue(pending.promise);
  view(<FarmProducts farmId="farm-1" />, "en");

  fireEvent.click(await screen.findByRole("button", { name: "Edit supply batch" }));
  const dialog = within(screen.getByRole("dialog", { name: "Edit supply batch" }));
  expect(dialog.getByText("Selling unit")).toBeVisible();
  expect(
    dialog.getByRole("spinbutton", { name: "Number of selling units" }),
  ).toHaveAccessibleDescription(
    "For example, enter 3 for a total of 1.5 kg when the selling unit is 500 g.",
  );
  const start = dialog.getByRole("textbox", { name: "Start date" });
  const end = dialog.getByRole("textbox", { name: "End date" });
  expect(start).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Open start date picker" })).toBeDisabled();
  const calendar = dialog.getByRole("button", { name: "Open end date picker" });
  calendar.focus();
  fireEvent.click(calendar);
  const day = await screen.findByRole("button", { name: "4 November 2026" });
  fireEvent.keyDown(day, { key: "Escape" });
  expect(screen.getByRole("dialog", { name: "Edit supply batch" })).toBeVisible();
  expect(calendar).toHaveAttribute("aria-expanded", "false");
  expect(calendar).toHaveFocus();

  fireEvent.click(calendar);
  fireEvent.click(await screen.findByRole("button", { name: "4 November 2026" }));
  expect(end).toHaveValue("04/11/2026");
  expect(calendar).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(calendar);
  const anotherDay = await screen.findByRole("button", { name: "5 November 2026" });
  fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
  expect(calendar).toBeDisabled();
  expect(end).toBeDisabled();
  expect(calendar).toHaveAttribute("aria-expanded", "false");
  expect(anotherDay).not.toBeInTheDocument();
  fireEvent.click(anotherDay);
  expect(end).toHaveValue("04/11/2026");
  expect(mocks.updateBatch).toHaveBeenCalledExactlyOnceWith(
    "farm-1",
    "product-1",
    "batch-1",
    { start_date: "2026-10-26", end_date: "2026-11-04", quantity_units: 10, version: 1 },
    "link-1",
  );
  await act(async () => pending.resolve(liveBatch));
});

it("limits both the calendar and manual dates to the saved window for a stopped product", async () => {
  prepareInventory();
  mocks.linked.mockResolvedValue(
    linkedResult([{ ...linkedProduct, product_status: "discontinued" }]),
  );
  mocks.batches.mockResolvedValue({
    data: [{ ...liveBatch, start_date: "2026-11-02", end_date: "2026-11-08", status: "upcoming" }],
    meta: { page: 1, page_size: 20, total: 1 },
  });
  view(<FarmProducts farmId="farm-1" />, "en");

  fireEvent.click(await screen.findByRole("button", { name: "Edit supply batch" }));
  const dialog = within(screen.getByRole("dialog", { name: "Edit supply batch" }));
  const start = dialog.getByRole("textbox", { name: "Start date" });
  const startPicker = dialog.getByRole("button", { name: "Open start date picker" });
  fireEvent.click(startPicker);
  expect(await screen.findByRole("button", { name: "1 November 2026" })).toBeDisabled();
  fireEvent.click(startPicker);
  const endPicker = dialog.getByRole("button", { name: "Open end date picker" });
  fireEvent.click(endPicker);
  expect(await screen.findByRole("button", { name: "9 November 2026" })).toBeDisabled();
  fireEvent.click(endPicker);

  fireEvent.change(start, { target: { value: "01/11/2026" } });
  const save = dialog.getByRole("button", { name: "Save changes" });
  expect(save).toBeDisabled();
  expect(start).toHaveValue("01/11/2026");
  expect(mocks.updateBatch).not.toHaveBeenCalled();
});

it("enforces existing batch boundaries for stopped inventory and reports a reservation conflict", async () => {
  prepareInventory();
  mocks.linked.mockResolvedValue(
    linkedResult([{ ...linkedProduct, product_status: "discontinued" }]),
  );
  mocks.updateBatch.mockRejectedValue(Object.assign(new Error("stock_reserved"), { status: 409 }));
  mocks.cancelBatch.mockRejectedValue(Object.assign(new Error("stock_reserved"), { status: 409 }));
  view(<FarmProducts farmId="farm-1" />);

  fireEvent.click(await screen.findByRole("button", { name: "Sửa đợt cung cấp" }));
  const edit = within(screen.getByRole("dialog", { name: "Sửa đợt cung cấp" }));
  const quantity = edit.getByLabelText("Số lượng đơn vị bán");
  const end = edit.getByLabelText("Ngày kết thúc");
  const save = edit.getByRole("button", { name: "Lưu thay đổi" });
  fireEvent.change(quantity, { target: { value: "11" } });
  expect(save).toBeDisabled();
  fireEvent.change(quantity, { target: { value: "8" } });
  fireEvent.change(end, { target: { value: "02/11/2026" } });
  expect(save).toBeDisabled();
  expect(mocks.updateBatch).not.toHaveBeenCalled();

  fireEvent.change(end, { target: { value: "01/11/2026" } });
  fireEvent.click(save);
  expect(await edit.findByText(/Tồn kho đã được giữ/)).toBeVisible();
  expect(mocks.updateBatch).toHaveBeenCalledWith(
    "farm-1",
    "product-1",
    "batch-1",
    {
      start_date: "2026-10-26",
      end_date: "2026-11-01",
      quantity_units: 8,
      version: 1,
    },
    "link-1",
  );
  expect(quantity).toHaveValue(8);
  fireEvent.click(edit.getByRole("button", { name: "Hủy" }));

  fireEvent.click(screen.getByRole("button", { name: "Hủy đợt cung cấp" }));
  const cancel = within(screen.getByRole("dialog", { name: "Hủy đợt cung cấp" }));
  fireEvent.click(cancel.getByRole("button", { name: "Hủy đợt cung cấp" }));
  expect(await cancel.findByText(/Tồn kho đã được giữ/)).toBeVisible();
  expect(mocks.cancelBatch).toHaveBeenCalledOnce();
});

it.each([
  ["createBatch", "Thêm đợt cung cấp", "Thêm đợt cung cấp", "Thêm đợt cung cấp"],
  ["updateBatch", "Sửa đợt cung cấp", "Sửa đợt cung cấp", "Lưu thay đổi"],
  ["cancelBatch", "Hủy đợt cung cấp", "Hủy đợt cung cấp", "Hủy đợt cung cấp"],
] as const)(
  "guards against duplicate %s calls while the response is pending",
  async (action, open, dialogName, submit) => {
    prepareInventory();
    mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
    const pending = deferred<FarmStockBatch>();
    mocks[action].mockReturnValue(pending.promise);
    view(<FarmProducts farmId="farm-1" />);
    await screen.findByText("Đang hiệu lực", { selector: ".mantine-Badge-label" });
    fireEvent.click(screen.getByRole("button", { name: open }));
    const dialog = within(screen.getByRole("dialog", { name: dialogName }));
    if (action === "createBatch") {
      fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "10" } });
    }
    const button = dialog.getByRole("button", { name: submit });
    act(() => {
      button.click();
      button.click();
    });
    expect(mocks[action]).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(liveBatch));
  },
);

it("guards against duplicate add calls while the response is pending", async () => {
  const pending = deferred<FarmProduct>();
  mocks.add.mockReturnValue(pending.promise);
  view(<FarmProducts farmId="farm-1" />);
  const open = screen.getByRole("button", { name: "Thêm sản phẩm" });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  const dialog = within(screen.getByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" }));
  fireEvent.change(await dialog.findByLabelText("Số lượng đơn vị bán"), {
    target: { value: "10" },
  });
  const submit = dialog.getByRole("button", { name: "Thêm sản phẩm" });
  act(() => {
    submit.click();
    submit.click();
  });
  expect(mocks.add).toHaveBeenCalledOnce();
  await act(async () => pending.resolve(linkedProduct));
});

it("blocks a pending catalog choice that is no longer selling and ignores its previous choice", async () => {
  const oldProduct = { ...product, id: "old-product", sku: "OLD", name_vi: "Món cũ" };
  const oldDetail = deferred<{ id: string; status: string }>();
  mocks.available.mockResolvedValue({
    data: [oldProduct, product],
    meta: { page: 1, page_size: 30, total: 2 },
  });
  mocks.productDetail
    .mockReturnValueOnce(oldDetail.promise)
    .mockResolvedValueOnce({ id: product.id, status: "discontinued" });
  view(<FarmProducts farmId="farm-1" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Thêm sản phẩm" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Thêm sản phẩm" }));
  const dialog = within(screen.getByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" }));
  const pick = await dialog.findByRole("combobox", { name: "Sản phẩm" });
  await waitFor(() => expect(mocks.productDetail).toHaveBeenCalledOnce());
  fireEvent.click(pick);
  fireEvent.click(await screen.findByRole("option", { name: "Rau muống · RAU-01" }));
  expect(await dialog.findByText(/không còn Đang bán/)).toBeVisible();
  await act(async () => oldDetail.resolve({ id: oldProduct.id, status: "active" }));
  expect((mocks.productDetail.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  expect(mocks.add).not.toHaveBeenCalled();
});

it("ignores a stale Farm response when changing Farm", async () => {
  const old = deferred<ReturnType<typeof linkedResult>>();
  mocks.linked.mockReturnValueOnce(old.promise).mockResolvedValueOnce(
    linkedResult([
      {
        ...linkedProduct,
        farm_id: "farm-2",
        name_vi: "Rau ở Farm mới",
      },
    ]),
  );
  const rendered = view(<FarmProducts farmId="farm-1" />);
  await waitFor(() => expect(mocks.linked).toHaveBeenCalledOnce());
  rendered.rerender(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <FarmProducts farmId="farm-2" />
      </ToastProvider>
    </AdminI18nProvider>,
  );
  expect(
    await screen.findByRole("heading", { name: "Các đợt cung cấp: Rau ở Farm mới" }),
  ).toBeVisible();
  await act(async () => old.resolve(linkedResult([linkedProduct])));
  expect((mocks.linked.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
  expect(screen.queryByText("Rau muống")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Các đợt cung cấp: Rau ở Farm mới" })).toBeVisible();
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
  fireEvent.click(await screen.findByRole("button", { name: "Thêm đợt cung cấp" }));
  const dialog = screen.getByRole("dialog", { name: "Thêm đợt cung cấp" });
  fireEvent.change(within(dialog).getByLabelText("Số lượng đơn vị bán"), {
    target: { value: "10" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Thêm đợt cung cấp" }));
  await waitFor(() =>
    expect(mocks.createBatch).toHaveBeenCalledWith(
      "farm-1",
      "product-1",
      {
        start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        end_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        quantity_units: 10,
      },
      linkedProduct.id,
    ),
  );
});

const linkWithoutHistory: FarmProduct = {
  ...linkedProduct,
  initial_quantity: 0,
  available_quantity: 0,
  batch_count: 0,
  active_batch_count: 0,
  has_supply_history: false,
  next_expiry_date: null,
};

it("closes removal and refreshes actions when a stock batch was added after confirmation opened", async () => {
  const reload = deferred<ReturnType<typeof linkedResult>>();
  mocks.linked
    .mockResolvedValueOnce(linkedResult([linkWithoutHistory]))
    .mockReturnValueOnce(reload.promise);
  mocks.removeLink.mockRejectedValue(
    Object.assign(new Error("farm_product_has_supply"), { status: 409 }),
  );
  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Gỡ sản phẩm" }));
  const dialog = screen.getByRole("dialog", { name: "Gỡ sản phẩm" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Gỡ sản phẩm" }));

  expect(await screen.findByText(/đã có lịch sử cung cấp/)).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Gỡ sản phẩm" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Tùy chọn khác: Rau muống")).not.toBeInTheDocument();
  await act(async () => reload.resolve(linkedResult([linkedProduct])));
  fireEvent.click(await screen.findByLabelText("Tùy chọn khác: Rau muống"));
  expect(screen.getByRole("menuitem", { name: "Ngừng cung cấp" })).toBeVisible();
  expect(screen.queryByRole("menuitem", { name: "Gỡ sản phẩm" })).not.toBeInTheDocument();
  expect(mocks.linked).toHaveBeenCalledTimes(2);
  expect(mocks.removeLink).toHaveBeenCalledOnce();
});

it.each([
  ["farm_product_changed", 409],
  ["not_found", 404],
] as const)(
  "removes stale link actions after a %s response and a reload with no link",
  async (code, status) => {
    mocks.linked
      .mockResolvedValueOnce(linkedResult([linkWithoutHistory]))
      .mockResolvedValueOnce(linkedResult([]));
    mocks.removeLink.mockRejectedValue(Object.assign(new Error(code), { status }));
    view(<FarmProducts farmId="farm-1" />);
    fireEvent.click(await screen.findByLabelText("Tùy chọn khác: Rau muống"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Gỡ sản phẩm" }));
    const dialog = screen.getByRole("dialog", { name: "Gỡ sản phẩm" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gỡ sản phẩm" }));
    expect(await screen.findByText(/Liên kết sản phẩm đã thay đổi/)).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tùy chọn khác: Rau muống")).not.toBeInTheDocument();
    expect(screen.queryByText(/đã có lịch sử cung cấp/)).not.toBeInTheDocument();
    expect(mocks.linked).toHaveBeenCalledTimes(2);
    expect(mocks.removeLink).toHaveBeenCalledOnce();
  },
);

it("blocks Farm link mutations after failed recovery and reloads only data on retry", async () => {
  mocks.linked
    .mockResolvedValueOnce(linkedResult([linkedProduct]))
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(linkedResult([pausedSupply]));
  mocks.active.mockRejectedValue(Object.assign(new Error("farm_product_changed"), { status: 409 }));
  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ngừng cung cấp" }));
  const retry = await screen.findByRole("button", { name: "Thử lại" });
  expect(screen.getByText(/Liên kết sản phẩm đã thay đổi/)).toBeVisible();
  expect(screen.queryByLabelText("Tùy chọn khác: Rau muống")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Thêm đợt cung cấp" })).not.toBeInTheDocument();
  expect(mocks.active).toHaveBeenCalledOnce();
  fireEvent.click(retry);
  fireEvent.click(await screen.findByLabelText("Tùy chọn khác: Rau muống"));
  expect(screen.getByRole("menuitem", { name: "Tiếp tục cung cấp" })).toBeVisible();
  expect(mocks.linked).toHaveBeenCalledTimes(3);
  expect(mocks.active).toHaveBeenCalledOnce();
});

it("searches linked Farm products on the server without fetching each Product detail", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmProducts farmId="farm-1" />);
  expect(await screen.findByText("Rau muống", { selector: "strong" })).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "rau" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  await waitFor(() =>
    expect(mocks.linked).toHaveBeenCalledWith(
      "farm-1",
      { page: 1, search: "rau" },
      expect.any(AbortSignal),
    ),
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
  expect(mocks.linked).toHaveBeenCalledWith(
    "farm-1",
    { page: 2, search: "" },
    expect.any(AbortSignal),
  );
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
  rendered.close();
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

function DetailWithBreadcrumb() {
  const items = useAdminBreadcrumbs([]);
  return (
    <>
      <nav aria-label="Farm breadcrumb">
        {items.map(({ label, href }) =>
          href ? (
            <a key={href} href={href}>
              {label}
            </a>
          ) : (
            <span key={label}>{label}</span>
          ),
        )}
      </nav>
      <FarmDetail farmId="farm-1" />
    </>
  );
}

function FarmBreadcrumbScope() {
  const current = useSyncExternalStore(subscribeRoute, readSearch);
  return (
    <AdminBreadcrumbProvider pathname="/farms/farm-1" search={current.toString()}>
      <DetailWithBreadcrumb />
    </AdminBreadcrumbProvider>
  );
}

it("retries the failed Farm list read and shows a filtered empty result", async () => {
  search = new URLSearchParams("search=unknown&is_active=false");
  mocks.list.mockRejectedValueOnce(new Error("network_error")).mockResolvedValueOnce({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
  });
  view(<FarmList />);
  fireEvent.click(
    within(await screen.findByRole("alert")).getByRole("button", { name: "Thử lại" }),
  );
  expect(await screen.findByText("Không tìm thấy trang trại phù hợp.")).toBeVisible();
  expect(mocks.list).toHaveBeenLastCalledWith(
    {
      search: "unknown",
      page: 1,
      is_active: false,
    },
    expect.any(AbortSignal),
  );
  expect(mocks.tracker).not.toHaveBeenCalled();
});

it("loads only Tracker on direct entry, keeps its draft across tabs and preserves the parent context", async () => {
  search = new URLSearchParams("search=xanh&is_active=true&page=2&view=tracker&tab=tracker");
  view(<FarmBreadcrumbScope />);
  const breadcrumb = within(screen.getByRole("navigation", { name: "Farm breadcrumb" }));
  expect(breadcrumb.getByText("Chi tiết trang trại")).toBeVisible();
  const count = await screen.findByLabelText("Số người đăng ký 6 tháng");
  expect(breadcrumb.getByText("Nông trại Xanh")).toBeVisible();
  expect(breadcrumb.getByRole("link", { name: "Danh sách trang trại" })).toHaveAttribute(
    "href",
    "/farms?search=xanh&is_active=true&page=2",
  );
  expect(screen.getByRole("link", { name: "Sửa thông tin" })).toHaveAttribute(
    "href",
    "/farms/farm-1/edit?search=xanh&is_active=true&page=2&tab=tracker",
  );
  expect(mocks.linked).not.toHaveBeenCalled();
  fireEvent.change(count, { target: { value: "25" } });
  fireEvent.click(screen.getByRole("tab", { name: "Thông tin" }));
  expect(screen.getByText("Organic greens")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Growth Tracker" }));
  expect(await screen.findByLabelText("Số người đăng ký 6 tháng")).toHaveValue(25);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.tracker).toHaveBeenCalledTimes(1);
  expect(mocks.linked).not.toHaveBeenCalled();
});

it("retires the Farm name and its breadcrumb when Tracker loses access", async () => {
  mocks.tracker.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
  view(<FarmBreadcrumbScope />);
  const breadcrumb = within(screen.getByRole("navigation", { name: "Farm breadcrumb" }));
  await breadcrumb.findByText("Nông trại Xanh");
  fireEvent.click(screen.getByRole("tab", { name: "Growth Tracker" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(breadcrumb.queryByText("Nông trại Xanh")).not.toBeInTheDocument();
  expect(breadcrumb.getByText("Chi tiết trang trại")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Sửa thông tin" })).not.toBeInTheDocument();
});

it("keeps Farm deletion protection and can deactivate using the current version", async () => {
  mocks.removeFarm.mockRejectedValue(Object.assign(new Error("farm_in_use"), { status: 409 }));
  mocks.save.mockResolvedValue({ ...farm, is_active: false, version: 3 });
  view(<FarmDetail farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Tùy chọn khác" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Xóa trang trại" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: "Xóa trang trại" }));
  expect(await dialog.findByRole("alert")).toHaveTextContent(/thay vì xóa/);
  fireEvent.click(dialog.getByRole("button", { name: "Tắt hoạt động" }));
  expect(await screen.findByText("Ngừng hoạt động")).toBeVisible();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("farm-1", { version: 2, is_active: false });
  expect(mocks.removeFarm).toHaveBeenCalledTimes(1);
  expect(mocks.replace).not.toHaveBeenCalled();
});
