import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { FarmList } from "@/components/farm-list";
import { FarmEditor } from "@/components/farm-editor";
import { FarmProducts } from "@/components/farm-products";
import { FarmDetail } from "@/components/farm-detail";
import { FarmWeeklySupply } from "@/components/farm-weekly-supply";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ToastProvider } from "@/components/toast-provider";
import type { AvailableFarmProduct, Farm, FarmProduct } from "@/lib/types";

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
  supplies: vi.fn(),
  setSupply: vi.fn(),
  available: vi.fn(),
  removeFarm: vi.fn(),
  tracker: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
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
  listFarmWeeklySupplies: mocks.supplies,
  setFarmWeeklySupply: mocks.setSupply,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const farm: Farm = {
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
  version: 2,
  created_at: "2026-01-01",
  updated_at: "2026-10-15",
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
};
function linkedResult(data: FarmProduct[], page = 1, total = data.length) {
  return { data, meta: { page, page_size: 20, total } };
}
function view(node: React.ReactNode) {
  return render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>{node}</ToastProvider>
    </AdminI18nProvider>,
  );
}
function WeeklySupplyWithDrafts() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <FarmWeeklySupply
      farmId="farm-1"
      product={linkedProduct}
      initialWeek="2026-10-19"
      drafts={drafts}
      onDraftChange={(week, value) => setDrafts((current) => ({ ...current, [week]: value }))}
      onDraftSaved={(week, savedValue) =>
        setDrafts((current) => {
          if (current[week] !== savedValue) return current;
          const next = { ...current };
          delete next[week];
          return next;
        })
      }
    />
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
  mocks.supplies.mockResolvedValue([]);
  mocks.tracker.mockResolvedValue({ signup_count: 24 });
});
afterEach(cleanup);

it("lists canonical Farms with search and status without fetching tracker data", async () => {
  view(<FarmList />);
  expect(await screen.findByText("Nông trại Xanh")).toBeVisible();
  expect(screen.getByText("15/10/2026")).toBeVisible();
  expect(screen.getByRole("link", { name: /Nông trại Xanh/ })).toHaveAttribute(
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
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
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

it("shows the canonical Farm detail with links to editing, products and Growth Tracker", async () => {
  view(<FarmDetail farmId="farm-1" />);
  expect(await screen.findByRole("heading", { name: "Nông trại Xanh" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sửa thông tin" })).toHaveAttribute(
    "href",
    "/farms/farm-1/edit",
  );
  fireEvent.click(screen.getByRole("button", { name: "Xóa trang trại" }));
  expect(screen.getByRole("dialog", { name: "Xóa trang trại" })).toBeVisible();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  expect(screen.queryByRole("heading", { name: "Sản phẩm cung cấp" })).not.toBeInTheDocument();
  expect(mocks.linked).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Quản lý Growth Tracker" })).toHaveAttribute(
    "href",
    "/tracker-farms/farm-1",
  );
  expect(screen.queryByRole("button", { name: "Thêm sản phẩm" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Sản phẩm & số lượng" }));
  expect(await screen.findByRole("button", { name: "Thêm sản phẩm" })).toBeVisible();
  await waitFor(() => expect(mocks.linked).toHaveBeenCalledWith("farm-1", { page: 1, search: "" }));
});

it("moves Farm detail tabs with arrow, Home and End keys", async () => {
  view(<FarmDetail farmId="farm-1" />);
  const overview = await screen.findByRole("tab", { name: "Tổng quan" });
  const products = screen.getByRole("tab", { name: "Sản phẩm & số lượng" });
  expect(overview).toHaveAttribute("tabindex", "0");
  expect(products).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(overview, { key: "ArrowRight" });
  expect(products).toHaveFocus();
  expect(products).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(products, { key: "Home" });
  expect(overview).toHaveFocus();
  expect(overview).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(overview, { key: "End" });
  expect(products).toHaveFocus();
});

it("keeps unsaved weekly quantities when the Admin language changes", async () => {
  view(
    <>
      <LanguageSwitcher />
      <WeeklySupplyWithDrafts />
    </>,
  );
  const quantity = await screen.findByLabelText("Số lượng tuần 19/10/2026");
  expect(screen.getByText("19/10/2026 — 07/12/2026")).toBeVisible();
  fireEvent.change(quantity, { target: { value: "17" } });
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByLabelText("Quantity week 19/10/2026")).toHaveValue(17);
  expect(mocks.supplies).toHaveBeenCalledTimes(1);
});

it("opens the current Vietnam week even when the admin browser is still on Sunday", () => {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T02:00:00Z"));
  try {
    view(
      <FarmWeeklySupply
        farmId="farm-1"
        product={linkedProduct}
        drafts={{}}
        onDraftChange={() => undefined}
        onDraftSaved={() => undefined}
      />,
    );
    expect(screen.getByText("19/10/2026 — 07/12/2026")).toBeVisible();
  } finally {
    vi.useRealTimers();
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

it("explains when a Product was deactivated after catalog selection", async () => {
  mocks.add.mockRejectedValue(Object.assign(new Error("product_inactive"), { status: 409 }));
  view(<FarmProducts farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thêm sản phẩm" }));
  const dialog = screen.getByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" });
  fireEvent.click(await within(dialog).findByRole("button", { name: "Thêm sản phẩm" }));
  expect(await within(dialog).findByText(/đã tắt hoạt động/)).toBeVisible();
});

it("keeps an unsaved weekly quantity when moving away and back eight weeks", async () => {
  view(<WeeklySupplyWithDrafts />);
  const quantity = await screen.findByLabelText("Số lượng tuần 19/10/2026");
  fireEvent.change(quantity, { target: { value: "17" } });
  fireEvent.click(screen.getByRole("button", { name: "8 tuần sau" }));
  await waitFor(() => expect(mocks.supplies).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "8 tuần trước" }));
  expect(await screen.findByLabelText("Số lượng tuần 19/10/2026")).toHaveValue(17);
});

it("keeps an unsaved weekly quantity when switching Farm detail tabs", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  view(<FarmDetail farmId="farm-1" />);
  fireEvent.click(await screen.findByRole("tab", { name: "Sản phẩm & số lượng" }));
  fireEvent.click(await screen.findByRole("button", { name: /Số lượng theo tuần Rau muống/ }));
  const quantity = (await screen.findAllByRole("spinbutton"))[0];
  fireEvent.change(quantity, { target: { value: "23" } });
  fireEvent.click(screen.getByRole("tab", { name: "Tổng quan" }));
  fireEvent.click(screen.getByRole("tab", { name: "Sản phẩm & số lượng" }));
  expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(23);
  expect(mocks.supplies).toHaveBeenCalledTimes(1);
});

it("keeps product-specific drafts when switching the open Farm product", async () => {
  const second = {
    ...linkedProduct,
    id: "link-2",
    product_id: "product-2",
    sku: "RAU-02",
    name_vi: "Cải xanh",
  };
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct, second]));
  view(<FarmProducts farmId="farm-1" initialWeek="2026-10-19" />);
  fireEvent.click(await screen.findByRole("button", { name: "Số lượng theo tuần Rau muống" }));
  fireEvent.change(await screen.findByLabelText("Số lượng tuần 19/10/2026"), {
    target: { value: "17" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Số lượng theo tuần Cải xanh" }));
  expect(await screen.findByLabelText("Số lượng tuần 19/10/2026")).toHaveValue(null);
  fireEvent.click(screen.getByRole("button", { name: "Số lượng theo tuần Rau muống" }));
  expect(await screen.findByLabelText("Số lượng tuần 19/10/2026")).toHaveValue(17);
});

it("shows zero Growth Tracker signups without treating an existing profile as missing", async () => {
  mocks.tracker.mockResolvedValue({ signup_count: 0 });
  view(<FarmDetail farmId="farm-1" />);
  expect(await screen.findByText("0 người đăng ký")).toBeVisible();
  expect(screen.queryByText("Chưa bật profile Growth Tracker")).not.toBeInTheDocument();
});

it("links a catalog Product and edits quantity as sale units for a Monday", async () => {
  mocks.add.mockResolvedValue({
    id: "link-1",
    farm_id: "farm-1",
    product_id: "product-1",
    sku: "RAU-01",
    is_active: true,
  });
  mocks.linked
    .mockResolvedValueOnce(linkedResult([]))
    .mockResolvedValueOnce(linkedResult([linkedProduct]));
  mocks.setSupply.mockResolvedValue({ week_start: "2026-10-19", quantity_units: 10 });
  view(<FarmProducts farmId="farm-1" initialWeek="2026-10-19" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Thêm sản phẩm" })).toBeEnabled());
  expect(mocks.available).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Thêm sản phẩm" }));
  await waitFor(() =>
    expect(mocks.available).toHaveBeenCalledWith("farm-1", { page: 1, search: "" }),
  );
  expect(await screen.findByRole("option", { name: "Rau muống · RAU-01" })).toBeVisible();
  const addDialog = screen.getByRole("dialog", { name: "Thêm sản phẩm từ Cửa hàng" });
  fireEvent.click(within(addDialog).getByRole("button", { name: "Thêm sản phẩm" }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledWith("farm-1", "product-1"));
  fireEvent.click(await screen.findByRole("button", { name: /Số lượng theo tuần/ }));
  expect(await screen.findByText("500 gói", { selector: "strong" })).toBeVisible();
  expect(screen.queryByLabelText("Số lượng tuần 16/11/2026")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xem đủ 8 tuần" }));
  expect(screen.getByLabelText("Số lượng tuần 16/11/2026")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Số lượng tuần 19/10/2026"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu tuần 19/10/2026" }));
  await waitFor(() =>
    expect(mocks.setSupply).toHaveBeenCalledWith("farm-1", "product-1", "2026-10-19", 10),
  );
});

it("confirms removing a Farm product and keeps a protected supply link", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.removeLink.mockRejectedValue(
    Object.assign(new Error("farm_product_has_supply"), { status: 409 }),
  );
  view(<FarmProducts farmId="farm-1" />);
  expect(await screen.findByText("Rau muống", { selector: "strong" })).toBeVisible();
  fireEvent.click(screen.getByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("button", { name: "Gỡ sản phẩm" }));
  expect(mocks.removeLink).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog", { name: "Gỡ sản phẩm" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Gỡ sản phẩm" }));
  expect(await within(dialog).findByText(/đã có số lượng theo tuần/)).toBeVisible();
});

it("explains a concurrent product-link change without claiming weekly supply history", async () => {
  mocks.linked.mockResolvedValue(linkedResult([linkedProduct]));
  mocks.removeLink.mockRejectedValue(
    Object.assign(new Error("farm_product_changed"), { status: 409 }),
  );
  view(<FarmProducts farmId="farm-1" />);
  expect(await screen.findByText("Rau muống", { selector: "strong" })).toBeVisible();
  fireEvent.click(screen.getByLabelText("Tùy chọn khác: Rau muống"));
  fireEvent.click(screen.getByRole("button", { name: "Gỡ sản phẩm" }));
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

it("removes a discarded temporary Farm image after reloading a version conflict", async () => {
  const temp = { id: "temp-1", url: "/temp.webp", width: 100, height: 100, variants: [] };
  mocks.upload.mockResolvedValue(temp);
  mocks.deleteImage.mockResolvedValue(undefined);
  mocks.save
    .mockRejectedValueOnce(Object.assign(new Error("version_conflict"), { status: 409 }))
    .mockResolvedValueOnce({ ...farm, version: 3 });
  view(<FarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
    target: { files: [new File(["image"], "farm.webp", { type: "image/webp" })] },
  });
  expect(await screen.findByRole("button", { name: "Chọn ảnh số 1" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  expect(await screen.findByRole("button", { name: "Tải lại dữ liệu" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Tải lại dữ liệu" }));
  await waitFor(() => expect(mocks.deleteImage).toHaveBeenCalledWith("temp-1"));
  expect(await screen.findByDisplayValue("Nông trại Xanh")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
});

it("cleans an image upload that finishes after the Farm editor closes", async () => {
  let finish!: (value: {
    id: string;
    url: string;
    width: number;
    height: number;
    variants: [];
  }) => void;
  mocks.upload.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mocks.deleteImage.mockResolvedValue(undefined);
  const rendered = view(<FarmEditor />);
  const file = new File(["image"], "farm.webp", { type: "image/webp" });
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), { target: { files: [file] } });
  expect(mocks.upload).toHaveBeenCalledWith(file);
  rendered.unmount();
  finish({ id: "orphan-1", url: "/farm.webp", width: 100, height: 100, variants: [] });
  await waitFor(() =>
    expect(mocks.deleteImage).toHaveBeenCalledWith("orphan-1", { keepalive: true }),
  );
});
