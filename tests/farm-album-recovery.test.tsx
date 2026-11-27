import { focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AdminBreadcrumbProvider } from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmDetail } from "@/components/farm-detail";
import { ToastProvider } from "@/components/toast-provider";
import type { Farm, MediaAsset } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  getTracker: vi.fn(),
  upload: vi.fn(),
  deleteImage: vi.fn(),
  search: new URLSearchParams("tab=information"),
}));

// The independent link section has its own tests; provide its confirmed read here.
vi.mock("@/lib/farm-supply-request-api", () => ({
  farmerLink: vi.fn(async (farmId: string) => ({
    farm_id: farmId,
    url: `/farmer#token=${"A".repeat(43)}`,
  })),
}));

vi.mock("@/lib/farms-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/farms-api")>()),
  getFarm: mocks.get,
  saveFarm: mocks.save,
  getFarmTracker: mocks.getTracker,
  uploadFarmImage: mocks.upload,
  deleteFarmImage: mocks.deleteImage,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mocks.search,
}));

function photo(id: string): MediaAsset {
  return { id, url: `/${id}.webp`, width: 160, height: 160, variants: [] };
}

const a = photo("a");
const b = photo("b");
const c = photo("c");
const d = photo("d");
const farm: Farm = {
  id: "farm-1",
  name_vi: "Nông trại Xanh",
  name_en: "Green Farm",
  location_vi: "Đà Lạt",
  location_en: "Da Lat",
  contact_phone: "",
  description_vi: "Rau sạch",
  description_en: "Organic greens",
  image: a,
  photos: [a, b, c],
  is_active: true,
  in_stock_product_count: 0,
  out_of_stock_product_count: 0,
  version: 2,
  created_at: "2026-01-01",
  updated_at: "2026-10-15",
};
const draftText = "Mô tả đang chỉnh sửa";

const save = () => screen.getByRole("button", { name: "Lưu thay đổi" });
const click = async (element: HTMLElement) => act(async () => fireEvent.click(element));
const album = () => within(screen.getByRole("region", { name: "Ảnh trang trại" }));
const imageSources = (scope: ReturnType<typeof within>) =>
  scope.getAllByRole("img").map((image: HTMLElement) => image.getAttribute("src"));
const albumSources = () => imageSources(album());
const problem = (message: string, status: number) => Object.assign(new Error(message), { status });

function withAlbum(photos: MediaAsset[], version: number): Farm {
  return { ...farm, version, image: photos[0] ?? null, photos };
}

function resolveFarmSave(result: Farm) {
  mocks.save.mockImplementationOnce(async () => {
    mocks.get.mockResolvedValue(result);
    return result;
  });
}

async function openInformation() {
  const rendered = render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminBreadcrumbProvider pathname={`/farms/${farm.id}`} search={mocks.search.toString()}>
          <AdminQueryProvider>
            <FarmDetail farmId={farm.id} />
          </AdminQueryProvider>
        </AdminBreadcrumbProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Số người đăng ký 1 tháng")).toBeEnabled());
  return rendered;
}

function editDescription() {
  fireEvent.change(screen.getByDisplayValue(farm.description_vi), { target: { value: draftText } });
}

async function refocusWindow() {
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(farm);
  mocks.getTracker.mockRejectedValue(problem("not_found", 404));
  mocks.deleteImage.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
});

it.each([
  {
    operation: "Thêm ảnh",
    photos: [a, b, c, d],
    urls: ["/a.webp", "/b.webp", "/c.webp", "/d.webp"],
  },
  { operation: "Gỡ ảnh", photos: [a, c], urls: ["/a.webp", "/c.webp"] },
  { operation: "Đổi thứ tự", photos: [a, c, b], urls: ["/a.webp", "/c.webp", "/b.webp"] },
  { operation: "Đổi ảnh đại diện", photos: [b, a, c], urls: ["/b.webp", "/a.webp", "/c.webp"] },
])(
  "reviews a server-only album change ($operation) while preserving the text draft",
  async ({ operation, photos, urls }) => {
    const latest = withAlbum(photos, 3);
    resolveFarmSave({ ...latest, version: 4, description_vi: draftText });
    await openInformation();
    editDescription();

    mocks.get.mockResolvedValue(latest);
    await refocusWindow();
    const review = within(await screen.findByRole("alert"));
    expect(review.getByText("Album trên máy chủ đã thay đổi")).toBeVisible();
    expect(review.getByText(operation, { exact: false })).toBeVisible();
    const serverPreview = within(review.getByRole("group", { name: "Album mới nhất" }));
    expect(imageSources(serverPreview)).toEqual(urls);
    if (operation !== "Thêm ảnh") {
      const before = within(review.getByRole("group", { name: "Album trước khi chỉnh sửa" }));
      expect(imageSources(before)).toEqual(["/a.webp", "/b.webp", "/c.webp"]);
    }
    expect(save()).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();

    await click(review.getByRole("button", { name: "Dùng phiên bản mới nhất" }));
    expect(screen.getByDisplayValue(draftText)).toBeVisible();
    expect(albumSources()).toEqual(urls);
    await click(save());

    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
      version: 3,
      description_vi: draftText,
    });
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  },
);

it("cleans only an unsubmitted upload when the editor chooses the server album", async () => {
  const latest = withAlbum([b, c], 3);
  mocks.upload.mockResolvedValueOnce(d);
  await openInformation();
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
    target: { files: [new File(["image"], "d.webp", { type: "image/webp" })] },
  });
  await waitFor(() => expect(albumSources()).toEqual(["/a.webp", "/b.webp", "/c.webp", "/d.webp"]));
  mocks.get.mockResolvedValue(latest);
  await refocusWindow();

  await click(await screen.findByRole("button", { name: "Dùng album mới nhất" }));

  expect(albumSources()).toEqual(["/b.webp", "/c.webp"]);
  expect(mocks.deleteImage).toHaveBeenCalledExactlyOnceWith(d.id, { keepalive: true });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(save()).toBeDisabled();
});

it("keeps a local-only album edit when the new server version refreshes thumbnail URLs", async () => {
  const updatedA = { ...a, url: "/a-latest.webp" };
  const latest = { ...withAlbum([updatedA, { ...b }, { ...c }], 3), name_vi: "Tên từ máy chủ" };
  resolveFarmSave({
    ...latest,
    version: 4,
    image: updatedA,
    photos: [updatedA, c],
  });
  await openInformation();
  await click(album().getByRole("button", { name: "Chọn ảnh số 2" }));
  await click(album().getByRole("button", { name: "Bỏ ảnh" }));

  mocks.get.mockResolvedValue(latest);
  await refocusWindow();
  const review = within(await screen.findByRole("alert"));
  expect(review.getByText(/Tên từ máy chủ/)).toBeVisible();
  expect(review.queryByText("Album trên máy chủ đã thay đổi")).not.toBeInTheDocument();
  expect(
    review.queryByRole("button", { name: "Giữ album đang chỉnh sửa" }),
  ).not.toBeInTheDocument();
  await click(review.getByRole("button", { name: "Dùng phiên bản mới nhất" }));
  expect(screen.getByDisplayValue(latest.name_vi)).toBeVisible();
  await click(save());

  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
    version: 3,
    photo_ids: ["a", "c"],
  });
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it.each([
  {
    choice: "Dùng album mới nhất",
    chosenPhotos: [a, b, d],
    urls: ["/a.webp", "/b.webp", "/d.webp"],
    patch: { version: 3, description_vi: draftText },
  },
  {
    choice: "Giữ album đang chỉnh sửa",
    chosenPhotos: [a, b, c],
    urls: ["/a.webp", "/b.webp", "/c.webp"],
    patch: { version: 3, description_vi: draftText, photo_ids: ["a", "b", "c"] },
  },
])(
  "requires an explicit album choice after a timed-out upload submission ($choice)",
  async ({ choice, chosenPhotos, urls, patch }) => {
    const original = withAlbum([a, b], 2);
    const latest = withAlbum([a, b, d], 3);
    mocks.get.mockResolvedValue(original);
    mocks.save.mockRejectedValueOnce(problem("request_timeout", 408));
    resolveFarmSave({ ...withAlbum(chosenPhotos, 4), description_vi: draftText });
    mocks.upload.mockResolvedValueOnce(c);
    const { unmount } = await openInformation();
    editDescription();
    fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
      target: { files: [new File(["image"], "c.webp", { type: "image/webp" })] },
    });
    await waitFor(() => expect(albumSources()).toEqual(["/a.webp", "/b.webp", "/c.webp"]));
    const form = save().closest("form")!;
    await click(save());
    mocks.get.mockResolvedValue(latest);
    await click(await screen.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));

    const review = within(await screen.findByRole("alert"));
    expect(review.getByText("Album trên máy chủ đã thay đổi")).toBeVisible();
    const serverPreview = within(review.getByRole("group", { name: "Album mới nhất" }));
    const draftPreview = within(review.getByRole("group", { name: "Album đang chỉnh sửa" }));
    expect(imageSources(serverPreview)).toEqual(["/a.webp", "/b.webp", "/d.webp"]);
    expect(imageSources(draftPreview)).toEqual(["/a.webp", "/b.webp", "/c.webp"]);
    expect(review.getByRole("button", { name: "Dùng album mới nhất" })).toBeVisible();
    expect(review.getByRole("button", { name: "Giữ album đang chỉnh sửa" })).toBeVisible();
    expect(
      review.queryByRole("button", { name: "Dùng phiên bản mới nhất" }),
    ).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(draftText)).toBeVisible();
    expect(save()).toBeDisabled();
    await act(async () => fireEvent.submit(form));
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
      version: 2,
      description_vi: draftText,
      photo_ids: ["a", "b", "c"],
    });
    expect(mocks.deleteImage).not.toHaveBeenCalled();

    await click(review.getByRole("button", { name: choice }));
    expect(screen.getByDisplayValue(draftText)).toBeVisible();
    expect(albumSources()).toEqual(urls);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await click(save());

    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenLastCalledWith(farm.id, patch);
    unmount();
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  },
);
