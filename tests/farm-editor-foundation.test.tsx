import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, type Ref } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmEditor } from "@/components/farm-editor";
import { ToastProvider } from "@/components/toast-provider";
import type { Farm, MediaAsset } from "@/lib/types";

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

function page(farmId?: string, session = "session-a", scope?: Ref<() => void>, editorOpen = true) {
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminBreadcrumbProvider
          key={session}
          pathname={farmId ? `/farms/${farmId}/edit` : "/farms/new"}
          search={mocks.search.toString()}
        >
          <Breadcrumbs />
          <AdminQueryProvider ref={scope}>
            {editorOpen && <FarmEditor farmId={farmId} />}
          </AdminQueryProvider>
        </AdminBreadcrumbProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
}

function renderEditor(farmId?: string) {
  const rendered = render(page(farmId));
  return { close: () => rendered.rerender(page(farmId, "session-a", undefined, false)) };
}

const crumbs = () => within(screen.getByRole("navigation"));
const filters = "search=rau&is_active=false&page=3";
const cover: MediaAsset = {
  id: "cover",
  url: "/cover.webp",
  width: 100,
  height: 100,
  variants: [],
};
const album: MediaAsset = { ...cover, id: "album", url: "/album.webp" };
const otherUpload: MediaAsset = { ...cover, id: "unconfirmed", url: "/unconfirmed.webp" };
const problem = (message: string, status?: number) => Object.assign(new Error(message), { status });

function fillNewFarm() {
  fireEvent.change(screen.getByLabelText("Tên trang trại *"), { target: { value: farm.name_vi } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: farm.location_vi } });
  fireEvent.click(screen.getByRole("tab", { name: /English/ }));
  fireEvent.change(screen.getByLabelText("Tên trang trại *"), { target: { value: farm.name_en } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: farm.location_en } });
}

async function uploadPhotos(...photos: MediaAsset[]) {
  for (const photo of photos) mocks.upload.mockResolvedValueOnce(photo);
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
    target: {
      files: photos.map((photo) => new File(["image"], `${photo.id}.webp`, { type: "image/webp" })),
    },
  });
  await screen.findByText(`${photos.length}/12`);
}

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

  fillNewFarm();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Tạo trang trại" })));

  expect(mocks.replace).toHaveBeenCalledWith(`/farms/farm-1?${filters}`);
});

it("keeps the saved Farm name in the edit breadcrumb while typing and returns to the same detail tab", async () => {
  const detailQuery = `${filters}&tab=information`;
  mocks.search = new URLSearchParams(`${detailQuery}&view=tracker`);
  mocks.save.mockResolvedValue({ ...farm, version: 3 });
  render(page(farm.id));

  expect(await crumbs().findByRole("link", { name: farm.name_vi })).toHaveAttribute(
    "href",
    `/farms/farm-1?${detailQuery}`,
  );
  expect(crumbs().getByRole("link", { name: "Danh sách trang trại" })).toHaveAttribute(
    "href",
    `/farms?${filters}`,
  );
  expect(crumbs().getByText("Chỉnh sửa")).toBeVisible();
  expect(screen.getByRole("link", { name: "Hủy" })).toHaveAttribute(
    "href",
    `/farms/farm-1?${detailQuery}`,
  );
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

  fireEvent.change(screen.getByLabelText("Tên trang trại *"), { target: { value: "Tên nháp" } });
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

  await act(async () => finishSave({ ...farm, image: asset, photos: [asset], version: 3 }));
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(crumbs().queryByRole("link", { name: farm.name_vi })).not.toBeInTheDocument();
  await act(async () => finishLoad({ ...farm, name_vi: "Trang trại mới" }));
  expect(crumbs().getByRole("link", { name: "Trang trại mới" })).toBeVisible();
});

it("hides the Farm draft and saved name if the query scope has retired before rerender", async () => {
  const scope = createRef<() => void>();
  const { rerender } = render(page(farm.id, "session-a", scope));
  fireEvent.change(await screen.findByDisplayValue(farm.name_vi), {
    target: { value: "Dữ liệu bản nháp cần bảo vệ" },
  });
  act(() => scope.current?.());
  rerender(page(farm.id, "session-a", scope));

  expect(screen.queryByDisplayValue("Dữ liệu bản nháp cần bảo vệ")).not.toBeInTheDocument();
  expect(crumbs().queryByRole("link", { name: farm.name_vi })).not.toBeInTheDocument();
  expect(crumbs().getByRole("link", { name: "Chi tiết trang trại" })).toBeVisible();
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
  mocks.save.mockResolvedValue({ ...farm, version: 3 });
  render(page(farm.id));

  const save = await screen.findByRole("button", { name: "Lưu thay đổi" });
  await act(async () => fireEvent.click(save));
  expect(mocks.replace).toHaveBeenCalledWith("/farms/farm-1");
  expect(save).toBeDisabled();

  await act(async () => fireEvent.submit(save.closest("form")!));
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it.each([
  ["network_error", undefined],
  ["request_timeout", undefined],
  ["request_failed", 408],
  ["server_error", 502],
  ["invalid_response", 201],
])("keeps an uncertain POST locked for manual lookup after %s (%s)", async (message, status) => {
  mocks.search = new URLSearchParams(filters);
  mocks.save.mockRejectedValueOnce(problem(message, status));
  mocks.deleteImage.mockResolvedValue(undefined);
  const editor = renderEditor();
  fillNewFarm();
  await uploadPhotos(cover, album);

  const save = screen.getByRole("button", { name: "Tạo trang trại" });
  await act(async () => fireEvent.click(save));
  expect(screen.getByDisplayValue(farm.name_en)).toBeVisible();
  expect(screen.getByRole("link", { name: "Kiểm tra danh sách trang trại" })).toHaveAttribute(
    "href",
    `/farms?search=${encodeURIComponent(farm.name_vi).replace(/%20/g, "+")}`,
  );
  expect(save).toBeDisabled();
  await act(async () => fireEvent.submit(save.closest("form")!));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Hủy" })).not.toHaveAttribute("aria-disabled");
  editor.close();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("retains the edit draft and protects submitted photos through stale and failed verification", async () => {
  mocks.get.mockResolvedValueOnce(farm);
  mocks.get.mockRejectedValueOnce(problem("server_error", 502));
  mocks.get.mockRejectedValueOnce(problem("invalid_response"));
  mocks.get.mockResolvedValueOnce({ ...farm, version: 1 });
  mocks.get.mockResolvedValueOnce(farm);
  mocks.save.mockRejectedValueOnce(problem("request_timeout"));
  mocks.deleteImage.mockResolvedValue(undefined);
  const editor = renderEditor(farm.id);
  fireEvent.change(await screen.findByDisplayValue(farm.name_vi), {
    target: { value: "Bản nháp sau timeout" },
  });
  await uploadPhotos(cover, album);

  const save = screen.getByRole("button", { name: "Lưu thay đổi" });
  await act(async () => fireEvent.click(save));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" })),
    );
    expect(screen.getByDisplayValue("Bản nháp sau timeout")).toBeVisible();
    expect(screen.getByText("2/12")).toBeVisible();
    expect(save).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Dùng phiên bản mới nhất" }),
    ).not.toBeInTheDocument();
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  }
  await act(async () => fireEvent.submit(save.closest("form")!));
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
    farm.id,
    expect.objectContaining({ version: 2, photo_ids: [cover.id, album.id] }),
  );
  expect(mocks.get).toHaveBeenCalledTimes(5);
  editor.close();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("requires explicit adoption of a newer Farm before saving again and preserves potentially attached photos", async () => {
  const latest = {
    ...farm,
    version: 3,
    name_vi: "Bản trên máy chủ",
    image: cover,
    photos: [cover, album],
  };
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(latest);
  mocks.save
    .mockRejectedValueOnce(problem("network_error"))
    .mockResolvedValueOnce({ ...latest, version: 4 });
  mocks.deleteImage.mockResolvedValue(undefined);
  const editor = renderEditor(farm.id);
  fireEvent.change(await screen.findByDisplayValue(farm.name_vi), {
    target: { value: "Giữ nguyên bản nháp" },
  });
  await uploadPhotos(cover, album, otherUpload);

  const save = screen.getByRole("button", { name: "Lưu thay đổi" });
  await act(async () => fireEvent.click(save));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" })),
  );
  expect(screen.getByDisplayValue("Giữ nguyên bản nháp")).toBeVisible();
  expect(screen.getByText("3/12")).toBeVisible();
  expect(save).toBeDisabled();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.deleteImage).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Dùng phiên bản mới nhất" }));
  expect(screen.getByDisplayValue(latest.name_vi)).toBeVisible();
  expect(screen.getByText("2/12")).toBeVisible();
  expect(save).toBeEnabled();
  await act(async () => fireEvent.click(save));
  expect(mocks.save).toHaveBeenLastCalledWith(
    farm.id,
    expect.objectContaining({ version: 3, photo_ids: [cover.id, album.id] }),
  );
  expect(mocks.replace).toHaveBeenCalledWith("/farms/farm-1");
  editor.close();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("allows another attempt and cleans unneeded photos after a definite validation rejection", async () => {
  mocks.save.mockRejectedValueOnce(problem("validation_error", 400));
  mocks.deleteImage.mockResolvedValue(undefined);
  const editor = renderEditor(farm.id);
  const save = await screen.findByRole("button", { name: "Lưu thay đổi" });
  await uploadPhotos(cover, album);

  await act(async () => fireEvent.click(save));
  expect(screen.getByText("2/12")).toBeVisible();
  expect(save).toBeEnabled();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  editor.close();
  expect(mocks.deleteImage.mock.calls).toEqual([
    [cover.id, { keepalive: true }],
    [album.id, { keepalive: true }],
  ]);
});

it("does not clean a submitted image during unmount or after the pending PATCH times out", async () => {
  let rejectSave!: (error: Error) => void;
  mocks.save.mockReturnValueOnce(
    new Promise<Farm>((_resolve, reject) => {
      rejectSave = reject;
    }),
  );
  mocks.deleteImage.mockResolvedValue(undefined);
  const editor = renderEditor(farm.id);
  const save = await screen.findByRole("button", { name: "Lưu thay đổi" });
  await uploadPhotos(cover);
  fireEvent.click(save);
  fireEvent.submit(save.closest("form")!);

  editor.close();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  await act(async () => rejectSave(problem("upstream_timeout", 504)));
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("does not clean a late upload using the replacement session", async () => {
  let finishUpload!: (value: MediaAsset) => void;
  mocks.upload.mockReturnValueOnce(
    new Promise<MediaAsset>((resolve) => {
      finishUpload = resolve;
    }),
  );
  mocks.deleteImage.mockResolvedValue(undefined);
  const { rerender } = render(page());
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
    target: { files: [new File(["image"], "cover.webp", { type: "image/webp" })] },
  });
  rerender(page(undefined, "session-b"));

  await act(async () => finishUpload(cover));
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  expect(screen.getByText("0/12")).toBeVisible();
});
