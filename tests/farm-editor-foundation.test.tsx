import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmEditor } from "@/components/farm-editor";
import { ToastProvider } from "@/components/toast-provider";
import type { Farm } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  deleteImage: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("@/lib/farms-api", () => ({
  getFarm: mocks.get,
  saveFarm: mocks.save,
  uploadFarmImage: mocks.upload,
  deleteFarmImage: mocks.deleteImage,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () => mocks.search,
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
  in_stock_product_count: 0,
  out_of_stock_product_count: 0,
  version: 2,
  created_at: "2026-01-01",
  updated_at: "2026-10-15",
};

function Breadcrumbs() {
  const items = useAdminBreadcrumbs([]);
  return (
    <nav aria-label="Đường dẫn điều hướng">
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
  );
}

function page(farmId?: string, session = "session-a") {
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminBreadcrumbProvider
          key={session}
          pathname={farmId ? `/farms/${farmId}/edit` : "/farms/new"}
          search={mocks.search.toString()}
        >
          <Breadcrumbs />
          <AdminQueryProvider>
            <FarmEditor farmId={farmId} />
          </AdminQueryProvider>
        </AdminBreadcrumbProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
}

const crumbs = () => within(screen.getByRole("navigation"));
const filters = "search=rau&is_active=false&page=3";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.search = new URLSearchParams();
  mocks.get.mockResolvedValue(farm);
});
afterEach(cleanup);

it("keeps create navigation in the filtered Farm list context", async () => {
  mocks.search = new URLSearchParams(filters);
  mocks.save.mockResolvedValue(farm);
  render(page());

  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(crumbs().getByText("Thêm trang trại")).toBeVisible();
  expect(crumbs().getByRole("link", { name: "Danh sách trang trại" })).toHaveAttribute(
    "href",
    `/farms?${filters}`,
  );
  expect(screen.getByRole("link", { name: "Hủy" })).toHaveAttribute("href", `/farms?${filters}`);
  expect(screen.getAllByRole("link")).toHaveLength(2);
  expect(mocks.get).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Tên nông trại *"), { target: { value: farm.name_vi } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: farm.location_vi } });
  fireEvent.click(screen.getByRole("tab", { name: /English/ }));
  fireEvent.change(screen.getByLabelText("Tên nông trại *"), { target: { value: farm.name_en } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: farm.location_en } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Tạo trang trại" })));

  expect(mocks.replace).toHaveBeenCalledWith(`/farms/farm-1?${filters}`);
});

it("keeps the saved Farm name in the edit breadcrumb while typing and returns to the same detail tab", async () => {
  const detailQuery = `${filters}&view=tracker&tab=information`;
  mocks.search = new URLSearchParams(detailQuery);
  mocks.save.mockResolvedValue(farm);
  render(page(farm.id));

  expect(await crumbs().findByRole("link", { name: farm.name_vi })).toHaveAttribute(
    "href",
    `/farms/farm-1?${detailQuery}`,
  );
  expect(crumbs().getByRole("link", { name: "Danh sách trang trại" })).toHaveAttribute(
    "href",
    `/farms?${filters}&tab=tracker`,
  );
  expect(crumbs().getByText("Chỉnh sửa")).toBeVisible();
  expect(screen.getByRole("link", { name: "Hủy" })).toHaveAttribute(
    "href",
    `/farms/farm-1?${detailQuery}`,
  );
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

  fireEvent.change(screen.getByLabelText("Tên nông trại *"), { target: { value: "Tên nháp" } });
  expect(crumbs().getByRole("link", { name: farm.name_vi })).toBeVisible();
  expect(crumbs().queryByText("Tên nháp")).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" })));
  expect(mocks.replace).toHaveBeenCalledWith(`/farms/farm-1?${detailQuery}`);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

it.each([401, 403, 404])(
  "clears the Farm name and form after a %s save response",
  async (status) => {
    mocks.save.mockRejectedValue(Object.assign(new Error("request_failed"), { status }));
    render(page(farm.id));

    expect(await crumbs().findByRole("link", { name: farm.name_vi })).toBeVisible();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" })));
    expect(crumbs().getByRole("link", { name: "Chi tiết trang trại" })).toBeVisible();
    expect(crumbs().queryByRole("link", { name: farm.name_vi })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(farm.name_vi)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeVisible();
  },
);

it("does not apply a pending save after the protected session is replaced", async () => {
  let finishSave!: (value: Farm) => void;
  let finishLoad!: (value: Farm) => void;
  const asset = { id: "staged", url: "/staged.webp", width: 100, height: 100, variants: [] };
  mocks.upload.mockResolvedValue(asset);
  mocks.deleteImage.mockResolvedValue(undefined);
  mocks.save.mockReturnValue(
    new Promise<Farm>((resolve) => {
      finishSave = resolve;
    }),
  );
  const { rerender } = render(page(farm.id));
  expect(await crumbs().findByRole("link", { name: farm.name_vi })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
    target: { files: [new File(["image"], "staged.webp", { type: "image/webp" })] },
  });
  await screen.findByText("1/12");
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

  mocks.get.mockReturnValue(
    new Promise<Farm>((resolve) => {
      finishLoad = resolve;
    }),
  );
  rerender(page(farm.id, "session-b"));
  expect(crumbs().getByRole("link", { name: "Chi tiết trang trại" })).toBeVisible();
  expect(mocks.deleteImage).not.toHaveBeenCalled();

  await act(async () => finishSave({ ...farm, photos: [asset] }));
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(crumbs().queryByRole("link", { name: farm.name_vi })).not.toBeInTheDocument();
  await act(async () => finishLoad({ ...farm, name_vi: "Trang trại mới" }));
  expect(crumbs().getByRole("link", { name: "Trang trại mới" })).toBeVisible();
});

it("ignores an old load when the editor opens a different Farm", async () => {
  let finishOldLoad!: (value: Farm) => void;
  mocks.get.mockReturnValueOnce(
    new Promise<Farm>((resolve) => {
      finishOldLoad = resolve;
    }),
  );
  const nextFarm = { ...farm, id: "farm-2", name_vi: "Nông trại mới" };
  mocks.get.mockResolvedValueOnce(nextFarm);

  const { rerender } = render(page(farm.id));
  expect(crumbs().getByRole("link", { name: "Chi tiết trang trại" })).toBeVisible();
  const oldSignal: AbortSignal = mocks.get.mock.calls[0][1];
  rerender(page(nextFarm.id));

  expect(await crumbs().findByRole("link", { name: nextFarm.name_vi })).toBeVisible();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishOldLoad(farm));
  expect(crumbs().getByRole("link", { name: nextFarm.name_vi })).toBeVisible();
  expect(screen.queryByDisplayValue(farm.name_vi)).not.toBeInTheDocument();
});

it("keeps save locked while the successful return navigation is pending", async () => {
  mocks.save.mockResolvedValue(farm);
  render(page(farm.id));

  const save = await screen.findByRole("button", { name: "Lưu thay đổi" });
  await act(async () => fireEvent.click(save));
  expect(mocks.replace).toHaveBeenCalledWith("/farms/farm-1");
  expect(save).toBeDisabled();

  await act(async () => fireEvent.submit(save.closest("form")!));
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
