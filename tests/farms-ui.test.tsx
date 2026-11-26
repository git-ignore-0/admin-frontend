import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";

import { FarmList } from "@/components/farm-list";
import { FarmEditor } from "@/components/farm-editor";
import { FarmProducts } from "@/components/farm-products";
import { FarmSourceDetail } from "@/components/farm-source-detail";
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
  FarmProductDetail,
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
  source: vi.fn(),
  history: vi.fn(),
  readd: vi.fn(),
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
vi.mock("@/lib/farms-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/farms-api")>()),
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
  getFarmProduct: mocks.source,
  listFarmProductHistory: mocks.history,
  readdFarmProduct: mocks.readd,
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
  unit_size: "500.000",
  unit_label_vi: "g",
  unit_label_en: "g",
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
  supply_status: "supplying",
  removed_at: null,
  version: 2,
  supply_generation: 1,
  product_status: "active",
  initial_quantity: 10,
  net_sold_quantity: 0,
  available_quantity: 10,
  batch_count: 1,
  active_batch_count: 1,
  has_supply_history: true,
  next_expiry_date: "2026-11-01",
};
const supplying: FarmProductDetail = {
  ...linkedProduct,
  capabilities: {
    can_remove: true,
    can_create_batch: true,
    can_readd: false,
    blockers: { readd: { code: "farm_product_not_removed" } },
  },
};
const removedSupply: FarmProductDetail = {
  ...supplying,
  version: 3,
  supply_status: "removed",
  removed_at: "2026-10-31T03:00:00Z",
  capabilities: {
    can_remove: false,
    can_create_batch: false,
    can_readd: true,
    blockers: {
      remove: { code: "farm_product_removed" },
      create_batch: { code: "farm_product_removed" },
    },
  },
  is_active: false,
  initial_quantity: 0,
  available_quantity: 0,
  active_batch_count: 0,
  next_expiry_date: null,
};
function linkedResult<T>(data: T[], page = 1, total = data.length) {
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
function viewFarmInformation(extra?: React.ReactNode) {
  search = new URLSearchParams("tab=information");
  return view(
    <>
      {extra}
      <FarmDetail farmId={farm.id} />
    </>,
  );
}
async function saveFarmInformation() {
  const save = screen.getByRole("button", { name: "Lưu thay đổi" });
  await waitFor(() => expect(save).toBeEnabled());
  await act(async () => fireEvent.click(save));
}
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  search = new URLSearchParams();
  mocks.push.mockImplementation(setRoute);
  mocks.replace.mockImplementation(setRoute);
  mocks.list.mockResolvedValue({ data: [farm], meta: { page: 1, page_size: 20, total: 1 } });
  mocks.get.mockResolvedValue(farm);
  mocks.linked.mockResolvedValue(linkedResult([]));
  mocks.source.mockResolvedValue(supplying);
  mocks.history.mockResolvedValue(linkedResult([]));
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
  mocks.tracker.mockRejectedValue(Object.assign(new Error("not_found"), { status: 404 }));
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

it("saves only the changed Farm information fields at the current version", async () => {
  mocks.save.mockResolvedValue({ ...farm, name_vi: "Nông trại Mới", version: 3 });
  viewFarmInformation();
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Tên trang trại *"), {
    target: { value: "Nông trại Mới" },
  });
  await saveFarmInformation();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("farm-1", {
    name_vi: "Nông trại Mới",
    version: 2,
  });
  expect(screen.getByRole("heading", { name: "Nông trại Mới", level: 1 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  expect(mocks.enableTracker).not.toHaveBeenCalled();
  expect(mocks.updateTracker).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("keeps Farm edits and temporary photos when the Admin language changes", async () => {
  const temp = { id: "temp-locale", url: "/temp.webp", width: 100, height: 100, variants: [] };
  mocks.upload.mockResolvedValue(temp);
  mocks.deleteImage.mockResolvedValue(undefined);
  viewFarmInformation(<LanguageSwitcher />);
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
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("groups name, location, and description by locale in Farm Information", async () => {
  mocks.save.mockResolvedValue({ ...farm, location_en: "Da Lat City", version: 3 });
  viewFarmInformation();
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  expect(screen.getByLabelText("Địa điểm *")).toHaveValue("Đà Lạt");
  expect(screen.getByLabelText("Mô tả")).toHaveValue("Rau sạch");
  expect(screen.queryByDisplayValue("Da Lat")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: /English/ }));
  expect(screen.getByLabelText("Tên trang trại *")).toHaveValue("Green Farm");
  expect(screen.getByLabelText("Địa điểm *")).toHaveValue("Da Lat");
  expect(screen.getByLabelText("Mô tả")).toHaveValue("Organic greens");
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: "Da Lat City" } });
  await saveFarmInformation();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("farm-1", {
    version: 2,
    location_en: "Da Lat City",
  });
  fireEvent.click(screen.getByRole("tab", { name: /Tiếng Việt/ }));
  expect(screen.getByLabelText("Địa điểm *")).toHaveValue("Đà Lạt");
});

it("opens and focuses the missing language field before creating a Farm", () => {
  view(<FarmEditor />);
  fireEvent.change(screen.getByLabelText("Tên trang trại *"), { target: { value: farm.name_vi } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: farm.location_vi } });
  fireEvent.click(screen.getByRole("tab", { name: /English/ }));
  fireEvent.change(screen.getByLabelText("Tên trang trại *"), { target: { value: farm.name_en } });
  fireEvent.click(screen.getByRole("tab", { name: /Tiếng Việt/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tạo trang trại" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Nhập tên và địa điểm ở cả hai ngôn ngữ.");
  expect(screen.getByRole("tab", { name: /English/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Địa điểm *")).toHaveFocus();
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each(["vi", "en"] as const)(
  "focuses the missing %s Farm name through the shared Mantine fields",
  (language) => {
    view(<FarmEditor />);
    fireEvent.change(screen.getByLabelText("Tên trang trại *"), {
      target: { value: language === "vi" ? "" : farm.name_vi },
    });
    fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: farm.location_vi } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo trang trại" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập tên và địa điểm ở cả hai ngôn ngữ.");
    expect(
      screen.getByRole("tab", { name: language === "vi" ? /Tiếng Việt/ : /English/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Tên trang trại *")).toHaveFocus();
    expect(mocks.save).not.toHaveBeenCalled();
  },
);

it("preserves an existing cover image when the older Farm has no gallery rows", async () => {
  const cover = { id: "cover-1", url: "/cover.webp", width: 100, height: 100, variants: [] };
  mocks.get.mockResolvedValue({ ...farm, image: cover, photos: [] });
  mocks.save.mockResolvedValue({
    ...farm,
    name_vi: "Tên mới",
    image: cover,
    photos: [],
    version: 3,
  });
  viewFarmInformation();
  fireEvent.change(await screen.findByDisplayValue(farm.name_vi), { target: { value: "Tên mới" } });
  await saveFarmInformation();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, { version: 2, name_vi: "Tên mới" });
  const photo = screen.getByRole("button", { name: "Chọn ảnh số 1" });
  expect(photo).toHaveAccessibleDescription("Ảnh đại diện");
  expect(within(photo).getByRole("img")).toHaveAttribute("src", "/cover.webp");
  expect(mocks.deleteImage).not.toHaveBeenCalled();
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
  mocks.save.mockResolvedValue({
    ...farm,
    image: photos[2],
    photos: [photos[2], photos[0], photos[1]],
    version: 3,
  });
  viewFarmInformation();
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Chọn ảnh số 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Đưa ảnh lên trước 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Đặt làm đại diện" }));
  await saveFarmInformation();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
    photo_ids: ["photo-3", "photo-1", "photo-2"],
    version: 2,
  });
});

it("promotes the next Farm photo to cover when the existing cover is removed", async () => {
  const photos = [farmPhoto("cover"), farmPhoto("next")];
  mocks.get.mockResolvedValue({ ...farm, image: photos[0], photos });
  mocks.save.mockResolvedValue({ ...farm, image: photos[1], photos: [photos[1]], version: 3 });
  viewFarmInformation();

  fireEvent.click(await screen.findByRole("button", { name: "Chọn ảnh số 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
  const next = screen.getByRole("button", { name: "Chọn ảnh số 1" });
  expect(within(next).getByRole("img", { name: "Ảnh trang trại 1" })).toHaveAttribute(
    "src",
    "/next.webp",
  );
  expect(next).toHaveAccessibleDescription("Ảnh đại diện");
  await saveFarmInformation();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, { photo_ids: ["next"], version: 2 });
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("clears a legacy Farm cover through the photo order payload", async () => {
  mocks.get.mockResolvedValue({ ...farm, image: farmPhoto("legacy"), photos: [] });
  mocks.save.mockResolvedValue({ ...farm, version: 3 });
  viewFarmInformation();

  fireEvent.click(await screen.findByRole("button", { name: "Chọn ảnh số 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
  expect(screen.getByText("0/12")).toBeVisible();
  await saveFarmInformation();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, { photo_ids: [], version: 2 });
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("rejects a batch beyond the remaining Farm photo capacity and disables choosing when full", async () => {
  const photos = Array.from({ length: 11 }, (_, index) => farmPhoto(`photo-${index}`));
  mocks.get.mockResolvedValue({ ...farm, photos });
  mocks.upload.mockResolvedValue(farmPhoto("last"));
  mocks.deleteImage.mockResolvedValue(undefined);
  viewFarmInformation();
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
  const uploaded = farmPhoto("working");
  mocks.upload
    .mockReturnValueOnce(
      new Promise<MediaAsset>((_, reject) => {
        rejectFirst = reject;
      }),
    )
    .mockResolvedValueOnce(uploaded);
  mocks.save.mockResolvedValue({ ...farm, image: uploaded, photos: [uploaded], version: 3 });
  mocks.deleteImage.mockResolvedValue(undefined);
  const rendered = viewFarmInformation();
  await screen.findByDisplayValue("Nông trại Xanh");
  chooseFarmPhotos(first, second);
  expect(mocks.upload.mock.calls).toEqual([[first]]);
  expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();

  await act(async () => rejectFirst(new Error("network_error")));
  expect(mocks.upload.mock.calls).toEqual([[first], [second]]);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "Chọn ảnh số 1" })).toBeVisible();
  await saveFarmInformation();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
    photo_ids: ["working"],
    version: 2,
  });
  expect(mocks.replace).not.toHaveBeenCalled();
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

it("cleans temporary uploads when leaving Farm Information and preserves removed persisted images", async () => {
  const saved = farmPhoto("persisted");
  mocks.get.mockResolvedValue({ ...farm, image: saved, photos: [saved] });
  mocks.upload
    .mockResolvedValueOnce(farmPhoto("temporary-one"))
    .mockResolvedValueOnce(farmPhoto("temporary-two"));
  mocks.deleteImage.mockResolvedValue(undefined);
  const rendered = viewFarmInformation();
  fireEvent.click(await screen.findByRole("button", { name: "Chọn ảnh số 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
  chooseFarmPhotos(photoFile("temporary-one"), photoFile("temporary-two"));
  await screen.findByText("2/12");
  expect(screen.getByRole("button", { name: "Hoàn tác" })).toBeEnabled();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  rendered.close();
  expect(mocks.deleteImage.mock.calls).toEqual([
    ["temporary-one", { keepalive: true }],
    ["temporary-two", { keepalive: true }],
  ]);
});

it("keeps a submitted Farm photo when Information unmounts after a successful save", async () => {
  const uploaded = farmPhoto("accepted");
  mocks.upload.mockResolvedValue(uploaded);
  mocks.save.mockResolvedValue({ ...farm, image: uploaded, photos: [uploaded], version: 3 });
  const rendered = viewFarmInformation();
  await screen.findByDisplayValue("Nông trại Xanh");
  chooseFarmPhotos(photoFile("accepted"));
  await screen.findByText("1/12");
  await saveFarmInformation();
  expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
    photo_ids: ["accepted"],
    version: 2,
  });
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
  viewFarmInformation();
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

it("opens the supplied products tab before loading Tracker on Information", async () => {
  mocks.tracker.mockResolvedValue(trackerProfile);
  view(<FarmDetail farmId="farm-1" />);
  expect(await screen.findByRole("heading", { name: "Nông trại Xanh" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Sửa thông tin" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tùy chọn khác" }));
  expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  expect(screen.getByRole("menuitem", { name: "Ngừng hoạt động" })).toBeVisible();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Xóa trang trại" }));
  expect(screen.getByRole("dialog", { name: "Xóa trang trại" })).toBeVisible();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  expect(await screen.findByText("Trang trại chưa có sản phẩm nào.")).toBeVisible();
  await waitFor(() =>
    expect(mocks.linked).toHaveBeenCalledWith(
      "farm-1",
      { page: 1, search: "", supplyStatus: "supplying" },
      expect.any(AbortSignal),
    ),
  );
  const tabs = within(screen.getByRole("tablist", { name: "Chi tiết trang trại" }));
  expect(tabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Sản phẩm cung cấp",
    "Thông tin",
  ]);
  expect(tabs.getByRole("tab", { name: "Sản phẩm cung cấp" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(mocks.tracker).not.toHaveBeenCalled();
  fireEvent.click(tabs.getByRole("tab", { name: "Thông tin" }));
  const count = await screen.findByLabelText("Số người đăng ký 6 tháng");
  await waitFor(() => expect(count).toHaveValue("24"));
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.tracker).toHaveBeenCalledExactlyOnceWith("farm-1", expect.any(AbortSignal));
});

it("moves Farm detail tabs with arrow, Home and End keys", async () => {
  view(<FarmDetail farmId="farm-1" />);
  const products = await screen.findByRole("tab", { name: "Sản phẩm cung cấp" });
  const information = screen.getByRole("tab", { name: "Thông tin" });
  expect(products).toHaveAttribute("tabindex", "0");
  fireEvent.keyDown(products, { key: "ArrowRight" });
  expect(information).toHaveFocus();
  expect(information).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(information, { key: "Home" });
  expect(products).toHaveFocus();
  fireEvent.keyDown(products, { key: "End" });
  expect(information).toHaveFocus();
});

it("shows zero Growth Tracker signups without treating an existing profile as missing", async () => {
  mocks.tracker.mockResolvedValue({ ...trackerProfile, signup_count: 0 });
  view(<FarmDetail farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("tab", { name: "Thông tin" }));
  const count = await screen.findByLabelText("Số người đăng ký 6 tháng");
  await waitFor(() => expect(count).toBeEnabled());
  expect(count).toHaveValue("0");
  expect(screen.getByRole("checkbox", { name: "Hiển thị trên Growth Tracker" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  expect(mocks.enableTracker).not.toHaveBeenCalled();
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
  source_version: supplying.version,
  supply_generation: 1,
  is_historical: false,
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
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it("keeps impossible and incomplete date drafts, then submits manually entered ISO dates", async () => {
  prepareInventory();
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.createBatch.mockResolvedValue(liveBatch);
  view(<FarmSourceDetail farm={farm} productId="product-1" />);

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
  await waitFor(() =>
    expect(mocks.createBatch).toHaveBeenCalledExactlyOnceWith(
      "farm-1",
      "product-1",
      { start_date: "2026-11-02", end_date: "2026-11-03", quantity_units: 5 },
      expect.objectContaining({ id: "link-1", version: 2 }),
    ),
  );
});

it("selects a date from the Foundation calendar and closes an open calendar during an update", async () => {
  prepareInventory();
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  const pending = deferred<FarmStockBatch>();
  mocks.updateBatch.mockReturnValue(pending.promise);
  view(<FarmSourceDetail farm={farm} productId="product-1" />, "en");

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
  await waitFor(() => expect(calendar).toBeDisabled());
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
    expect.objectContaining({ id: "link-1", version: 2 }),
  );
  await act(async () => pending.resolve(liveBatch));
});

it("limits both the calendar and manual dates to the saved window for a stopped product", async () => {
  prepareInventory();
  mocks.source.mockResolvedValue({ ...supplying, product_status: "discontinued" });
  mocks.batches.mockResolvedValue({
    data: [{ ...liveBatch, start_date: "2026-11-02", end_date: "2026-11-08", status: "upcoming" }],
    meta: { page: 1, page_size: 20, total: 1 },
  });
  view(<FarmSourceDetail farm={farm} productId="product-1" />, "en");

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
  mocks.source.mockResolvedValue({ ...supplying, product_status: "discontinued" });
  mocks.updateBatch.mockRejectedValue(Object.assign(new Error("stock_reserved"), { status: 409 }));
  mocks.cancelBatch.mockRejectedValue(Object.assign(new Error("stock_reserved"), { status: 409 }));
  view(<FarmSourceDetail farm={farm} productId="product-1" />);

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
    expect.objectContaining({ id: "link-1", version: 2 }),
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
    view(<FarmSourceDetail farm={farm} productId="product-1" />);
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
    await waitFor(() => expect(mocks[action]).toHaveBeenCalledOnce());
    await act(async () => pending.resolve(liveBatch));
  },
);

it("aborts stale source reads and does not load batches until the new source is verified", async () => {
  const old = deferred<FarmProductDetail>();
  mocks.source.mockReturnValueOnce(old.promise).mockResolvedValueOnce({
    ...supplying,
    farm_id: "farm-2",
    name_vi: "Rau ở Farm mới",
  });
  const rendered = view(<FarmSourceDetail farm={farm} productId="product-1" />);
  await waitFor(() => expect(mocks.source).toHaveBeenCalledOnce());
  expect(mocks.batches).not.toHaveBeenCalled();
  rendered.rerender(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider>
          <FarmSourceDetail farm={{ ...farm, id: "farm-2" }} productId="product-1" />
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
  expect(await screen.findByRole("heading", { name: "Rau ở Farm mới" })).toBeVisible();
  await act(async () => old.resolve(supplying));
  expect((mocks.source.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
  expect(screen.queryByText("Rau muống")).not.toBeInTheDocument();
  expect(mocks.batches).toHaveBeenCalledExactlyOnceWith(
    "farm-2",
    "product-1",
    { scope: "current", page: 1 },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
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

  view(<FarmSourceDetail farm={farm} productId="product-1" />);
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
      expect.objectContaining({ id: linkedProduct.id, version: 2 }),
    ),
  );
});

it("searches linked Farm products on the server without fetching each Product detail", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmProducts farm={farm} />);
  expect(await screen.findByRole("link", { name: "Rau muống" })).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "rau" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  await waitFor(() =>
    expect(mocks.linked).toHaveBeenCalledWith(
      "farm-1",
      { page: 1, search: "rau", supplyStatus: "supplying" },
      expect.any(AbortSignal),
    ),
  );
});

it("pages linked Farm products without loading every Product detail", async () => {
  const second = { ...linkedProduct, id: "link-2", product_id: "product-2", sku: "RAU-02" };
  mocks.linked.mockImplementation((_farmId, query: { page: number }) =>
    Promise.resolve(linkedResult(query.page === 1 ? [linkedProduct] : [second], query.page, 21)),
  );
  view(<FarmProducts farm={farm} />);
  expect(await screen.findByText("RAU-01")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sau" }));
  expect(await screen.findByText("RAU-02")).toBeVisible();
  expect(mocks.linked).toHaveBeenCalledWith(
    "farm-1",
    { page: 2, search: "", supplyStatus: "supplying" },
    expect.any(AbortSignal),
  );
});

it("reviews a newer Farm version after conflict and cleans the photo when the draft is undone", async () => {
  const latest = { ...farm, name_vi: "Nông trại từ máy chủ", version: 3 };
  const updated = { ...latest, description_vi: "Rau mới", version: 4 };
  mocks.get
    .mockResolvedValueOnce(farm)
    .mockResolvedValueOnce(farm)
    .mockResolvedValueOnce(latest)
    .mockResolvedValueOnce(latest)
    .mockResolvedValue(updated);
  mocks.upload.mockResolvedValue(farmPhoto("temp-1"));
  mocks.deleteImage.mockResolvedValue(undefined);
  mocks.save
    .mockRejectedValueOnce(Object.assign(new Error("version_conflict"), { status: 409 }))
    .mockResolvedValueOnce(updated);
  viewFarmInformation();
  fireEvent.change(await screen.findByDisplayValue("Nông trại Xanh"), {
    target: { value: "Bản nháp" },
  });
  chooseFarmPhotos(photoFile("temp-1"));
  const photo = await screen.findByRole("button", { name: "Chọn ảnh số 1" });
  await saveFarmInformation();
  const check = await screen.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" });
  expect(screen.getByDisplayValue("Bản nháp")).toBeVisible();
  expect(photo).toBeVisible();
  expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(mocks.deleteImage).not.toHaveBeenCalled();

  await act(async () => fireEvent.click(check));
  expect(screen.getByDisplayValue("Bản nháp")).toBeVisible();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  const useLatest = await screen.findByRole("button", { name: "Dùng phiên bản mới nhất" });
  await act(async () => fireEvent.click(useLatest));
  const undo = screen.getByRole("button", { name: "Hoàn tác" });
  await waitFor(() => expect(undo).toBeEnabled());
  fireEvent.click(undo);
  expect(mocks.deleteImage).toHaveBeenCalledExactlyOnceWith("temp-1", { keepalive: true });
  expect(await screen.findByDisplayValue("Nông trại từ máy chủ")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Mô tả"), { target: { value: "Rau mới" } });
  await saveFarmInformation();
  expect(mocks.save).toHaveBeenLastCalledWith("farm-1", {
    version: 3,
    description_vi: "Rau mới",
  });
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

it("opens Information from the old Tracker query and keeps the draft and browsing context across tabs", async () => {
  mocks.tracker.mockResolvedValue(trackerProfile);
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct], 3, 41));
  search = new URLSearchParams(
    "search=xanh&is_active=true&page=2&supply_search=rau&supply_status=all&supply_page=3&view=tracker&tab=tracker",
  );
  view(<FarmBreadcrumbScope />);
  const breadcrumb = within(screen.getByRole("navigation", { name: "Farm breadcrumb" }));
  expect(breadcrumb.getByText("Chi tiết trang trại")).toBeVisible();
  const count = await screen.findByLabelText("Số người đăng ký 6 tháng");
  expect(breadcrumb.getByText("Nông trại Xanh")).toBeVisible();
  expect(breadcrumb.getByRole("link", { name: "Danh sách trang trại" })).toHaveAttribute(
    "href",
    "/farms?search=xanh&is_active=true&page=2",
  );
  expect(screen.getByRole("tab", { name: "Thông tin" })).toHaveAttribute("aria-selected", "true");
  expect(mocks.linked).not.toHaveBeenCalled();
  await waitFor(() => expect(count).toHaveValue("24"));
  fireEvent.change(count, { target: { value: "25" } });
  fireEvent.click(screen.getByRole("tab", { name: "Sản phẩm cung cấp" }));
  await waitFor(() =>
    expect(mocks.linked).toHaveBeenCalledExactlyOnceWith(
      "farm-1",
      { page: 3, search: "rau", supplyStatus: "all" },
      expect.any(AbortSignal),
    ),
  );
  fireEvent.click(screen.getByRole("tab", { name: "Thông tin" }));
  expect(await screen.findByLabelText("Số người đăng ký 6 tháng")).toHaveValue("25");
  expect(screen.getByDisplayValue("Rau sạch")).toBeVisible();
  expect(mocks.push.mock.calls).toEqual([
    [
      "/farms/farm-1?search=xanh&is_active=true&page=2&supply_search=rau&supply_status=all&supply_page=3",
      { scroll: false },
    ],
    [
      "/farms/farm-1?search=xanh&is_active=true&page=2&supply_search=rau&supply_status=all&supply_page=3&tab=information",
      { scroll: false },
    ],
  ]);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.tracker).toHaveBeenCalledTimes(1);
});

it("corrects a late out-of-range supply page only when the Products tab is active", async () => {
  setRoute("/farms/farm-1?search=green&supply_status=all&supply_page=3");
  const reduced = linkedResult([linkedProduct]);
  const pending = deferred<typeof reduced>();
  mocks.linked.mockReturnValueOnce(pending.promise).mockResolvedValue(reduced);
  view(<FarmDetail farmId={farm.id} />);
  await waitFor(() =>
    expect(mocks.linked).toHaveBeenCalledExactlyOnceWith(
      farm.id,
      { page: 3, search: "", supplyStatus: "all" },
      expect.any(AbortSignal),
    ),
  );
  const information = screen.getByRole("tab", { name: "Thông tin" });
  fireEvent.click(information);
  fireEvent.change(await screen.findByDisplayValue(farm.name_vi), {
    target: { value: "Bản nháp" },
  });

  await act(async () => pending.resolve(reduced));
  // The inactive panel stays mounted. Waiting for the SKU proves the delayed query settled.
  await screen.findByText(linkedProduct.sku);
  expect(information).toHaveAttribute("aria-selected", "true");
  expect(screen.getByDisplayValue("Bản nháp")).toBeVisible();
  expect(mocks.replace).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("tab", { name: "Sản phẩm cung cấp" }));
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      "/farms/farm-1?search=green&supply_status=all",
      { scroll: false },
    ),
  );
  fireEvent.click(information);
  expect(screen.getByDisplayValue("Bản nháp")).toBeVisible();
});

it("retires the Farm name and its breadcrumb when Tracker loses access", async () => {
  mocks.tracker.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
  view(<FarmBreadcrumbScope />);
  const breadcrumb = within(screen.getByRole("navigation", { name: "Farm breadcrumb" }));
  await breadcrumb.findByText("Nông trại Xanh");
  fireEvent.click(screen.getByRole("tab", { name: "Thông tin" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(breadcrumb.queryByText("Nông trại Xanh")).not.toBeInTheDocument();
  expect(breadcrumb.getByText("Chi tiết trang trại")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tùy chọn khác" })).not.toBeInTheDocument();
});

it("keeps Farm deletion protection and confirms deactivation as a separate action", async () => {
  mocks.removeFarm.mockRejectedValue(Object.assign(new Error("farm_in_use"), { status: 409 }));
  mocks.save.mockResolvedValue({ ...farm, is_active: false, version: 3 });
  view(<FarmDetail farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Tùy chọn khác" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Xóa trang trại" }));
  const deletion = within(screen.getByRole("dialog", { name: "Xóa trang trại" }));
  fireEvent.click(deletion.getByRole("button", { name: "Xóa trang trại" }));
  expect(await deletion.findByRole("alert")).toHaveTextContent(/thay vì xóa/);
  expect(deletion.getAllByRole("button")).toHaveLength(2);
  fireEvent.click(deletion.getByRole("button", { name: "Hủy" }));
  fireEvent.click(screen.getByRole("button", { name: "Tùy chọn khác" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Ngừng hoạt động" }));
  const deactivation = within(screen.getByRole("dialog", { name: "Ngừng hoạt động" }));
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.click(deactivation.getByRole("button", { name: "Ngừng hoạt động" })),
  );
  expect(await screen.findByText("Ngừng hoạt động")).toBeVisible();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("farm-1", { version: 2, is_active: false });
  expect(mocks.removeFarm).toHaveBeenCalledTimes(1);
  expect(mocks.disableTracker).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tùy chọn khác" }));
  expect(await screen.findByRole("menuitem", { name: "Bật hoạt động" })).toBeVisible();
});

it("opens supply through a contextual link without fetching capabilities or batches for rows", async () => {
  setRoute("/farms/farm-1?search=Hue&supply_search=rau&supply_status=all");
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmDetail farmId="farm-1" />);
  const link = await screen.findByRole("link", { name: "Rau muống" });
  expect(link).toHaveAttribute(
    "href",
    "/farms/farm-1/products/product-1?search=Hue&supply_search=rau&supply_status=all",
  );
  expect(mocks.linked).toHaveBeenCalledTimes(1);
  expect(mocks.batches).not.toHaveBeenCalled();
  expect(mocks.tracker).not.toHaveBeenCalled();
});

function fail(code: string, status: number, context?: unknown) {
  return Object.assign(new Error(code), { status, payload: { errors: [{ code, context }] } });
}

async function openAdd() {
  const add = await screen.findByRole("button", { name: "Thêm sản phẩm" });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  const dialog = within(await screen.findByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" }));
  const picker = await dialog.findByRole("combobox", { name: "Sản phẩm" });
  await waitFor(() => expect(picker).toBeEnabled());
  fireEvent.click(picker);
  fireEvent.click(await screen.findByRole("option", { name: /Rau muống/ }));
  return dialog;
}

it("uses picker units and a single Add with the first batch, then refreshes only the supply list", async () => {
  prepareInventory();
  const result = deferred<FarmProduct>();
  mocks.add.mockReturnValue(result.promise);
  view(<FarmDetail farmId={farm.id} />);
  const dialog = await openAdd();
  expect(dialog.getByText("500 g")).toBeVisible();
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "24" } });
  expect(dialog.getByText("12000 g")).toBeVisible();
  const save = dialog.getByRole("button", { name: "Thêm sản phẩm" });
  act(() => {
    save.click();
    save.click();
  });
  await waitFor(() =>
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(farm.id, "product-1", {
      start_date: "2026-10-26",
      end_date: "2026-11-01",
      quantity_units: 24,
    }),
  );
  await act(async () => result.resolve(supplying));
  await waitFor(() => expect(mocks.linked).toHaveBeenCalledTimes(2));
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.available).toHaveBeenCalledTimes(1);
  expect(mocks.source).not.toHaveBeenCalled();
  expect(mocks.productDetail).not.toHaveBeenCalled();
  expect(mocks.batches).not.toHaveBeenCalled();
});

it("keeps Add pending result protected, checks the exact pair with GET and rejects blind replay", async () => {
  prepareInventory();
  mocks.add.mockRejectedValue(fail("request_timeout", 408));
  mocks.source.mockRejectedValueOnce(fail("not_found", 404)).mockResolvedValueOnce(supplying);
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  const quantity = dialog.getByLabelText("Số lượng đơn vị bán");
  fireEvent.change(quantity, { target: { value: "3" } });
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  const verify = await dialog.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" });
  expect(quantity).toHaveValue(3);
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  fireEvent.click(verify);
  expect(await dialog.findByText(/Kết quả lần thêm trước/)).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  expect(await dialog.findByRole("link", { name: "Mở chi tiết nguồn cung" })).toHaveAttribute(
    "href",
    "/farms/farm-1/products/product-1",
  );
  expect(mocks.source).toHaveBeenCalledTimes(2);
  expect(mocks.add).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Đã thêm sản phẩm và đợt cung cấp đầu tiên.")).not.toBeInTheDocument();
});

it("loads each picker page only on intent and retains the selected Product and batch draft", async () => {
  prepareInventory();
  mocks.available.mockImplementation((_id, { page }: { page: number }) =>
    Promise.resolve({
      data: [page === 1 ? product : { ...product, id: "product-2", name_vi: "Cải ngọt" }],
      meta: { page, page_size: 30, total: 31 },
    }),
  );
  view(<FarmProducts farm={farm} />);
  expect(mocks.available).not.toHaveBeenCalled();
  const dialog = await openAdd();
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "5" } });
  fireEvent.click(dialog.getByRole("button", { name: "Sau" }));
  await waitFor(() =>
    expect(mocks.available).toHaveBeenLastCalledWith(
      farm.id,
      { page: 2, search: "" },
      expect.any(AbortSignal),
    ),
  );
  expect(dialog.getByLabelText("Số lượng đơn vị bán")).toHaveValue(5);
  expect(dialog.getByRole("combobox", { name: "Sản phẩm" })).toHaveValue("Rau muống · RAU-01");
  expect(mocks.productDetail).not.toHaveBeenCalled();
});

it("routes duplicate removed link conflicts to that source for review", async () => {
  prepareInventory();
  mocks.add.mockRejectedValue(
    fail("farm_product_removed", 409, {
      source_id: "228d9391-0df3-408a-80d6-fd28b934bf2e",
      version: 3,
    }),
  );
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "3" } });
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  expect(await dialog.findByRole("link", { name: "Mở chi tiết nguồn cung" })).toHaveAttribute(
    "href",
    "/farms/farm-1/products/product-1",
  );
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(mocks.source).not.toHaveBeenCalled();
});

it("does not fetch a separate Product and handles rejection when it stops selling", async () => {
  prepareInventory();
  mocks.add.mockRejectedValue(fail("product_inactive", 409));
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "3" } });
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  expect(await dialog.findByText(/Sản phẩm không còn Đang bán/)).toBeVisible();
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  expect(mocks.productDetail).not.toHaveBeenCalled();
});

it("removes even a discontinued Product when permitted and refreshes its history scope without loading Farm or events", async () => {
  prepareInventory();
  const prior = { ...supplying, product_status: "discontinued" as const };
  const after = { ...removedSupply, product_status: "discontinued" as const };
  mocks.source.mockResolvedValueOnce(prior).mockResolvedValueOnce(after);
  mocks.removeLink.mockResolvedValue(after);
  mocks.batches.mockImplementation((_farm, _product, { scope }) =>
    Promise.resolve(linkedResult([{ ...liveBatch, is_historical: scope === "history" }])),
  );
  view(<FarmDetail farmId={farm.id} productId="product-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Gỡ sản phẩm" }));
  const dialog = within(screen.getByRole("dialog", { name: /Gỡ Rau muống/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Gỡ sản phẩm" }));
  expect(await screen.findByText("Đã gỡ", { exact: true })).toBeVisible();
  expect(mocks.removeLink).toHaveBeenCalledExactlyOnceWith(farm.id, "product-1", prior);
  await waitFor(() => expect(mocks.batches).toHaveBeenCalledTimes(2));
  expect(mocks.batches.mock.calls.map((call) => call[2].scope)).toEqual(["current", "history"]);
  expect(screen.queryByRole("button", { name: "Sửa đợt cung cấp" })).not.toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.linked).not.toHaveBeenCalled();
  expect(mocks.history).not.toHaveBeenCalled();
});

it("shows open allocation order links and never fetches an order to determine whether Remove is allowed", async () => {
  prepareInventory();
  const order = { id: "318f0fda-8297-48da-aa0d-5597a884966b", reference_code: "ORD-24" };
  mocks.source.mockResolvedValue({
    ...supplying,
    capabilities: {
      ...supplying.capabilities,
      can_remove: false,
      blockers: {
        ...supplying.capabilities.blockers,
        remove: {
          code: "farm_product_has_open_allocations",
          context: { orders: [order], has_more: true },
        },
      },
    },
  });
  view(<FarmSourceDetail farm={farm} productId="product-1" />);
  expect(await screen.findByRole("link", { name: "ORD-24" })).toHaveAttribute(
    "href",
    "/store-orders/" + order.id,
  );
  expect(screen.getByText("Còn đơn hàng chưa hoàn tất khác.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Gỡ sản phẩm" })).not.toBeInTheDocument();
  expect(mocks.removeLink).not.toHaveBeenCalled();
});

it("refreshes a late Remove blocker and never repeats the mutation after capabilities change", async () => {
  prepareInventory();
  const blocker = {
    code: "farm_product_supply_shortfall",
    context: { required_units: 10, remaining_units: 6, shortfall_units: 4 },
  };
  mocks.source.mockResolvedValueOnce(supplying).mockResolvedValueOnce({
    ...supplying,
    capabilities: { ...supplying.capabilities, can_remove: false, blockers: { remove: blocker } },
  });
  mocks.removeLink.mockRejectedValue(fail(blocker.code, 409, blocker.context));
  view(<FarmSourceDetail farm={farm} productId="product-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Gỡ sản phẩm" }));
  const dialog = within(screen.getByRole("dialog", { name: /Gỡ Rau muống/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Gỡ sản phẩm" }));
  expect(await dialog.findByText(/Cần thêm 4 đơn vị/)).toBeVisible();
  expect(dialog.getByRole("button", { name: "Gỡ sản phẩm" })).toBeDisabled();
  fireEvent.click(await dialog.findByRole("button", { name: "Đóng và xem lại" }));
  expect(screen.queryByRole("button", { name: "Gỡ sản phẩm" })).not.toBeInTheDocument();
  expect(mocks.removeLink).toHaveBeenCalledTimes(1);
  expect(mocks.source).toHaveBeenCalledTimes(2);
});

it("keeps Remove locked through failed and old GETs, then reads removed state without a success toast", async () => {
  prepareInventory();
  mocks.source
    .mockResolvedValueOnce(supplying)
    .mockRejectedValueOnce(fail("network_error", 503))
    .mockResolvedValueOnce(supplying)
    .mockResolvedValueOnce(removedSupply);
  mocks.removeLink.mockRejectedValue(fail("invalid_response", 200));
  view(<FarmSourceDetail farm={farm} productId="product-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Gỡ sản phẩm" }));
  const dialog = within(screen.getByRole("dialog", { name: /Gỡ Rau muống/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Gỡ sản phẩm" }));
  const verify = await dialog.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" });
  fireEvent.click(verify);
  expect(await dialog.findByText(/Chưa đủ dữ liệu/)).toBeVisible();
  expect(dialog.getByRole("button", { name: "Gỡ sản phẩm" })).toBeDisabled();
  fireEvent.click(dialog.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  expect(await dialog.findByText(/Chưa đủ dữ liệu/)).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Hủy" }));
  expect(await screen.findByRole("button", { name: "Gỡ sản phẩm" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  expect(await screen.findByText(/Dữ liệu hiện tại khớp/)).toBeVisible();
  expect(mocks.removeLink).toHaveBeenCalledTimes(1);
  expect(mocks.source).toHaveBeenCalledTimes(4);
  expect(screen.queryByText("Đã gỡ sản phẩm khỏi trang trại.")).not.toBeInTheDocument();
});

it("re-adds the same source with a fresh batch and keeps old batches read-only", async () => {
  prepareInventory();
  const renewed = { ...supplying, version: 4, supply_generation: 2 };
  mocks.source.mockResolvedValueOnce(removedSupply).mockResolvedValueOnce(renewed);
  mocks.readd.mockResolvedValue({ ...renewed, first_batch_id: "batch-new" });
  mocks.batches.mockImplementation((_farm, _product, { scope }) =>
    Promise.resolve(
      linkedResult(
        scope === "history"
          ? [{ ...liveBatch, is_historical: true, remaining_quantity: 7, available_quantity: 0 }]
          : [{ ...liveBatch, id: "batch-new", supply_generation: 2 }],
      ),
    ),
  );
  view(<FarmSourceDetail farm={farm} productId="product-1" />);
  expect(await screen.findByText("Thuộc lịch sử")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Sửa đợt cung cấp" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thêm lại sản phẩm" }));
  const dialog = within(screen.getByRole("dialog", { name: "Thêm lại sản phẩm" }));
  const submit = dialog.getByRole("button", { name: "Thêm lại sản phẩm" });
  fireEvent.click(submit);
  expect(mocks.readd).not.toHaveBeenCalled();
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "2" } });
  fireEvent.click(submit);
  await waitFor(() =>
    expect(mocks.readd).toHaveBeenCalledExactlyOnceWith(farm.id, "product-1", removedSupply, {
      start_date: "2026-10-26",
      end_date: "2026-11-01",
      quantity_units: 2,
    }),
  );
  expect(await screen.findByRole("button", { name: "Sửa đợt cung cấp" })).toBeVisible();
  expect(mocks.batches.mock.calls.map((call) => call[2].scope)).toEqual(["history", "current"]);
});

it("loads lifecycle events by page on intent and distinguishes system classification from removal", async () => {
  mocks.history.mockImplementation((_farm, _product, { page }) =>
    Promise.resolve(
      linkedResult(
        page === 1
          ? [
              {
                id: "event-1",
                action: "farm.product.lifecycle_backfill",
                actor: null,
                created_at: "2026-10-25T00:00:00Z",
                context: {
                  provenance: "legacy_disabled_link",
                  classified_at: "2026-10-25T03:00:00Z",
                },
              },
            ]
          : [
              {
                id: "event-2",
                action: "farm.product.update",
                actor: { name: "Admin Mai" },
                created_at: "2026-10-25T00:00:00Z",
                context: {},
              },
            ],
        page,
        21,
      ),
    ),
  );
  view(<FarmSourceDetail farm={farm} productId="product-1" />);
  const open = await screen.findByRole("button", { name: "Lịch sử nguồn cung" });
  expect(mocks.history).not.toHaveBeenCalled();
  fireEvent.click(open);
  expect(await screen.findByText(/khi hệ thống cập nhật dữ liệu/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sau" }));
  expect(await screen.findByText("Admin Mai")).toBeVisible();
  expect(screen.getByText("Cập nhật liên kết (dữ liệu cũ)")).toBeVisible();
  expect(mocks.history.mock.calls.map((call) => call[2].page)).toEqual([1, 2]);
  expect(mocks.batches).toHaveBeenCalledTimes(1);
});

it("retires the verified source and its actions when a linked read loses access", async () => {
  mocks.history.mockRejectedValue(fail("forbidden", 403));
  view(<FarmDetail farmId={farm.id} productId="product-1" />);
  expect(await screen.findByRole("heading", { name: "Rau muống" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Lịch sử nguồn cung" }));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Rau muống" })).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: "Gỡ sản phẩm" })).not.toBeInTheDocument();
});

it("keeps a source write that lost its route locked on return until an explicit GET reviews it", async () => {
  prepareInventory();
  const pending = deferred<FarmProduct>();
  mocks.removeLink.mockReturnValue(pending.promise);
  mocks.source
    .mockResolvedValueOnce(supplying)
    .mockResolvedValueOnce(supplying)
    .mockResolvedValueOnce(removedSupply);
  const scope = (id?: string) => (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider>
          {id ? <FarmSourceDetail farm={farm} productId={id} /> : <p>Other route</p>}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
  const rendered = render(scope("product-1"));
  fireEvent.click(await screen.findByRole("button", { name: "Gỡ sản phẩm" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ sản phẩm" }));
  await waitFor(() => expect(mocks.removeLink).toHaveBeenCalledTimes(1));
  rendered.rerender(scope());
  // The transport rejects after the first source route has unmounted.
  // Use a controllable rejection without remounting the session provider.
  await act(async () => pending.reject(fail("request_timeout", 408)));
  rendered.rerender(scope("product-1"));
  const remove = await screen.findByRole("button", { name: "Gỡ sản phẩm" });
  expect(remove).toBeDisabled();
  fireEvent.click(await screen.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  expect(await screen.findByText(/Dữ liệu hiện tại khớp/)).toBeVisible();
  expect(mocks.removeLink).toHaveBeenCalledTimes(1);
});

it("requires checking a pending Add after leaving and returning to the supply route", async () => {
  prepareInventory();
  const pending = deferred<FarmProduct>();
  mocks.add.mockReturnValue(pending.promise);
  const scope = (opened: boolean) => (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider>
          {opened ? <FarmProducts farm={farm} /> : <p>Other route</p>}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
  const rendered = render(scope(true));
  const dialog = await openAdd();
  fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "9" } });
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
  rendered.rerender(scope(false));
  await act(async () => pending.reject(fail("request_timeout", 408)));
  rendered.rerender(scope(true));
  fireEvent.click(await screen.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  const open = await screen.findByRole("link", { name: "Mở chi tiết nguồn cung" });
  expect(open).toHaveAttribute("href", "/farms/farm-1/products/product-1");
  expect(mocks.source).toHaveBeenCalledTimes(1);
  expect(mocks.add).toHaveBeenCalledTimes(1);
});

it("keeps Farm query context while changing supply filters, and reuses no per-row detail", async () => {
  setRoute("/farms/farm-1?search=Hue&page=2");
  mocks.linked.mockImplementation((_farm, { supplyStatus, page }) =>
    Promise.resolve(linkedResult(supplyStatus === "removed" ? [removedSupply] : [supplying], page)),
  );
  view(<FarmProducts farm={farm} />);
  expect(await screen.findByRole("link", { name: "Rau muống" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
  fireEvent.click(await screen.findByRole("combobox", { name: "Trạng thái nguồn cung" }));
  fireEvent.click(await screen.findByRole("option", { name: "Đã gỡ" }));
  expect(await screen.findByRole("link", { name: "Rau muống" })).toHaveAttribute(
    "href",
    "/farms/farm-1/products/product-1?search=Hue&page=2&supply_status=removed",
  );
  expect(mocks.linked.mock.calls.map((call) => call[1].supplyStatus)).toEqual([
    "supplying",
    "removed",
  ]);
  expect(mocks.source).not.toHaveBeenCalled();
  expect(mocks.batches).not.toHaveBeenCalled();
});

it("keeps date status separate from history and protects old batches in all scopes", async () => {
  prepareInventory();
  const former = { ...liveBatch, id: "batch-old", is_historical: true, available_quantity: 0 };
  const current = { ...liveBatch, id: "batch-new", supply_generation: 2 };
  mocks.source.mockResolvedValue({ ...supplying, supply_generation: 2, version: 4 });
  mocks.batches.mockImplementation((_farm, _product, { scope }) =>
    Promise.resolve(
      linkedResult(
        scope === "all" ? [former, current] : scope === "history" ? [former] : [current],
      ),
    ),
  );
  view(<FarmSourceDetail farm={farm} productId="product-1" />);
  expect(await screen.findByRole("button", { name: "Sửa đợt cung cấp" })).toBeVisible();
  const filter = screen.getByRole("combobox", { name: "Phạm vi đợt cung cấp" });
  fireEvent.click(filter);
  fireEvent.click(await screen.findByRole("option", { name: "Đợt lịch sử" }));
  expect(await screen.findByText("Thuộc lịch sử")).toBeVisible();
  expect(screen.getByText("Theo ngày: Đang hiệu lực")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Sửa đợt cung cấp" })).not.toBeInTheDocument();
  fireEvent.click(filter);
  fireEvent.click(await screen.findByRole("option", { name: "Tất cả đợt" }));
  expect(await screen.findByRole("button", { name: "Sửa đợt cung cấp" })).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Sửa đợt cung cấp" })).toHaveLength(1);
  expect(mocks.batches.mock.calls.map((call) => call[2].scope)).toEqual([
    "current",
    "history",
    "all",
  ]);
});

it.each(["edit", "cancel"] as const)(
  "lets an uncertain batch %s be reviewed on another page without replaying the write",
  async (action) => {
    prepareInventory();
    let changed = false;
    const other = { ...liveBatch, id: "another-batch", version: 2 };
    const updated: FarmStockBatch =
      action === "edit"
        ? { ...liveBatch, quantity_units: 8, remaining_quantity: 8, version: 2 }
        : { ...liveBatch, status: "cancelled", available_quantity: 0, version: 2 };
    mocks.batches.mockImplementation((_farm, _product, { page, status }) =>
      Promise.resolve(
        linkedResult(
          !changed
            ? [liveBatch]
            : page === 2 && (action === "edit" || status === "cancelled")
              ? [updated]
              : [other],
          page,
          21,
        ),
      ),
    );
    const mutation = action === "edit" ? mocks.updateBatch : mocks.cancelBatch;
    mutation.mockImplementation(async () => {
      changed = true;
      throw fail("request_timeout", 408);
    });

    view(<FarmSourceDetail farm={farm} productId="product-1" />);
    const trigger = action === "edit" ? "Sửa đợt cung cấp" : "Hủy đợt cung cấp";
    fireEvent.click(await screen.findByRole("button", { name: trigger }));
    const dialog = within(screen.getByRole("dialog", { name: trigger }));
    if (action === "edit") {
      fireEvent.change(dialog.getByLabelText("Số lượng đơn vị bán"), { target: { value: "8" } });
    }
    fireEvent.click(
      dialog.getByRole("button", { name: action === "edit" ? "Lưu thay đổi" : trigger }),
    );
    fireEvent.click(await dialog.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
    expect(await dialog.findByText(/Trang đợt cung cấp hiện tại/)).toBeVisible();
    fireEvent.click(dialog.getByRole("button", { name: "Hủy" }));

    expect(screen.getByRole("button", { name: "Thêm đợt cung cấp" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gỡ sản phẩm" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử nguồn cung" }));
    await waitFor(() => expect(mocks.history).toHaveBeenCalledOnce());
    const scope = screen.getByRole("combobox", { name: "Phạm vi đợt cung cấp" });
    expect(scope).toBeEnabled();
    if (action === "cancel") {
      const status = screen.getByRole("combobox", { name: "Trạng thái đợt cung cấp" });
      expect(status).toBeEnabled();
      fireEvent.click(status);
      fireEvent.click(await screen.findByRole("option", { name: "Đã hủy" }));
    }
    const next = await screen.findByRole("button", { name: "Sau" });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);
    await waitFor(() =>
      expect(mocks.batches).toHaveBeenLastCalledWith(
        farm.id,
        "product-1",
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Đợt cần đối chiếu")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thêm đợt cung cấp" })).toBeDisabled();
    const readsBeforeReview = mocks.batches.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
    expect(await screen.findByText(/Dữ liệu hiện tại khớp/)).toBeVisible();
    expect(mocks.batches).toHaveBeenCalledTimes(readsBeforeReview);
    fireEvent.click(screen.getByRole("button", { name: "Đóng và xem lại" }));
    expect(screen.getByRole("button", { name: "Thêm đợt cung cấp" })).toBeEnabled();
    expect(mutation).toHaveBeenCalledTimes(1);
  },
);

it("retains uncertain batch intent across routes and treats older snapshots as inconclusive until a new generation is verified", async () => {
  prepareInventory();
  const pending = deferred<FarmStockBatch>();
  mocks.cancelBatch.mockReturnValue(pending.promise);
  const route = (opened: boolean) => (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider>
          {opened ? <FarmSourceDetail farm={farm} productId="product-1" /> : <p>Other route</p>}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
  const rendered = render(route(true));
  fireEvent.click(await screen.findByRole("button", { name: "Hủy đợt cung cấp" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy đợt cung cấp" }),
  );
  await waitFor(() => expect(mocks.cancelBatch).toHaveBeenCalledTimes(1));
  rendered.rerender(route(false));
  await act(async () => pending.reject(fail("request_timeout", 408)));
  rendered.rerender(route(true));

  await waitFor(() => expect(mocks.batches).toHaveBeenCalledTimes(2));
  mocks.batches.mockRejectedValueOnce(fail("network_error", 503));
  fireEvent.click(await screen.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  expect(await screen.findByText(/Chưa đủ dữ liệu/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Thêm đợt cung cấp" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  await waitFor(() => expect(mocks.batches).toHaveBeenCalledTimes(4));
  expect(await screen.findByText(/Chưa đủ dữ liệu/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Thêm đợt cung cấp" })).toBeDisabled();

  mocks.source.mockResolvedValueOnce({ ...supplying, version: 4, supply_generation: 2 });
  mocks.batches.mockResolvedValue(linkedResult([]));
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  expect(await screen.findByText(/Dữ liệu đã thay đổi/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Thêm đợt cung cấp" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Đóng và xem lại" }));
  expect(screen.getByRole("button", { name: "Thêm đợt cung cấp" })).toBeEnabled();
  expect(mocks.cancelBatch).toHaveBeenCalledTimes(1);
});
