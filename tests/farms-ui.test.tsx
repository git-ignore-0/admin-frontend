import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect, useSyncExternalStore } from "react";
import { deferred } from "@/tests/deferred";

import { FarmList } from "@/components/farm-list";
import { FarmEditor } from "@/components/farm-editor";
import { FarmProducts } from "@/components/farm-products";
import { FarmSourceDetail } from "@/components/farm-source-detail";
import { FarmStockBatches } from "@/components/farm-stock-batches";
import { FarmDetail } from "@/components/farm-detail";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ToastProvider } from "@/components/toast-provider";
import { invalidateFarmDetail } from "@/lib/farm-detail-snapshot";
import {
  farmAccess,
  farmBulkWriteKey,
  farmDetailKey,
  farmListKey,
  farmProductLinkWriteKey,
  farmSupplyKey,
} from "@/lib/farm-query";
import { farmBatchQuery } from "@/lib/farm-supply-query";
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
  recoverAdd: vi.fn(),
  source: vi.fn(),
  history: vi.fn(),
  readd: vi.fn(),
  removeLink: vi.fn(),
  bulkRemove: vi.fn(),
  recoverBulkRemove: vi.fn(),
  batches: vi.fn(),
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
  farmerLink: vi.fn(),
}));
// The independent link section has its own tests; provide its confirmed read here.
vi.mock("@/lib/farm-supply-request-api", () => ({
  farmerLink: mocks.farmerLink,
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
  linkFarmProducts: mocks.add,
  recoverFarmProductLinking: mocks.recoverAdd,
  getFarmProduct: mocks.source,
  listFarmProductHistory: mocks.history,
  readdFarmProduct: mocks.readd,
  removeFarmProduct: mocks.removeLink,
  removeFarmProductsBulk: mocks.bulkRemove,
  recoverFarmProductBulkRemove: mocks.recoverBulkRemove,
  listFarmStockBatches: mocks.batches,
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
  contact_phone: "",
  description_vi: "Rau sạch",
  description_en: "Organic greens",
  image: null,
  photos: [],
  is_active: true,
  in_stock_product_count: 8,
  out_of_stock_product_count: 4,
  capabilities: { delete: { allowed: true, reasons: [] } },
  version: 2,
  created_at: "2026-01-01",
  updated_at: "2026-10-15",
} as Farm;
const supplyingDeleteReason = {
  code: "supplying_product" as const,
  id: "22222222-2222-4222-8222-222222222222",
  label: "RAU-01",
  name_vi: "Rau muống",
  name_en: "Water spinach",
};
const orderDeleteReason = {
  code: "store_order" as const,
  id: "33333333-3333-4333-8333-333333333333",
  label: "NFV-000123",
};
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
const unlinkedProduct = { ...product, link_state: "unlinked" as const, removed_source: null };
const removedPickerProduct = {
  ...product,
  id: "product-2",
  sku: "RAU-02",
  name_vi: "Cải ngọt",
  name_en: "Choy sum",
  link_state: "removed" as const,
  removed_source: { id: "source-2", version: 4, supply_generation: 2 },
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
function CaptureQueryClient({ capture }: { capture: (client: QueryClient) => void }) {
  const client = useQueryClient();
  useEffect(() => capture(client), [capture, client]);
  return null;
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
  return {
    ...rendered,
    change: (next: React.ReactNode) => rendered.rerender(shell(next)),
    close: () => rendered.rerender(shell(null)),
  };
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
  mocks.farmerLink.mockImplementation(async (farmId: string) => ({
    farm_id: farmId,
    url: `/farmer#token=${"A".repeat(43)}`,
  }));
  search = new URLSearchParams();
  mocks.push.mockImplementation(setRoute);
  mocks.replace.mockImplementation(setRoute);
  mocks.list.mockResolvedValue({ data: [farm], meta: { page: 1, page_size: 20, total: 1 } });
  mocks.get.mockResolvedValue(farm);
  mocks.linked.mockResolvedValue(linkedResult([]));
  mocks.source.mockResolvedValue(supplying);
  mocks.history.mockResolvedValue(linkedResult([]));
  mocks.available.mockResolvedValue({
    data: [unlinkedProduct],
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
  const filtered = deferred<ReturnType<typeof linkedResult<Farm>>>();
  mocks.list.mockResolvedValueOnce(linkedResult([farm], 1, 21));
  mocks.list.mockReturnValueOnce(filtered.promise);
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
  expect(screen.queryByRole("link", { name: "Nông trại Xanh" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toBeInTheDocument();
  await act(async () =>
    filtered.resolve(linkedResult([{ ...farm, name_vi: "Trang trại Đà Lạt" }])),
  );
  expect(await screen.findByRole("link", { name: "Trang trại Đà Lạt" })).toBeVisible();
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

const farmMenu = () => screen.findByRole("button", { name: "Tùy chọn khác" });

async function openFarmAction(action = "Xóa trang trại") {
  const trigger = await farmMenu();
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("menuitem", { name: action }));
  return screen.findByRole("dialog", { name: action });
}

it("opens newly created Farm details with one canonical capability read", async () => {
  setRoute("/farms/new?search=Hue&page=2");
  mocks.save.mockResolvedValue({ ...farm, capabilities: undefined });
  const rendered = view(<FarmEditor />);
  fireEvent.change(screen.getByLabelText("Tên trang trại *"), { target: { value: farm.name_vi } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: farm.location_vi } });
  fireEvent.click(screen.getByRole("tab", { name: /English/ }));
  fireEvent.change(screen.getByLabelText("Tên trang trại *"), { target: { value: farm.name_en } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: farm.location_en } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo trang trại" }));
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/farms/farm-1?search=Hue&page=2"),
  );
  expect(mocks.get).not.toHaveBeenCalled();
  rendered.change(<FarmDetail farmId={farm.id} />);
  expect(within(await openFarmAction()).getByRole("button", { name: "Xóa" })).toBeEnabled();
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(farm.id, expect.any(AbortSignal));
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
  const header = within(screen.getByRole("banner"));
  const menu = await farmMenu();
  expect(header.getAllByRole("button")).toEqual([menu]);
  menu.focus();
  const dialog = within(await openFarmAction());
  expect(dialog.getAllByRole("button")).toEqual([
    dialog.getByRole("button", { name: "Hủy" }),
    dialog.getByRole("button", { name: "Xóa" }),
  ]);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  fireEvent.click(dialog.getByRole("button", { name: "Hủy" }));
  await waitFor(() => expect(menu).toHaveFocus());
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

it("opens the shared supply flow from an eligible source without opening a separate stock form", async () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  setRoute("/farms/farm-1/products/" + productId + "?search=Hue&supply_status=all");
  mocks.source.mockResolvedValue({ ...supplying, product_id: productId });
  view(<FarmSourceDetail farm={farm} productId={productId} />);
  const addSupply = await screen.findByRole("link", { name: "Bổ sung nguồn cung" });
  expect(addSupply).toHaveAttribute(
    "href",
    `/farms/farm-1/stock-batches/new?search=Hue&supply_status=all&supply_product=${productId}`,
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
  const next = deferred<ReturnType<typeof linkedResult<FarmProduct>>>();
  mocks.linked.mockResolvedValueOnce(linkedResult([linkedProduct], 1, 21));
  mocks.linked.mockReturnValueOnce(next.promise);
  view(<FarmProducts farm={farm} />);
  expect(await screen.findByText("RAU-01")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sau" }));
  expect(screen.queryByText("RAU-01")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toBeInTheDocument();
  await act(async () => next.resolve(linkedResult([second], 2, 21)));
  expect(await screen.findByText("RAU-02")).toBeVisible();
  expect(mocks.linked).toHaveBeenCalledWith(
    "farm-1",
    { page: 2, search: "", supplyStatus: "supplying" },
    expect.any(AbortSignal),
  );
});

it("keeps a verified Farm product page on refresh timeout and locks Add until retry succeeds", async () => {
  const first = linkedResult([linkedProduct], 1, 21);
  const failed = deferred<typeof first>();
  const retry = deferred<typeof first>();
  mocks.linked
    .mockResolvedValueOnce(first)
    .mockReturnValueOnce(failed.promise)
    .mockReturnValueOnce(retry.promise);
  view(<FarmProducts farm={farm} />, "en");
  const link = await screen.findByRole("link", { name: "Water spinach" });
  expect(screen.getByText("21 results")).toBeVisible();
  const add = screen.getByRole("button", { name: "Add products" });
  const next = screen.getByRole("button", { name: "Next" });
  const refresh = screen.getByRole("button", { name: "Refresh supply list" });
  expect(add).toBeEnabled();
  fireEvent.click(refresh);
  await waitFor(() => expect(next).toBeDisabled());
  expect(link).toBeVisible();
  expect(refresh).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  await act(async () => failed.reject(fail("request_timeout", 408)));
  const alert = await screen.findByRole("alert");
  expect(link).toBeVisible();
  expect(screen.getByText("21 results")).toBeVisible();
  expect(add).toBeDisabled();
  fireEvent.click(add);
  expect(mocks.available).not.toHaveBeenCalled();
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  expect(link).toBeVisible();
  expect(add).toBeDisabled();
  await waitFor(() => expect(refresh).toHaveAttribute("aria-busy", "true"));
  await act(async () =>
    retry.resolve(linkedResult([{ ...linkedProduct, name_en: "Verified product" }], 1, 22)),
  );
  expect(await screen.findByRole("link", { name: "Verified product" })).toBeVisible();
  expect(screen.getByText("22 results")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(add).toBeEnabled();
});

it.each(["directory", "products"] as const)(
  "shows a scoped initial error and ignores a retired Farm %s response",
  async (kind) => {
    const products = kind === "products";
    const read = products ? mocks.linked : mocks.list;
    const row = products ? linkedProduct : farm;
    const initial = deferred<ReturnType<typeof linkedResult<FarmProduct | Farm>>>();
    const stale = deferred<ReturnType<typeof linkedResult<FarmProduct | Farm>>>();
    read
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(linkedResult([row], 1, 21))
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(linkedResult([{ ...row, name_en: "Current session" }]));
    const shell = (session: string) => (
      <AdminQueryProvider key={session}>
        {products ? <FarmProducts farm={farm} /> : <FarmList />}
      </AdminQueryProvider>
    );
    const page = view(shell("retiring"), "en");
    const loadingTable = screen.getByRole("table", { hidden: true });
    const viewport = loadingTable.closest<HTMLElement>("[aria-hidden=true]");
    expect(viewport).not.toHaveAttribute("tabindex");
    expect(loadingTable.querySelectorAll("thead th")).toHaveLength(products ? 4 : 3);
    expect(loadingTable.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(loadingTable.querySelector("button, a, input, select, [tabindex]")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await act(async () => initial.reject(new Error("network_error")));
    const error = await screen.findByRole("alert");
    expect(screen.queryByRole("table", { hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByText("21 results")).not.toBeInTheDocument();
    fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: row.name_en })).toBeVisible();
    const loadedViewport = screen.getByRole("table").closest<HTMLElement>("[role=region]");
    expect(loadedViewport?.style.getPropertyValue("--table-min-width")).toBe(
      viewport?.style.getPropertyValue("--table-min-width"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: products ? "Refresh supply list" : "Refresh list" }),
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    const signal = read.mock.calls[2]?.at(-1) as AbortSignal;
    page.change(shell("current"));
    expect(await screen.findByRole("link", { name: "Current session" })).toBeVisible();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      stale.resolve(linkedResult([{ ...row, name_en: "Retired session response" }])),
    );
    expect(screen.queryByRole("link", { name: row.name_en })).not.toBeInTheDocument();
    expect(screen.queryByText("Retired session response")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Current session" })).toBeVisible();
  },
);

it("withdraws Farm product data and actions after access is denied", async () => {
  const onAccessLost = vi.fn();
  const denial = fail("forbidden", 403);
  mocks.linked
    .mockResolvedValueOnce(linkedResult([linkedProduct], 1, 21))
    .mockRejectedValueOnce(denial);
  view(<FarmProducts farm={farm} onAccessLost={onAccessLost} />, "en");
  expect(await screen.findByRole("link", { name: linkedProduct.name_en })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Refresh supply list" }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledWith(denial));
  expect(screen.queryByRole("link", { name: linkedProduct.name_en })).not.toBeInTheDocument();
  expect(screen.queryByText("21 results")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add products" })).not.toBeInTheDocument();
});

it("keeps stock batches read-only after a transient refresh error until revalidation succeeds", async () => {
  const filter = { scope: "current", page: 1 } as const;
  const query = farmBatchQuery(linkedProduct, filter);
  const onEdit = vi.fn();
  const onCancel = vi.fn();
  const first = linkedResult([liveBatch], 1, 21);
  const retry = deferred<typeof first>();
  mocks.batches
    .mockResolvedValueOnce(first)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockReturnValueOnce(retry.promise);
  let client!: QueryClient;
  view(
    <>
      <CaptureQueryClient
        capture={(value) => {
          client = value;
        }}
      />
      <FarmStockBatches
        source={linkedProduct}
        filter={filter}
        locked={false}
        onEdit={onEdit}
        onCancel={onCancel}
        onFilterChange={vi.fn()}
      />
    </>,
    "en",
  );
  const edit = await screen.findByRole("button", { name: "Edit supply batch" });
  const cancel = screen.getByRole("button", { name: "Cancel supply batch" });
  expect(edit).toBeEnabled();
  expect(cancel).toBeEnabled();
  await act(async () => client.invalidateQueries({ queryKey: query.queryKey }));

  const alert = await screen.findByRole("alert");
  expect(screen.getByRole("table", { name: "Supply batches" })).toBeVisible();
  expect(screen.getByText("21 results")).toBeVisible();
  expect(edit).toBeDisabled();
  expect(cancel).toBeDisabled();
  fireEvent.click(edit);
  fireEvent.click(cancel);
  expect(onEdit).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  expect(edit).toBeDisabled();
  await act(async () => retry.resolve(first));
  await waitFor(() => expect(edit).toBeEnabled());
  expect(cancel).toBeEnabled();
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
      { page: 3, search: "rau", supplyStatus: "supplying" },
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
      { page: 3, search: "", supplyStatus: "supplying" },
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

it("reads fresh Delete blockers on 409 and confirms deactivation as a separate action", async () => {
  const blocked = {
    ...farm,
    capabilities: { delete: { allowed: false, reasons: [orderDeleteReason] } },
  };
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(blocked);
  mocks.tracker
    .mockResolvedValueOnce(trackerProfile)
    .mockResolvedValueOnce({ ...trackerProfile, version: 3 });
  mocks.removeFarm.mockRejectedValue(Object.assign(new Error("farm_in_use"), { status: 409 }));
  mocks.save.mockResolvedValue({ ...blocked, is_active: false, version: 3 });
  setRoute("/farms/farm-1?tab=information&search=Hue&supply_status=all");
  view(<FarmDetail farmId="farm-1" />);
  fireEvent.change(await screen.findByDisplayValue(farm.name_vi), {
    target: { value: "Bản nháp" },
  });
  const modal = await openFarmAction();
  const deletion = within(modal);
  act(() => {
    const confirm = deletion.getByRole("button", { name: "Xóa" });
    confirm.click();
    confirm.click();
  });
  expect(await deletion.findByRole("link", { name: "NFV-000123" })).toHaveAttribute(
    "href",
    `/store-orders/${orderDeleteReason.id}`,
  );
  expect(screen.getByRole("dialog", { name: "Xóa trang trại" })).toBe(modal);
  expect(deletion.getAllByRole("button")).toEqual([deletion.getByRole("button", { name: "Đóng" })]);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  fireEvent.click(deletion.getByRole("button", { name: "Đóng" }));
  expect(screen.getByDisplayValue("Bản nháp")).toBeVisible();
  expect(screen.getByRole("tab", { name: "Thông tin" })).toHaveAttribute("aria-selected", "true");
  const deactivation = within(await openFarmAction("Ngừng hoạt động"));
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
  fireEvent.click(await farmMenu());
  expect(await screen.findByRole("menuitem", { name: "Bật hoạt động" })).toBeEnabled();
  expect(screen.getByDisplayValue("Bản nháp")).toBeVisible();
});

it("discloses only representative source, order, and archived supply links and preserves Farm context", async () => {
  const archive = {
    ...supplyingDeleteReason,
    code: "legacy_supply" as const,
    name_vi: "Rau archive",
  };
  mocks.get.mockResolvedValue({
    ...farm,
    capabilities: {
      delete: { allowed: false, reasons: [supplyingDeleteReason, orderDeleteReason, archive] },
    },
  });
  setRoute("/farms/farm-1?search=Hue&page=2&supply_status=all");
  view(<FarmDetail farmId={farm.id} />);
  const trigger = await farmMenu();
  expect(
    screen.queryByText("Không thể xóa trang trại vì còn dữ liệu liên quan."),
  ).not.toBeInTheDocument();
  const dialog = within(await openFarmAction());
  expect(dialog.getByText("Không thể xóa trang trại vì còn dữ liệu liên quan.")).toBeVisible();
  for (const name of ["Rau muống", "Rau archive"]) {
    expect(dialog.getByRole("link", { name })).toHaveAttribute(
      "href",
      `/farms/${farm.id}/products/${supplyingDeleteReason.id}?search=Hue&page=2&supply_status=all`,
    );
  }
  expect(dialog.getByRole("link", { name: "NFV-000123" })).toBeVisible();
  expect(within(dialog.getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
  expect(dialog.queryByText(/Growth Tracker/)).not.toBeInTheDocument();
  const close = dialog.getByRole("button", { name: "Đóng" });
  expect(dialog.getAllByRole("button")).toEqual([close]);
  fireEvent.click(close);
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.removeFarm).not.toHaveBeenCalled();
  expect(mocks.source).not.toHaveBeenCalled();
});

it.each([undefined, { delete: { allowed: true, reasons: [orderDeleteReason] } }])(
  "verifies absent or malformed capabilities before allowing Delete (%j)",
  async (capabilities) => {
    mocks.get.mockResolvedValueOnce({ ...farm, capabilities }).mockResolvedValueOnce(farm);
    view(<FarmDetail farmId={farm.id} />);
    const dialog = within(await openFarmAction());
    expect(dialog.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Đóng" })).toBeEnabled();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    fireEvent.click(dialog.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
    expect(await dialog.findByRole("button", { name: "Xóa" })).toBeEnabled();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.removeFarm).not.toHaveBeenCalled();
  },
);

it("keeps confirmation unavailable after a protected conflict when an immediate GET still reports the old capability", async () => {
  mocks.removeFarm.mockRejectedValue(fail("farm_delete_protected", 409));
  view(<FarmDetail farmId={farm.id} />);
  const dialog = within(await openFarmAction());
  fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  expect(dialog.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" })),
  );
  expect(mocks.get).toHaveBeenCalledTimes(3);
  expect(dialog.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  expect(mocks.removeFarm).toHaveBeenCalledTimes(1);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("requires a new explicit Delete after the request times out away from the Farm route", async () => {
  const pending = deferred<void>();
  mocks.removeFarm.mockReturnValueOnce(pending.promise);
  const page = view(<FarmDetail farmId={farm.id} />);
  fireEvent.click(within(await openFarmAction()).getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.removeFarm).toHaveBeenCalledTimes(1));
  page.change(<p>Other route</p>);
  page.change(<FarmDetail farmId={farm.id} />);
  expect(await farmMenu()).toBeDisabled();
  page.change(<p>Other route</p>);
  await act(async () => pending.reject(fail("request_timeout", 408)));
  page.change(<FarmDetail farmId={farm.id} />);
  expect(await farmMenu()).toBeDisabled();
  fireEvent.click(await screen.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  fireEvent.click(await screen.findByRole("button", { name: "Xem lại thao tác xóa" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Xóa trang trại" }));
  expect(dialog.getByText(/lần xóa trước chưa được xác nhận/)).toBeVisible();
  expect(mocks.removeFarm).toHaveBeenCalledTimes(1);
  mocks.removeFarm.mockResolvedValueOnce(undefined);
  fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.removeFarm).toHaveBeenCalledTimes(2));
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/farms");
});

it("keeps the earlier timeout unresolved when a new Delete is definitely rejected", async () => {
  mocks.removeFarm
    .mockRejectedValueOnce(fail("request_timeout", 408))
    .mockRejectedValueOnce(fail("farm_in_use", 409, { reasons: [orderDeleteReason] }));
  mocks.get
    .mockResolvedValueOnce(farm)
    .mockResolvedValueOnce(farm)
    .mockResolvedValueOnce({
      ...farm,
      capabilities: { delete: { allowed: false, reasons: [orderDeleteReason] } },
    });
  view(<FarmDetail farmId={farm.id} />);
  const dialog = within(await openFarmAction());
  fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  fireEvent.click(await dialog.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  fireEvent.click(await dialog.findByRole("button", { name: "Xóa" }));
  expect(await dialog.findByRole("link", { name: orderDeleteReason.label })).toBeVisible();
  expect(dialog.getByText(/lần xóa trước chưa được xác nhận/)).toBeVisible();
  expect(dialog.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  expect(await farmMenu()).toBeDisabled();
  expect(mocks.removeFarm).toHaveBeenCalledTimes(2);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("accepts current allowed capability after a definite source-change rejection", async () => {
  mocks.removeFarm.mockRejectedValueOnce(fail("farm_product_changed", 409));
  view(<FarmDetail farmId={farm.id} />);
  const modal = await openFarmAction();
  const dialog = within(modal);
  fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  expect(await dialog.findByRole("button", { name: "Xóa" })).toBeEnabled();
  expect(screen.getByRole("dialog", { name: "Xóa trang trại" })).toBe(modal);
  expect(mocks.removeFarm).toHaveBeenCalledTimes(1);
});

it("rechecks a same-version supply blocker after a late Farm toggle before enabling Delete", async () => {
  const pending = deferred<Farm>();
  const verification = deferred<Farm>();
  let client!: QueryClient;
  const toggled = { ...farm, version: farm.version + 1, is_active: false };
  const blocked = {
    ...toggled,
    capabilities: { delete: { allowed: false, reasons: [orderDeleteReason] } },
  };
  mocks.save.mockReturnValueOnce(pending.promise);
  mocks.get
    .mockResolvedValueOnce(farm)
    .mockResolvedValueOnce(blocked)
    .mockReturnValueOnce(verification.promise);
  view(
    <>
      <CaptureQueryClient
        capture={(value) => {
          client = value;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  const dialog = within(await openFarmAction("Ngừng hoạt động"));
  fireEvent.click(dialog.getByRole("button", { name: "Ngừng hoạt động" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  await act(async () => client.invalidateQueries({ queryKey: farmDetailKey(farm.id) }));
  await act(async () => pending.resolve(toggled));
  const deletion = within(await openFarmAction());
  expect(deletion.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledTimes(3);
  await act(async () => verification.resolve(blocked));
  expect(await deletion.findByRole("link", { name: orderDeleteReason.label })).toBeVisible();
  expect(deletion.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  expect(mocks.removeFarm).not.toHaveBeenCalled();
});

it("shows validated previous rejection reasons when current Farm verification fails", async () => {
  mocks.get
    .mockResolvedValueOnce(farm)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(farm);
  mocks.removeFarm.mockRejectedValue(fail("farm_in_use", 409, { reasons: [orderDeleteReason] }));
  view(<FarmDetail farmId={farm.id} />);
  const dialog = within(await openFarmAction());
  fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  expect(await dialog.findByRole("link", { name: orderDeleteReason.label })).toBeVisible();
  expect(dialog.getByText("Lý do của lần xóa vừa bị từ chối")).toBeVisible();
  expect(dialog.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  expect(await dialog.findByRole("button", { name: "Xóa" })).toBeEnabled();
  expect(dialog.queryByRole("link", { name: orderDeleteReason.label })).not.toBeInTheDocument();
  expect(mocks.removeFarm).toHaveBeenCalledTimes(1);
});

it("uses the same confirmation dialog and requires a second click after the displayed Farm changes", async () => {
  let client!: QueryClient;
  mocks.removeFarm.mockResolvedValue(undefined);
  viewFarmInformation(
    <CaptureQueryClient
      capture={(value) => {
        client = value;
      }}
    />,
  );
  const modal = await openFarmAction();
  const dialog = within(modal);
  act(() => {
    client.setQueryData(farmDetailKey(farm.id), { ...farm, version: 3, name_vi: "Tên mới" });
    fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  });
  expect(mocks.removeFarm).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Xóa trang trại" })).toBe(modal);
  expect(await dialog.findByText(/Hãy xem lại và xác nhận/)).toBeVisible();
  expect(dialog.getByText(/Xóa Tên mới/)).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.removeFarm).toHaveBeenCalledTimes(1));
});

it("settles once when a canonical Farm 404 wins the race with a pending Delete", async () => {
  const pending = deferred<void>();
  let client!: QueryClient;
  mocks.removeFarm.mockReturnValueOnce(pending.promise);
  mocks.get.mockResolvedValueOnce(farm).mockRejectedValueOnce(fail("not_found", 404));
  view(
    <>
      <CaptureQueryClient
        capture={(value) => {
          client = value;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  fireEvent.click(within(await openFarmAction()).getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.removeFarm).toHaveBeenCalledTimes(1));
  await act(async () => client.invalidateQueries({ queryKey: farmDetailKey(farm.id) }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/farms"));
  await act(async () => pending.resolve(undefined));
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(farmDetailKey(farm.id))).toBeNull();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});

it("does not restore a deleted Farm when a prior canonical GET completes with a stale snapshot", async () => {
  const pendingDelete = deferred<void>();
  const pendingRead = deferred<Farm>();
  let client!: QueryClient;
  mocks.removeFarm.mockReturnValueOnce(pendingDelete.promise);
  mocks.get.mockResolvedValueOnce(farm).mockReturnValueOnce(pendingRead.promise);
  view(
    <>
      <CaptureQueryClient
        capture={(value) => {
          client = value;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  fireEvent.click(within(await openFarmAction()).getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.removeFarm).toHaveBeenCalledTimes(1));
  act(() => {
    void client.invalidateQueries({ queryKey: farmDetailKey(farm.id) });
  });
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  await act(async () => pendingDelete.resolve(undefined));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/farms"));
  await act(async () => pendingRead.resolve(farm));
  expect(client.getQueryData(farmDetailKey(farm.id))).toBeNull();
  expect(screen.queryByRole("heading", { name: farm.name_vi })).not.toBeInTheDocument();
  expect(mocks.replace).toHaveBeenCalledTimes(1);
});

it("retires only the deleted Farm when its 204 arrives after navigating to another Farm", async () => {
  const pending = deferred<void>();
  let client!: QueryClient;
  const other = { ...farm, id: "farm-2", name_vi: "Trang trại khác" };
  mocks.removeFarm.mockReturnValueOnce(pending.promise);
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(other);
  const shell = (id: string) => (
    <>
      <CaptureQueryClient
        capture={(value) => {
          client = value;
        }}
      />
      <FarmDetail farmId={id} />
    </>
  );
  const page = view(shell(farm.id));
  fireEvent.click(within(await openFarmAction()).getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.removeFarm).toHaveBeenCalledTimes(1));
  page.change(shell(other.id));
  expect(await screen.findByRole("heading", { name: other.name_vi })).toBeVisible();
  expect(await farmMenu()).toBeEnabled();
  await act(async () => pending.resolve(undefined));
  expect(client.getQueryData(farmDetailKey(farm.id))).toBeNull();
  expect(client.getQueryData(farmDetailKey(other.id))).toEqual(other);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("keeps supply writes locked on a source route through pending and uncertain Delete", async () => {
  prepareInventory();
  const pending = deferred<void>();
  mocks.removeFarm.mockReturnValueOnce(pending.promise);
  const page = view(<FarmDetail farmId={farm.id} />);
  fireEvent.click(within(await openFarmAction()).getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.removeFarm).toHaveBeenCalledTimes(1));
  page.change(<FarmDetail farmId={farm.id} productId="product-1" />);
  const remove = await screen.findByRole("button", { name: "Gỡ sản phẩm" });
  expect(remove).toBeDisabled();
  await act(async () => pending.reject(fail("request_timeout", 408)));
  expect(await screen.findByText(/lần xóa trước chưa được xác nhận/)).toBeVisible();
  expect(remove).toBeDisabled();
  fireEvent.click(remove);
  expect(mocks.removeLink).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("does not apply a late Delete from a retired session to the next session for the same Farm", async () => {
  const pending = deferred<void>();
  mocks.removeFarm.mockReturnValueOnce(pending.promise);
  const shell = (session: string) => (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider key={session}>
          <FarmDetail farmId={farm.id} />
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
  const page = render(shell("old-session"));
  fireEvent.click(within(await openFarmAction()).getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.removeFarm).toHaveBeenCalledTimes(1));
  page.rerender(shell("new-session"));
  expect(await farmMenu()).toBeEnabled();
  await act(async () => pending.resolve(undefined));
  expect(await farmMenu()).toBeEnabled();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("keeps a newer same-version Farm capability when the Delete recovery GET returns late", async () => {
  const pending = deferred<Farm>();
  mocks.get
    .mockResolvedValueOnce(farm)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({
      ...farm,
      capabilities: { delete: { allowed: false, reasons: [orderDeleteReason] } },
    });
  mocks.removeFarm.mockRejectedValue(fail("farm_product_changed", 409));
  let client: QueryClient | undefined;
  view(
    <>
      <CaptureQueryClient
        capture={(value) => {
          client = value;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  const dialog = within(await openFarmAction());
  fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  await act(async () => client!.invalidateQueries({ queryKey: farmDetailKey(farm.id) }));
  await act(async () =>
    pending.resolve({
      ...farm,
      capabilities: { delete: { allowed: false, reasons: [supplyingDeleteReason] } },
    }),
  );
  expect(await screen.findByRole("link", { name: "NFV-000123" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Rau muống" })).not.toBeInTheDocument();
  expect(dialog.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledTimes(3);
  expect(mocks.removeFarm).toHaveBeenCalledTimes(1);
});

it("checks capability again before confirming a previously allowed Delete", async () => {
  let client: QueryClient | undefined;
  view(
    <>
      <CaptureQueryClient
        capture={(value) => {
          client = value;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  const modal = await openFarmAction();
  const dialog = within(modal);
  const confirm = dialog.getByRole("button", { name: "Xóa" });
  await act(async () => {
    client!.setQueryData(farmDetailKey(farm.id), {
      ...farm,
      capabilities: { delete: { allowed: false, reasons: [orderDeleteReason] } },
    });
    // React has not yet re-rendered the disabled confirmation.
    confirm.click();
  });
  expect(mocks.removeFarm).not.toHaveBeenCalled();
  expect(await dialog.findByRole("link", { name: "NFV-000123" })).toBeVisible();
  expect(screen.getByRole("dialog", { name: "Xóa trang trại" })).toBe(modal);
  expect(dialog.getAllByRole("button")).toEqual([dialog.getByRole("button", { name: "Đóng" })]);
});

it("uses only GET to recover a timed-out Delete until a missing Farm confirms the result", async () => {
  setRoute("/farms/farm-1?search=Hue&is_active=true&page=2");
  mocks.removeFarm.mockRejectedValue(fail("request_timeout", 408));
  mocks.get
    .mockResolvedValueOnce(farm)
    .mockResolvedValueOnce({ ...farm, version: farm.version + 1 })
    .mockRejectedValueOnce(fail("request_timeout", 404))
    .mockRejectedValueOnce(fail("request_failed", 404))
    .mockRejectedValueOnce(
      Object.assign(new Error("request_failed"), {
        status: 404,
        payload: { detail: "No Farm matches the given query." },
      }),
    );
  view(<FarmDetail farmId={farm.id} />);
  const dialog = within(await openFarmAction());
  fireEvent.click(dialog.getByRole("button", { name: "Xóa" }));
  const verify = () => screen.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" });
  expect(await dialog.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" })).toBeVisible();
  expect(dialog.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Đóng" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(await verify());
  const reopen = await screen.findByRole("button", { name: "Xem lại thao tác xóa" });
  expect(await farmMenu()).toBeDisabled();
  fireEvent.click(reopen);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const check = await verify();
    await act(async () => fireEvent.click(check));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument(),
    );
    expect(await farmMenu()).toBeDisabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  }
  const check = await verify();
  await act(async () => fireEvent.click(check));
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      "/farms?search=Hue&is_active=true&page=2",
    ),
  );
  expect(screen.queryByRole("button", { name: "Tùy chọn khác" })).not.toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledTimes(5);
  expect(mocks.removeFarm).toHaveBeenCalledTimes(1);
});

it("retires the Farm and supply cache after a confirmed Delete and restores list filters", async () => {
  setRoute("/farms/farm-1?search=Hue&is_active=true&page=2");
  mocks.removeFarm.mockResolvedValue(undefined);
  let client: QueryClient | undefined;
  view(
    <>
      <CaptureQueryClient
        capture={(value) => {
          client = value;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  const dialog = within(await openFarmAction());
  const sourceKey = [...farmSupplyKey(farm.id), "source", linkedProduct.id];
  client!.setQueryData(sourceKey, linkedProduct);
  client!.setQueryData(farmListKey, [farm]);
  const confirm = dialog.getByRole("button", { name: "Xóa" });
  await act(async () => {
    confirm.click();
    confirm.click();
  });
  expect(mocks.removeFarm).toHaveBeenCalledExactlyOnceWith(farm.id);
  expect(client!.getQueryData(farmDetailKey(farm.id))).toBeNull();
  expect(client!.getQueryData(sourceKey)).toBeUndefined();
  expect(client!.getQueryState(farmListKey)?.isInvalidated).toBe(true);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      "/farms?search=Hue&is_active=true&page=2",
    ),
  );
  expect(mocks.get).toHaveBeenCalledTimes(1);
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

it.each([false, undefined, "true"])(
  "disables supply natively for an unverified or ineligible Farm (%s)",
  async (can_add_supply) => {
    mocks.get.mockResolvedValue({
      ...farm,
      capabilities: { ...farm.capabilities, can_add_supply },
    });
    mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
    view(<FarmDetail farmId={farm.id} />);
    await screen.findByRole("link", { name: "Rau muống" });
    const supply = screen.getByRole("button", { name: "Bổ sung nguồn cung" });
    expect(supply).toBeDisabled();
    expect(supply).not.toHaveAttribute("href");
    fireEvent.keyDown(supply, { key: "Enter" });
    fireEvent.keyDown(supply, { key: " " });
    fireEvent.click(supply);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  },
);

it("uses verified Farm capability through search, same-version updates and failed refresh", async () => {
  setRoute("/farms/farm-1?supply_search=missing&supply_status=removed");
  const eligible = {
    ...farm,
    is_active: false,
    in_stock_product_count: 0,
    capabilities: { ...farm.capabilities, can_add_supply: true },
  };
  mocks.get.mockResolvedValue(eligible);
  let client!: QueryClient;
  view(
    <>
      <CaptureQueryClient
        capture={(current) => {
          client = current;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  expect(await screen.findByRole("link", { name: "Bổ sung nguồn cung" })).toBeVisible();
  const refresh = deferred<Farm>();
  mocks.get.mockReturnValueOnce(refresh.promise);
  act(() => void client.invalidateQueries({ queryKey: farmDetailKey(farm.id) }));
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  await act(async () =>
    refresh.resolve({
      ...eligible,
      capabilities: { ...eligible.capabilities, can_add_supply: false },
    }),
  );
  expect(screen.getByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  await act(() => client.invalidateQueries({ queryKey: farmDetailKey(farm.id) }));
  expect(await screen.findByRole("link", { name: "Bổ sung nguồn cung" })).toBeVisible();
  mocks.get.mockRejectedValueOnce(new Error("network_error"));
  await act(() => client.invalidateQueries({ queryKey: farmDetailKey(farm.id) }));
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
});

it("keeps supply disabled when a competing same-version response makes capability ambiguous", async () => {
  const eligible = { ...farm, capabilities: { ...farm.capabilities, can_add_supply: true } };
  const unavailable = { ...farm, capabilities: { ...farm.capabilities, can_add_supply: false } };
  const key = farmDetailKey(farm.id);
  mocks.get.mockResolvedValue(eligible);
  let client!: QueryClient;
  view(
    <>
      <CaptureQueryClient
        capture={(current) => {
          client = current;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  await screen.findByRole("link", { name: "Bổ sung nguồn cung" });
  const late = deferred<Farm>();
  mocks.get.mockReturnValueOnce(late.promise);
  act(() => void client.refetchQueries({ queryKey: key }));
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  await act(async () => {
    client.setQueryData(key, unavailable);
    late.resolve(eligible);
  });
  await waitFor(() => expect(client.getQueryState(key)?.fetchStatus).toBe("idle"));
  expect(client.getQueryData<Farm>(key)?.capabilities?.can_add_supply).toBeUndefined();
  expect(screen.getByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();

  await act(() => client.refetchQueries({ queryKey: key }));
  expect(await screen.findByRole("link", { name: "Bổ sung nguồn cung" })).toBeVisible();
});

it("locks supply during a pending or unresolved bulk write despite verified capability", async () => {
  mocks.get.mockResolvedValue({
    ...farm,
    capabilities: { ...farm.capabilities, can_add_supply: true },
  });
  let client!: QueryClient;
  view(
    <>
      <CaptureQueryClient
        capture={(current) => {
          client = current;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  await screen.findByRole("link", { name: "Bổ sung nguồn cung" });
  const pending = deferred<{ failure: { kind: "unknown" } }>();
  const cache = client.getMutationCache();
  const write = cache.build(client, {
    mutationKey: farmBulkWriteKey(farm.id),
    mutationFn: () => pending.promise,
  });
  act(() => void write.execute(undefined));
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  await act(async () => pending.resolve({ failure: { kind: "unknown" } }));
  expect(screen.getByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  act(() => cache.remove(write));
  expect(await screen.findByRole("link", { name: "Bổ sung nguồn cung" })).toBeVisible();
});

it("replaces an initial Farm read invalidated by a later supply change", async () => {
  const stale = deferred<Farm>();
  mocks.get.mockReturnValueOnce(stale.promise).mockResolvedValue({
    ...farm,
    capabilities: { ...farm.capabilities, can_add_supply: false },
  });
  let client!: QueryClient;
  view(
    <>
      <CaptureQueryClient
        capture={(current) => {
          client = current;
        }}
      />
      <FarmDetail farmId={farm.id} />
    </>,
  );
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
  await act(async () => {
    invalidateFarmDetail(client, farm.id);
    stale.resolve({ ...farm, capabilities: { ...farm.capabilities, can_add_supply: true } });
  });
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(mocks.get.mock.calls[0][1].aborted).toBe(true);
});

it("refreshes authoritative supply capability when the linked-products toolbar is refreshed", async () => {
  const eligible = { ...farm, capabilities: { ...farm.capabilities, can_add_supply: true } };
  const refreshed = deferred<Farm>();
  mocks.get.mockResolvedValueOnce(eligible).mockReturnValueOnce(refreshed.promise);
  mocks.linked.mockResolvedValue(linkedResult([]));
  view(<FarmDetail farmId={farm.id} />);
  await screen.findByRole("link", { name: "Bổ sung nguồn cung" });
  const refreshButton = screen.getByRole("button", { name: "Làm mới danh sách nguồn cung" });
  await waitFor(() => expect(refreshButton).toBeEnabled());
  fireEvent.click(refreshButton);
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  await act(async () => {
    refreshed.resolve({
      ...eligible,
      capabilities: { ...eligible.capabilities, can_add_supply: false },
    });
  });
  expect(screen.getByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(mocks.linked).toHaveBeenCalledTimes(2);
});

it("rechecks a cached Farm capability on returning from another route", async () => {
  const eligible = { ...farm, capabilities: { ...farm.capabilities, can_add_supply: true } };
  const refreshed = deferred<Farm>();
  mocks.get.mockResolvedValueOnce(eligible).mockReturnValueOnce(refreshed.promise);
  const rendered = view(<FarmDetail farmId={farm.id} />);
  await screen.findByRole("link", { name: "Bổ sung nguồn cung" });
  rendered.close();
  rendered.change(<FarmDetail farmId={farm.id} />);
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  await act(async () => {
    refreshed.resolve({
      ...eligible,
      capabilities: { ...eligible.capabilities, can_add_supply: false },
    });
  });
  expect(screen.getByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});

it("refreshes supply eligibility and the picker cache after removing the last eligible source", async () => {
  const eligible = { ...farm, capabilities: { ...farm.capabilities, can_add_supply: true } };
  const unavailable = { ...farm, capabilities: { ...farm.capabilities, can_add_supply: false } };
  mocks.get.mockResolvedValueOnce(eligible).mockResolvedValue(unavailable);
  mocks.source.mockResolvedValueOnce(supplying).mockResolvedValue(removedSupply);
  mocks.removeLink.mockResolvedValue(removedSupply);
  let client!: QueryClient;
  const rendered = view(
    <>
      <CaptureQueryClient
        capture={(current) => {
          client = current;
        }}
      />
      <FarmDetail farmId={farm.id} productId="product-1" />
    </>,
  );
  const supplyKey = farmSupplyKey(farm.id);
  const pickerKey = [...supplyKey, "available", "", 1];
  const eligibleKey = [...supplyKey, "eligible", "supplying", "active", "", 1];
  client.setQueryData(pickerKey, linkedResult([]));
  client.setQueryData(eligibleKey, linkedResult([linkedProduct]));
  fireEvent.click(await screen.findByRole("button", { name: "Gỡ sản phẩm" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ sản phẩm" }));
  await waitFor(() => expect(client.getQueryData(farmDetailKey(farm.id))).toEqual(unavailable));
  expect(client.getQueryState(pickerKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(eligibleKey)?.isInvalidated).toBe(true);
  rendered.change(<FarmDetail farmId={farm.id} />);
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
});

function fail(code: string, status: number, context?: unknown) {
  return Object.assign(new Error(code), { status, payload: { errors: [{ code, context }] } });
}

async function openAdd() {
  const add = await screen.findByRole("button", { name: "Thêm sản phẩm" });
  await waitFor(() => expect(add).toBeEnabled());
  add.focus();
  fireEvent.click(add);
  const dialog = within(await screen.findByRole("dialog", { name: "Thêm sản phẩm" }));
  await dialog.findByRole("checkbox", { name: /Rau muống/ });
  return dialog;
}

it("selects multiple products across search and pagination and submits only one bulk linking intent", async () => {
  prepareInventory();
  const third = { ...unlinkedProduct, id: "product-3", sku: "RAU-03", name_vi: "Cải bẹ" };
  mocks.available.mockImplementation((_id, { page, search }) =>
    Promise.resolve({
      data: search ? [third] : page === 2 ? [removedPickerProduct] : [unlinkedProduct, third],
      meta: { page, page_size: 30, total: search ? 1 : 31 },
    }),
  );
  mocks.get
    .mockResolvedValueOnce({ ...farm, capabilities: { can_add_supply: false } })
    .mockResolvedValueOnce({
      ...farm,
      capabilities: {
        delete: { allowed: false, reasons: [supplyingDeleteReason] },
        can_add_supply: true,
      },
    });
  const result = deferred<{ farm_id: string; created_count: number; idempotent_replay: boolean }>();
  mocks.add.mockReturnValue(result.promise);
  view(<FarmDetail farmId={farm.id} />);
  expect(await screen.findByRole("button", { name: "Bổ sung nguồn cung" })).toBeDisabled();
  expect(mocks.available).not.toHaveBeenCalled();
  const dialog = await openAdd();
  expect(dialog.getAllByText("500 g")).toHaveLength(2);
  expect(dialog.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(
    dialog.queryByText(/Ngày bắt đầu|Ngày kết thúc|Số lượng đơn vị bán/),
  ).not.toBeInTheDocument();
  const first = dialog.getByRole("checkbox", { name: /Rau muống/ });
  const all = dialog.getByRole("checkbox", { name: /trang hiện tại/ });
  first.focus();
  expect(first).toHaveFocus();
  fireEvent.click(first);
  expect(all).toBePartiallyChecked();
  fireEvent.click(all);
  expect(all).toBeChecked();
  fireEvent.click(all);
  expect(first).not.toBeChecked();
  fireEvent.click(first);

  fireEvent.click(dialog.getByRole("button", { name: "Sau" }));
  fireEvent.click(await dialog.findByRole("checkbox", { name: /trang hiện tại/ }));
  await waitFor(() => expect(dialog.getByRole("checkbox", { name: /Cải ngọt/ })).toBeChecked());
  expect(dialog.getAllByRole("table")).toHaveLength(1);
  expect(dialog.getAllByText("Cải ngọt")).toHaveLength(1);
  expect(dialog.getByText("RAU-02 · Đã từng cung cấp")).toBeVisible();
  const search = dialog.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "Cải - #" } });
  expect(mocks.available).toHaveBeenCalledTimes(2);
  fireEvent.submit(search.closest("form")!);
  expect(await dialog.findByRole("checkbox", { name: /Cải bẹ/ })).not.toBeChecked();
  expect(mocks.available).toHaveBeenLastCalledWith(
    farm.id,
    { page: 1, search: "Cải - #" },
    expect.any(AbortSignal),
  );
  expect(dialog.getByText("Đã chọn 2 sản phẩm")).toBeVisible();
  expect(dialog.queryByText("Cải ngọt")).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Đã chọn 2 sản phẩm" }));
  expect(dialog.getAllByRole("table")).toHaveLength(1);
  expect(dialog.getByRole("checkbox", { name: /Cải ngọt/ })).toBeChecked();
  fireEvent.click(dialog.getByRole("button", { name: "Quay lại danh sách sản phẩm" }));
  expect(dialog.getByRole("searchbox")).toHaveValue("Cải - #");
  expect(dialog.getByRole("checkbox", { name: /Cải bẹ/ })).not.toBeChecked();
  const save = dialog.getByRole("button", { name: "Thêm sản phẩm" });
  act(() => {
    save.click();
    save.click();
  });
  await waitFor(() =>
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(farm.id, {
      idempotency_key: expect.any(String),
      items: [
        { product_id: "product-1", expected_source: null },
        { product_id: "product-2", expected_source: { id: "source-2", version: 4 } },
      ],
    }),
  );
  expect(save).toBeDisabled();
  await act(async () =>
    result.resolve({ farm_id: farm.id, created_count: 2, idempotent_replay: false }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByRole("link", { name: "Bổ sung nguồn cung" })).toBeVisible();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.linked).toHaveBeenCalledTimes(2));
  expect(mocks.source).not.toHaveBeenCalled();
  expect(mocks.batches).not.toHaveBeenCalled();
});

it("retains a stale removed revision for review until the administrator reselects it", async () => {
  const refreshedProduct = {
    ...removedPickerProduct,
    removed_source: { ...removedPickerProduct.removed_source, version: 5 },
  };
  const meta = { page: 1, page_size: 30, total: 2 };
  mocks.available
    .mockResolvedValueOnce({ data: [unlinkedProduct, removedPickerProduct], meta })
    .mockResolvedValue({ data: [unlinkedProduct, refreshedProduct], meta });
  mocks.add.mockResolvedValue({});
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /Cải ngọt/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Làm mới" }));
  const issue = await dialog.findByText(/Phiên bản nguồn cung đã thay đổi/);
  expect(dialog.getByRole("checkbox", { name: /Cải ngọt/ })).toHaveAccessibleDescription(
    issue.textContent,
  );
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  fireEvent.click(dialog.getByRole("button", { name: "Đã chọn 1 sản phẩm" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: /Cải ngọt/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Quay lại danh sách sản phẩm" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: /Cải ngọt/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  await waitFor(() =>
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(farm.id, {
      idempotency_key: expect.any(String),
      items: [{ product_id: "product-2", expected_source: { id: "source-2", version: 5 } }],
    }),
  );
});

it("restores focus to the add-products trigger while its linked list refreshes", async () => {
  const refresh = deferred<ReturnType<typeof linkedResult>>();
  mocks.linked.mockResolvedValueOnce(linkedResult([])).mockReturnValueOnce(refresh.promise);
  mocks.add.mockResolvedValue({});
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /Rau muống/ }));
  const submit = dialog.getByRole("button", { name: "Thêm sản phẩm" });
  submit.focus();
  fireEvent.click(submit);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.linked).toHaveBeenCalledTimes(2);
  const trigger = screen.getByRole("button", { name: "Thêm sản phẩm" });
  await waitFor(() => expect(trigger).toHaveFocus());
  await act(async () => refresh.resolve(linkedResult([])));
});

it("enforces the 50-product request limit across catalog pages and exposes the English controls", async () => {
  const available = Array.from({ length: 51 }, (_, index) => ({
    ...unlinkedProduct,
    id: `available-${index}`,
    name_en:
      index === 0 ? "Water spinach " + "long-variety-".repeat(16) : `Catalog product ${index + 1}`,
    sku: `SK-${String(index + 1).padStart(3, "0")}`,
  }));
  mocks.available.mockImplementation((_id, { page }) =>
    Promise.resolve({
      data: available.slice((page - 1) * 30, page * 30),
      meta: { page, page_size: 30, total: available.length },
    }),
  );
  view(<FarmProducts farm={farm} />, "en");
  const trigger = await screen.findByRole("button", { name: "Add products" });
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.click(trigger);
  const dialog = within(await screen.findByRole("dialog", { name: "Add products" }));
  const first = await dialog.findByRole("checkbox", { name: /SK-001/ });
  expect(first).toHaveAttribute("type", "checkbox");
  expect(dialog.getByText(available[0].name_en)).toBeVisible();
  fireEvent.click(dialog.getByRole("checkbox", { name: "Select all products on this page" }));
  expect(dialog.getByText("30 products selected")).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Next" }));
  await dialog.findByRole("checkbox", { name: /SK-031/ });
  expect(dialog.getByRole("checkbox", { name: "Select all products on this page" })).toBeDisabled();
  expect(dialog.getByText("You can add up to 50 products at a time.")).toBeVisible();
  const rows = dialog.getAllByRole("checkbox", { name: /Catalog product/ });
  for (const row of rows.slice(0, 20)) fireEvent.click(row);
  expect(dialog.getByText("50 products selected")).toBeVisible();
  expect(rows[20]).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Add products" })).toBeEnabled();
});

it("retains a selected product in review when a complete catalog refresh shows it became unavailable", async () => {
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /Rau muống/ }));
  mocks.available.mockResolvedValueOnce({ data: [], meta: { page: 1, page_size: 30, total: 0 } });
  fireEvent.click(dialog.getByRole("button", { name: "Làm mới" }));
  expect(await dialog.findByText("Không có sản phẩm để thêm.")).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Đã chọn 1 sản phẩm" }));
  expect(dialog.getByText(/Sản phẩm không còn khả dụng/)).toBeVisible();
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  expect(mocks.add).not.toHaveBeenCalled();
});

it("keeps selected products eligible when a filtered refresh stops matching their name or code", async () => {
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  const search = dialog.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "RAU-01" } });
  fireEvent.submit(search.closest("form")!);
  const selected = await dialog.findByRole("checkbox", { name: /Rau muống/ });
  fireEvent.click(selected);
  mocks.available.mockResolvedValueOnce({ data: [], meta: { page: 1, page_size: 30, total: 0 } });
  fireEvent.click(dialog.getByRole("button", { name: "Làm mới" }));
  expect(await dialog.findByText("Không có sản phẩm phù hợp.")).toBeVisible();
  expect(dialog.getByText("Đã chọn 1 sản phẩm")).toBeVisible();
  expect(dialog.queryByText(/Sản phẩm không còn khả dụng/)).not.toBeInTheDocument();
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeEnabled();
});

it("marks the exact stale item from a scoped product 404 and keeps other selections for review", async () => {
  const other = { ...unlinkedProduct, id: "product-2", name_vi: "Cải xanh", sku: "RAU-02" };
  mocks.available.mockResolvedValue({
    data: [unlinkedProduct, other],
    meta: { page: 1, page_size: 30, total: 2 },
  });
  mocks.add.mockRejectedValueOnce(fail("not_found", 404, { product_id: other.id, item_index: 1 }));
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /trang hiện tại/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  expect(await dialog.findByText(/Sản phẩm không còn khả dụng/)).toBeVisible();
  expect(dialog.getByText("Đã chọn 2 sản phẩm")).toBeVisible();
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  expect(dialog.getByRole("checkbox", { name: /Rau muống/ })).not.toHaveAttribute("aria-invalid");
  expect(dialog.getByRole("checkbox", { name: /Cải xanh/ })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  fireEvent.click(dialog.getByRole("button", { name: "Đã chọn 2 sản phẩm" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: /Bỏ chọn Cải xanh/ }));
  await waitFor(() => expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeEnabled());
  expect(dialog.getByText("Đã chọn 1 sản phẩm")).toBeVisible();
  expect(mocks.add).toHaveBeenCalledOnce();
});

it("associates a source version conflict with the submitted item outside the current catalog result", async () => {
  mocks.available.mockImplementation((_farm, { search }) => ({
    data: search ? [unlinkedProduct] : [unlinkedProduct, removedPickerProduct],
    meta: { page: 1, page_size: 30, total: search ? 1 : 2 },
  }));
  mocks.add.mockRejectedValueOnce(fail("farm_product_version_conflict", 409, { item_index: 1 }));
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /trang hiện tại/ }));
  const search = dialog.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "RAU-01" } });
  fireEvent.submit(search.closest("form")!);
  const confirm = dialog.getByRole("button", { name: "Thêm sản phẩm" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  expect(await dialog.findByRole("alert")).toHaveTextContent(/Mở danh sách sản phẩm đã chọn/);
  expect(dialog.queryByText("Cải ngọt")).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Đã chọn 2 sản phẩm" }));
  expect(dialog.getByRole("checkbox", { name: /Cải ngọt/ })).toHaveAccessibleDescription(
    /Phiên bản nguồn cung đã thay đổi/,
  );
  expect(dialog.getByRole("checkbox", { name: /Rau muống/ })).not.toHaveAttribute("aria-invalid");
  expect(confirm).toBeDisabled();
  expect(mocks.add).toHaveBeenCalledOnce();
});

it("retains the immutable linking intent after a missing receipt and retries it explicitly", async () => {
  prepareInventory();
  mocks.available.mockResolvedValue({
    data: [unlinkedProduct, removedPickerProduct],
    meta: { page: 1, page_size: 30, total: 2 },
  });
  mocks.add.mockRejectedValueOnce(fail("request_timeout", 408)).mockResolvedValueOnce({});
  mocks.recoverAdd.mockRejectedValue(fail("create_receipt_not_found", 404));
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /trang hiện tại/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  const checkReceipt = await dialog.findByRole("button", { name: "Kiểm tra biên nhận" });
  expect(dialog.getByText("Đã chọn 2 sản phẩm")).toBeVisible();
  expect(dialog.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(dialog.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(checkReceipt);
  expect(await dialog.findByText(/Chưa tìm thấy biên nhận/)).toBeVisible();
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  expect(mocks.recoverAdd).toHaveBeenCalledExactlyOnceWith(farm.id, mocks.add.mock.calls[0][1]);
  expect(mocks.add).toHaveBeenCalledTimes(1);
  expect(mocks.source).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Gửi lại giao dịch này" }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
  expect(mocks.add.mock.calls[1][1]).toBe(mocks.add.mock.calls[0][1]);
  const { items } = mocks.add.mock.calls[1][1];
  expect(items).toEqual([
    { product_id: unlinkedProduct.id, expected_source: null },
    { product_id: removedPickerProduct.id, expected_source: { id: "source-2", version: 4 } },
  ]);
  expect(Object.isFrozen(items)).toBe(true);
  expect(Object.isFrozen(items[1])).toBe(true);
  expect(Object.isFrozen(items[1].expected_source)).toBe(true);
});

it("recovers and exactly retries a legacy cached linking intent after the admin route remounts", async () => {
  let client!: QueryClient;
  const rendered = view(
    <CaptureQueryClient
      capture={(value) => {
        client = value;
      }}
    />,
  );
  const payload = Object.freeze({
    idempotency_key: "55555555-5555-4555-8555-555555555555",
    product_ids: Object.freeze([product.id]),
  });
  const failure = { kind: "unknown", cause: fail("request_timeout", 408), itemCodes: {} };
  await client
    .getMutationCache()
    .build(client, {
      mutationKey: farmProductLinkWriteKey(farm.id),
      mutationFn: async () => ({ failure }),
    })
    .execute({
      kind: "submit",
      intent: { kind: "link", payload, products: Object.freeze([Object.freeze(product)]) },
      revision: farmAccess(client).revision,
    });
  mocks.recoverAdd.mockRejectedValueOnce(fail("create_receipt_not_found", 404));
  mocks.add.mockResolvedValueOnce({});
  rendered.change(<FarmProducts farm={farm} />);
  const dialog = within(await screen.findByRole("dialog", { name: "Thêm sản phẩm" }));
  expect(dialog.getByText("Đã chọn 1 sản phẩm")).toBeVisible();
  expect(dialog.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Kiểm tra biên nhận" }));
  expect(await dialog.findByText(/Chưa tìm thấy biên nhận/)).toBeVisible();
  expect(mocks.recoverAdd.mock.calls[0][1]).toBe(payload);
  expect(mocks.available).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Gửi lại giao dịch này" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.add).toHaveBeenCalledExactlyOnceWith(farm.id, payload);
  expect(mocks.add.mock.calls[0][1]).toBe(payload);
});

it("keeps conflicting selected products visible and requires the administrator to review", async () => {
  prepareInventory();
  mocks.add.mockRejectedValue(fail("farm_product_removed", 409, { product_id: "product-1" }));
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /Rau muống/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  expect(await dialog.findByText(/Nguồn cung của sản phẩm đã thay đổi/)).toBeVisible();
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  fireEvent.click(dialog.getByRole("button", { name: "Đã chọn 1 sản phẩm" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: /Bỏ chọn Rau muống/ }));
  expect(dialog.getByText("Đã chọn 0 sản phẩm")).toBeVisible();
  expect(mocks.add).toHaveBeenCalledOnce();
});

it("blocks submission after a failed picker refresh and restores trigger focus on cancel", async () => {
  prepareInventory();
  view(<FarmProducts farm={farm} />);
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /Rau muống/ }));
  mocks.available.mockRejectedValueOnce(fail("network_error", 503));
  fireEvent.click(dialog.getByRole("button", { name: "Làm mới" }));
  expect(await dialog.findByRole("alert")).toBeVisible();
  expect(dialog.getByText("Đã chọn 1 sản phẩm")).toBeVisible();
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  fireEvent.click(dialog.getByRole("button", { name: "Hủy" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Thêm sản phẩm" })).toHaveFocus());
});

it.each([false, true])(
  "refreshes Farm capability after removing the last discontinued Product (order history: %s)",
  async (hasOrder) => {
    prepareInventory();
    const prior = { ...supplying, product_status: "discontinued" as const };
    const after = { ...removedSupply, product_status: "discontinued" as const };
    mocks.get
      .mockResolvedValueOnce({
        ...farm,
        capabilities: { delete: { allowed: false, reasons: [supplyingDeleteReason] } },
      })
      .mockResolvedValueOnce({
        ...farm,
        capabilities: {
          delete: { allowed: !hasOrder, reasons: hasOrder ? [orderDeleteReason] : [] },
        },
      });
    mocks.source.mockResolvedValueOnce(prior).mockResolvedValueOnce(after);
    mocks.removeLink.mockResolvedValue(after);
    mocks.batches.mockImplementation((_farm, _product, { scope }) =>
      Promise.resolve(linkedResult([{ ...liveBatch, is_historical: scope === "history" }])),
    );
    const rendered = view(<FarmDetail farmId={farm.id} productId="product-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Gỡ sản phẩm" }));
    const dialog = within(screen.getByRole("dialog", { name: /Gỡ Rau muống/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Gỡ sản phẩm" }));
    expect(await screen.findByText("Đã gỡ", { exact: true })).toBeVisible();
    expect(mocks.removeLink).toHaveBeenCalledExactlyOnceWith(farm.id, "product-1", prior);
    await waitFor(() => expect(mocks.batches).toHaveBeenCalledTimes(2));
    expect(mocks.batches.mock.calls.map((call) => call[2].scope)).toEqual(["current", "history"]);
    expect(screen.queryByRole("button", { name: "Sửa đợt cung cấp" })).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.linked).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    rendered.change(<FarmDetail farmId={farm.id} />);
    const deletion = within(await openFarmAction());
    if (hasOrder) {
      expect(deletion.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
      expect(deletion.getByRole("link", { name: "NFV-000123" })).toBeVisible();
    } else {
      expect(deletion.getByRole("button", { name: "Xóa" })).toBeEnabled();
      expect(deletion.queryByRole("list")).not.toBeInTheDocument();
    }
    expect(mocks.get).toHaveBeenCalledTimes(2);
  },
);

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

it("re-links the same source without a batch and keeps the prior batches read-only", async () => {
  prepareInventory();
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce({
    ...farm,
    capabilities: { delete: { allowed: false, reasons: [supplyingDeleteReason] } },
  });
  const renewed = {
    ...supplying,
    version: 4,
    supply_generation: 2,
    available_quantity: 0,
    active_batch_count: 0,
    batch_count: 0,
    next_expiry_date: null,
  };
  mocks.source.mockResolvedValueOnce(removedSupply).mockResolvedValue(renewed);
  mocks.readd.mockResolvedValue(renewed);
  mocks.batches.mockImplementation((_farm, _product, { scope }) =>
    Promise.resolve(
      linkedResult(
        scope === "history"
          ? [{ ...liveBatch, is_historical: true, remaining_quantity: 7, available_quantity: 0 }]
          : [],
      ),
    ),
  );
  const rendered = view(<FarmDetail farmId={farm.id} productId="product-1" />);
  expect(await screen.findByText("Thuộc lịch sử")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Sửa đợt cung cấp" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Liên kết lại" }));
  const dialog = within(screen.getByRole("dialog", { name: "Liên kết lại" }));
  expect(dialog.getByText(/Nguồn cung từ các đợt cũ/)).toBeVisible();
  expect(dialog.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Liên kết lại" }));
  await waitFor(() =>
    expect(mocks.readd).toHaveBeenCalledExactlyOnceWith(farm.id, "product-1", {
      expected_link_id: removedSupply.id,
      expected_version: removedSupply.version,
      previous_generation: removedSupply.supply_generation,
      idempotency_key: expect.any(String),
    }),
  );
  expect(
    await screen.findByText("Chưa có đợt cung cấp trong lần cung cấp hiện tại."),
  ).toBeVisible();
  expect(screen.getByText("0 đơn vị bán")).toBeVisible();
  expect(await screen.findByRole("link", { name: "Bổ sung nguồn cung" })).toBeVisible();
  expect(mocks.get).toHaveBeenCalledTimes(2);
  rendered.change(<FarmDetail farmId={farm.id} />);
  const deletion = within(await openFarmAction());
  expect(deletion.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  expect(deletion.getByRole("link", { name: "Rau muống" })).toBeVisible();
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

it("keeps unresolved linking across route remount and locks farm deletion until the receipt verifies", async () => {
  prepareInventory();
  const pending = deferred<FarmProduct>();
  mocks.add.mockReturnValue(pending.promise);
  mocks.recoverAdd.mockResolvedValue({});
  const scope = (opened: boolean) => (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider>
          {opened ? <FarmDetail farmId={farm.id} /> : <p>Other route</p>}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
  const rendered = render(scope(true));
  const dialog = await openAdd();
  fireEvent.click(dialog.getByRole("checkbox", { name: /Rau muống/ }));
  fireEvent.click(dialog.getByRole("button", { name: "Thêm sản phẩm" }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
  rendered.rerender(scope(false));
  await act(async () => pending.reject(fail("request_timeout", 408)));
  rendered.rerender(scope(true));
  const restored = within(await screen.findByRole("dialog", { name: "Thêm sản phẩm" }));
  expect(restored.getByText("Đã chọn 1 sản phẩm")).toBeVisible();
  const deletion = within(await openFarmAction());
  expect(deletion.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  fireEvent.click(deletion.getByRole("button", { name: "Đóng" }));
  expect(mocks.removeFarm).not.toHaveBeenCalled();
  fireEvent.click(await restored.findByRole("button", { name: "Kiểm tra biên nhận" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.recoverAdd).toHaveBeenCalledExactlyOnceWith(farm.id, mocks.add.mock.calls[0][1]);
  expect(mocks.source).not.toHaveBeenCalled();
  expect(mocks.add).toHaveBeenCalledTimes(1);
});

it("locks Delete while the outcome of a re-add from the supply route remains uncertain", async () => {
  prepareInventory();
  mocks.source.mockResolvedValue(removedSupply);
  const pending = deferred<FarmProduct>();
  mocks.readd.mockReturnValue(pending.promise);
  const rendered = view(<FarmDetail farmId={farm.id} productId="product-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Liên kết lại" }));
  const dialog = within(screen.getByRole("dialog", { name: "Liên kết lại" }));
  fireEvent.click(dialog.getByRole("button", { name: "Liên kết lại" }));
  await waitFor(() => expect(mocks.readd).toHaveBeenCalledTimes(1));
  rendered.change(<FarmDetail farmId={farm.id} />);
  const deletion = within(await openFarmAction());
  expect(deletion.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  await act(async () => pending.reject(fail("request_timeout", 408)));
  expect(deletion.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  expect(mocks.removeFarm).not.toHaveBeenCalled();
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

it.each(["removed", "all"])(
  "ignores obsolete %s filters in the list and retains source navigation",
  async (status) => {
    setRoute(`/farms/farm-1?search=Hue&page=2&supply_status=${status}`);
    mocks.linked.mockImplementation((_farm, { supplyStatus, page }) =>
      Promise.resolve(
        linkedResult(supplyStatus === "removed" ? [removedSupply] : [supplying], page),
      ),
    );
    view(<FarmProducts farm={farm} />);
    expect(await screen.findByRole("link", { name: "Rau muống" })).toHaveAttribute(
      "href",
      `/farms/farm-1/products/product-1?search=Hue&page=2&supply_status=${status}`,
    );
    expect(screen.queryByRole("button", { name: "Bộ lọc" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(mocks.linked).toHaveBeenCalledExactlyOnceWith(
      farm.id,
      { page: 1, search: "", supplyStatus: "supplying" },
      expect.any(AbortSignal),
    );
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.batches).not.toHaveBeenCalled();
  },
);

it("selects only the current page and preserves product detail links and lifecycle status", async () => {
  const second = {
    ...linkedProduct,
    id: "link-2",
    product_id: "product-2",
    sku: "RAU-02",
    name_vi: "Cải ngọt",
    product_status: "discontinued" as const,
    available_quantity: 0,
  };
  const next = {
    ...linkedProduct,
    id: "link-3",
    product_id: "product-3",
    sku: "RAU-03",
    name_vi: "Cải bẹ",
  };
  mocks.linked.mockImplementation(async (_id, { page }) =>
    linkedResult(page === 1 ? [linkedProduct, second] : [next], page, 21),
  );
  view(<FarmProducts farm={farm} canAddSupply />);
  const headers = await screen.findAllByRole("columnheader");
  expect(headers.map((header) => header.textContent)).toEqual([
    "",
    "Sản phẩm",
    "Đơn vị bán",
    "Tồn kho",
  ]);
  expect(screen.getByRole("button", { name: "Gỡ sản phẩm" })).toBeDisabled();
  const all = within(headers[0]).getByRole("checkbox", {
    name: "Chọn tất cả sản phẩm trên trang hiện tại",
  });
  const first = screen.getByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" });
  expect(all).not.toBeChecked();
  fireEvent.click(first);
  expect(all).toBePartiallyChecked();
  expect(screen.getByRole("button", { name: "Gỡ sản phẩm (1)" })).toBeEnabled();
  fireEvent.click(all);
  expect(all).toBeChecked();
  expect(screen.getByRole("button", { name: "Gỡ sản phẩm (2)" })).toBeEnabled();
  const row = within(screen.getByRole("row", { name: /Cải ngọt/ }));
  expect(row.getByRole("cell", { name: "0" })).toBeVisible();
  expect(row.getByText("Ngừng bán")).toBeVisible();
  expect(row.getByRole("link")).toHaveAttribute("href", "/farms/farm-1/products/product-2");
  expect(screen.queryByText("Đã chọn 2 sản phẩm")).not.toBeInTheDocument();
  fireEvent.click(row.getByRole("checkbox"));
  expect(all).toBePartiallyChecked();
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Sau" }));
  expect(await screen.findByRole("checkbox", { name: "Chọn Cải bẹ (RAU-03)" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Gỡ sản phẩm" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Trước" }));
  expect(
    await screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" }),
  ).not.toBeChecked();
});

it("invalidates a selected source when its version changes during a refresh", async () => {
  mocks.linked.mockResolvedValueOnce(linkedResult([linkedProduct]));
  view(<FarmProducts farm={farm} />, "en");
  const row = await screen.findByRole("checkbox", { name: "Select Water spinach (RAU-01)" });
  expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
    "",
    "Product",
    "Selling unit",
    "Stock",
  ]);
  expect(screen.getByRole("button", { name: "Add products" })).toBeEnabled();
  fireEvent.click(row);
  mocks.linked.mockResolvedValueOnce(linkedResult([{ ...linkedProduct, version: 3 }]));
  fireEvent.click(screen.getByRole("button", { name: "Refresh supply list" }));
  await waitFor(() => expect(row).not.toBeChecked());
  expect(screen.getByRole("button", { name: "Remove products" })).toBeDisabled();
  fireEvent.click(row);
  expect(screen.getByRole("button", { name: "Remove products (1)" })).toBeEnabled();
});

it("resets selection on applied search and on a Farm change even if the same product is present", async () => {
  const otherFarm = { ...farm, id: "farm-2" };
  mocks.linked.mockImplementation(async (farmId) =>
    linkedResult([{ ...linkedProduct, farm_id: farmId }]),
  );
  const rendered = view(<FarmProducts farm={farm} />);
  const checkbox = () => screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" });
  fireEvent.click(await checkbox());
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "RAU-01" } });
  expect(await checkbox()).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  expect(await checkbox()).not.toBeChecked();
  fireEvent.click(await checkbox());
  rendered.change(<FarmProducts farm={otherFarm} />);
  expect(await checkbox()).not.toBeChecked();
  rendered.change(<FarmProducts farm={farm} />);
  expect(await checkbox()).not.toBeChecked();
});

it("cancels bulk removal with the original selection and restores focus", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmProducts farm={farm} />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" }));
  const trigger = screen.getByRole("button", { name: "Gỡ sản phẩm (1)" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = within(screen.getByRole("dialog", { name: "Gỡ sản phẩm" }));
  expect(dialog.getByText("RAU-01")).toBeVisible();
  expect(dialog.getByText("Rau muống")).toBeVisible();
  expect(dialog.getByText("Đã chọn 1 sản phẩm")).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Hủy" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toBeEnabled();
  expect(mocks.linked).toHaveBeenCalledTimes(1);
  expect(mocks.bulkRemove).not.toHaveBeenCalled();
});

it("confirms the selected source versions once and reconciles a now-empty last page", async () => {
  setRoute("/farms/farm-1?supply_search=rau&supply_page=2");
  const first = {
    ...linkedProduct,
    id: "link-2",
    product_id: "product-2",
    version: 5,
    sku: "RAU-02",
    name_vi: "Cải ngọt",
  };
  const pending = deferred<{ removed_count: number }>();
  mocks.bulkRemove.mockReturnValue(pending.promise);
  mocks.linked.mockResolvedValueOnce(linkedResult([first], 2, 21));
  view(<FarmProducts farm={farm} canAddSupply />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Chọn Cải ngọt (RAU-02)" }));
  fireEvent.click(screen.getByRole("button", { name: "Gỡ sản phẩm (1)" }));
  const dialog = within(screen.getByRole("dialog", { name: "Gỡ sản phẩm" }));
  const submit = dialog.getByRole("button", { name: "Gỡ sản phẩm" });
  act(() => {
    fireEvent.click(submit);
    fireEvent.click(submit);
  });
  await waitFor(() =>
    expect(mocks.bulkRemove).toHaveBeenCalledExactlyOnceWith(farm.id, {
      idempotency_key: expect.any(String),
      items: [{ product_id: "product-2", expected_link_id: "link-2", expected_version: 5 }],
    }),
  );
  expect(dialog.getByRole("button", { name: "Hủy" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByRole("button", { name: "Thêm sản phẩm", hidden: true })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Bổ sung nguồn cung", hidden: true })).toBeDisabled();
  mocks.linked
    .mockResolvedValueOnce(linkedResult([], 2, 20))
    .mockResolvedValue(linkedResult([linkedProduct], 1, 20));
  await act(async () => pending.resolve({ removed_count: 1 }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("Đã gỡ 1 sản phẩm khỏi trang trại.")).toBeVisible();
  expect(
    await screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" }),
  ).not.toBeChecked();
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/farms/farm-1?supply_search=rau", {
    scroll: false,
  });
});

it.each(["during", "after"] as const)(
  "shows one removal success toast when remounting %s confirmation",
  async (remount) => {
    const pending = deferred<{ removed_count: number }>();
    const success = "Đã gỡ 1 sản phẩm khỏi trang trại.";
    const page = <FarmProducts farm={farm} />;
    mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
    mocks.bulkRemove.mockReturnValueOnce(pending.promise);
    const rendered = view(page);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" }));
    fireEvent.click(screen.getByRole("button", { name: "Gỡ sản phẩm (1)" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ sản phẩm" }),
    );
    await waitFor(() => expect(mocks.bulkRemove).toHaveBeenCalledTimes(1));
    rendered.close();

    if (remount === "during") {
      rendered.change(page);
      expect(await screen.findByRole("button", { name: "Đang gỡ sản phẩm…" })).toBeDisabled();
    }
    mocks.linked.mockResolvedValue(linkedResult([]));
    await act(async () => pending.resolve({ removed_count: 1 }));
    if (remount === "after") {
      expect(screen.queryByText(success)).not.toBeInTheDocument();
      rendered.change(page);
    }

    await screen.findByText(success);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rendered.change(<FarmProducts farm={farm} canAddSupply />);
    expect(screen.getAllByText(success)).toHaveLength(1);
    rendered.close();
    rendered.change(page);
    expect(screen.getAllByText(success)).toHaveLength(1);
    expect(mocks.bulkRemove).toHaveBeenCalledTimes(1);
  },
);

it("keeps a missed removal receipt across remount and explicitly resends the immutable intent", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.bulkRemove
    .mockRejectedValueOnce(fail("request_timeout", 408))
    .mockResolvedValueOnce({ removed_count: 1 });
  mocks.recoverBulkRemove.mockRejectedValueOnce(fail("create_receipt_not_found", 404));
  const rendered = view(<FarmProducts farm={farm} />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" }));
  fireEvent.click(screen.getByRole("button", { name: "Gỡ sản phẩm (1)" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ sản phẩm" }));
  await screen.findByRole("button", { name: "Kiểm tra biên nhận" });
  rendered.close();
  rendered.change(<FarmProducts farm={farm} />);
  const dialog = within(await screen.findByRole("dialog", { name: "Gỡ sản phẩm" }));
  expect(dialog.getByText("Rau muống")).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Kiểm tra biên nhận" }));
  expect(await dialog.findByText(/Chưa tìm thấy biên nhận/)).toBeVisible();
  expect(mocks.bulkRemove).toHaveBeenCalledTimes(1);
  fireEvent.click(dialog.getByRole("button", { name: "Gửi lại giao dịch này" }));
  expect(await screen.findByText("Đã gỡ 1 sản phẩm khỏi trang trại.")).toBeVisible();
  expect(mocks.bulkRemove).toHaveBeenCalledTimes(2);
  expect(mocks.bulkRemove.mock.calls[1][1]).toBe(mocks.bulkRemove.mock.calls[0][1]);
  expect(mocks.recoverBulkRemove.mock.calls[0][1]).toBe(mocks.bulkRemove.mock.calls[0][1]);
  expect(await screen.findByRole("link", { name: "Rau muống" })).toBeVisible();
});

it("shows the rejected item and validated allocation reference for an atomic rejection", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.bulkRemove.mockRejectedValueOnce(
    fail("farm_product_has_open_allocations", 409, {
      item_index: 0,
      product_id: "product-1",
      orders: [{ id: "33333333-3333-4333-8333-333333333333", reference_code: "NFV-000123" }],
      has_more: false,
      internal_detail: "raw backend detail",
    }),
  );
  view(<FarmProducts farm={farm} />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" }));
  fireEvent.click(screen.getByRole("button", { name: "Gỡ sản phẩm (1)" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: "Gỡ sản phẩm" }));
  expect(await dialog.findByText("Không có sản phẩm nào bị gỡ.")).toBeVisible();
  expect(dialog.getByText(/Rau muống.*RAU-01/)).toBeVisible();
  expect(dialog.getByText(/phân bổ cho đơn hàng chưa hoàn tất/)).toBeVisible();
  expect(dialog.getByRole("link", { name: "NFV-000123" })).toHaveAttribute(
    "href",
    "/store-orders/33333333-3333-4333-8333-333333333333",
  );
  expect(dialog.queryByText(/raw backend detail/)).not.toBeInTheDocument();
  expect(dialog.queryByRole("button", { name: "Gỡ sản phẩm" })).not.toBeInTheDocument();
  expect(mocks.bulkRemove).toHaveBeenCalledTimes(1);
});

it("requires renewed selection after the server reports a newer source version", async () => {
  mocks.linked.mockResolvedValueOnce(linkedResult([linkedProduct]));
  mocks.bulkRemove.mockRejectedValueOnce(
    fail("farm_product_version_conflict", 409, { item_index: 0, product_id: "product-1" }),
  );
  view(<FarmProducts farm={farm} />);
  const checkbox = await screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" });
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Gỡ sản phẩm (1)" }));
  const dialog = within(screen.getByRole("dialog"));
  mocks.linked.mockResolvedValue(linkedResult([{ ...linkedProduct, version: 3 }]));
  fireEvent.click(dialog.getByRole("button", { name: "Gỡ sản phẩm" }));
  expect(await dialog.findByText(/Xem dữ liệu mới và chọn lại sản phẩm/)).toBeVisible();
  expect(dialog.queryByRole("button", { name: "Gỡ sản phẩm" })).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Đóng và xem lại" }));
  await waitFor(() => expect(checkbox).toBeEnabled());
  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Gỡ sản phẩm" })).toBeDisabled();
  expect(mocks.linked).toHaveBeenCalledTimes(2);
  expect(mocks.bulkRemove).toHaveBeenCalledTimes(1);
  fireEvent.click(checkbox);
  expect(screen.getByRole("button", { name: "Gỡ sản phẩm (1)" })).toBeEnabled();
});

it("uses server-provided supply shortfall quantities for the matched product", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.bulkRemove.mockRejectedValueOnce(
    fail("farm_product_supply_shortfall", 409, {
      item_index: 0,
      product_id: "product-1",
      required_units: 17,
      remaining_units: 6,
      shortfall_units: 11,
    }),
  );
  view(<FarmProducts farm={farm} />, "en");
  fireEvent.click(await screen.findByRole("checkbox", { name: "Select Water spinach (RAU-01)" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove products (1)" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: "Remove products" }));
  expect(await dialog.findByText("No products were removed.")).toBeVisible();
  expect(dialog.getByText(/Water spinach.*RAU-01/)).toBeVisible();
  expect(dialog.getByText(/holding 17 units.*cover 6 units.*Add 11 units/)).toBeVisible();
});

it.each(["post", "receipt"])(
  "retires selected Farm product data when the removal %s loses access",
  async (request) => {
    mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
    mocks.bulkRemove.mockRejectedValueOnce(
      request === "post" ? fail("forbidden", 403) : fail("request_timeout", 408),
    );
    mocks.recoverBulkRemove.mockRejectedValueOnce(fail("session_expired", 401));
    const onAccessLost = vi.fn();
    view(<FarmProducts farm={farm} onAccessLost={onAccessLost} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Chọn Rau muống (RAU-01)" }));
    fireEvent.click(screen.getByRole("button", { name: "Gỡ sản phẩm (1)" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ sản phẩm" }),
    );
    if (request === "receipt")
      fireEvent.click(await screen.findByRole("button", { name: "Kiểm tra biên nhận" }));
    await waitFor(() => expect(onAccessLost).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Rau muống")).not.toBeInTheDocument();
    expect(screen.queryByText(/Đã gỡ 1 sản phẩm/)).not.toBeInTheDocument();
  },
);

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

    expect(screen.getByRole("link", { name: "Bổ sung nguồn cung" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
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
    expect(screen.getByRole("link", { name: "Bổ sung nguồn cung" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const readsBeforeReview = mocks.batches.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
    expect(await screen.findByText(/Dữ liệu hiện tại khớp/)).toBeVisible();
    expect(mocks.batches).toHaveBeenCalledTimes(readsBeforeReview);
    fireEvent.click(screen.getByRole("button", { name: "Đóng và xem lại" }));
    expect(screen.getByRole("link", { name: "Bổ sung nguồn cung" })).not.toHaveAttribute(
      "aria-disabled",
    );
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
  expect(screen.getByRole("link", { name: "Bổ sung nguồn cung" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  await waitFor(() => expect(mocks.batches).toHaveBeenCalledTimes(4));
  expect(await screen.findByText(/Chưa đủ dữ liệu/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Bổ sung nguồn cung" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  mocks.source.mockResolvedValueOnce({ ...supplying, version: 4, supply_generation: 2 });
  mocks.batches.mockResolvedValue(linkedResult([]));
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  expect(await screen.findByText(/Dữ liệu đã thay đổi/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Bổ sung nguồn cung" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Đóng và xem lại" }));
  expect(screen.getByRole("link", { name: "Bổ sung nguồn cung" })).not.toHaveAttribute(
    "aria-disabled",
  );
  expect(mocks.cancelBatch).toHaveBeenCalledTimes(1);
});

it("puts link controls first in Information and retains recovery across tabs", async () => {
  mocks.farmerLink
    .mockReset()
    .mockResolvedValueOnce({ farm_id: "farm-1", url: `/farmer#token=${"A".repeat(43)}` })
    .mockRejectedValueOnce(new Error("request_timeout"))
    .mockResolvedValue({ farm_id: "farm-1", url: `/farmer#token=${"A".repeat(43)}` });
  view(<FarmDetail farmId="farm-1" />);
  const products = await screen.findByRole("tab", { name: "Sản phẩm cung cấp" });
  const information = screen.getByRole("tab", { name: "Thông tin" });
  expect(screen.queryByRole("heading", { name: "URL nhập sản phẩm" })).not.toBeInTheDocument();
  fireEvent.click(information);
  const infoPanel = screen.getByRole("tabpanel", { name: "Thông tin" });
  const heading = within(infoPanel).getByRole("heading", { name: "URL nhập sản phẩm" });
  const url = await within(infoPanel).findByRole("textbox", { name: "URL nhập sản phẩm" });
  const save = within(infoPanel).getByRole("button", { name: "Lưu thay đổi" });
  expect(heading.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const linkGroup = within(infoPanel).getByRole("region", { name: "URL nhập sản phẩm" });
  expect(linkGroup.parentElement?.firstElementChild).toBe(linkGroup);
  expect(url.closest("form")).toBeNull();
  fireEvent.click(within(infoPanel).getByRole("button", { name: "Đổi link" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đổi link" }));
  expect(
    await within(infoPanel).findByRole("button", { name: "Kiểm tra link hiện tại" }),
  ).toBeVisible();
  fireEvent.click(products);
  expect(screen.queryByRole("heading", { name: "URL nhập sản phẩm" })).not.toBeInTheDocument();
  const deleteDialog = within(await openFarmAction());
  expect(deleteDialog.getByText(/kiểm tra URL nhập sản phẩm trong tab Thông tin/u)).toBeVisible();
  expect(deleteDialog.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  fireEvent.click(deleteDialog.getByRole("button", { name: "Đóng" }));
  fireEvent.click(information);
  expect(await screen.findByRole("button", { name: "Kiểm tra link hiện tại" })).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "URL nhập sản phẩm" })).not.toBeInTheDocument();
  expect(mocks.farmerLink.mock.calls.filter(([, action]) => action === "rotate")).toHaveLength(1);
});
