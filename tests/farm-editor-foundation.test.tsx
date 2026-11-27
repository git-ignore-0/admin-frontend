import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { focusManager, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createRef, useImperativeHandle, type Ref } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmDetail } from "@/components/farm-detail";
import { FarmEditor } from "@/components/farm-editor";
import { ToastProvider } from "@/components/toast-provider";
import { farmDetailKey } from "@/lib/farm-query";
import type { Farm, MediaAsset, TrackerFarm } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  getTracker: vi.fn(),
  createTracker: vi.fn(),
  updateTracker: vi.fn(),
  deleteTracker: vi.fn(),
  upload: vi.fn(),
  deleteImage: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("@/lib/farms-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/farms-api")>()),
  getFarm: mocks.get,
  saveFarm: mocks.save,
  getFarmTracker: mocks.getTracker,
  enableFarmTracker: mocks.createTracker,
  updateFarmTracker: mocks.updateTracker,
  disableFarmTracker: mocks.deleteTracker,
  uploadFarmImage: mocks.upload,
  deleteFarmImage: mocks.deleteImage,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
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
const tracker: TrackerFarm = {
  id: farm.id,
  name_vi: farm.name_vi,
  name_en: farm.name_en,
  location_vi: farm.location_vi,
  location_en: farm.location_en,
  description_vi: farm.description_vi,
  description_en: farm.description_en,
  image: null,
  photos: [],
  signup_count: 12,
  one_month_signup_count: 3,
  is_visible: true,
  sort_order: 0,
  version: 4,
  created_at: farm.created_at,
  updated_at: farm.updated_at,
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

function FarmCacheProbe({ target }: { target: Ref<QueryClient> }) {
  const client = useQueryClient();
  useImperativeHandle(target, () => client, [client]);
  return null;
}

function page(
  farmId?: string,
  session = "session-a",
  scope?: Ref<() => void>,
  editorOpen = true,
  cache?: Ref<QueryClient>,
) {
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminBreadcrumbProvider
          key={session}
          pathname={farmId ? `/farms/${farmId}` : "/farms/new"}
          search={mocks.search.toString()}
        >
          <Breadcrumbs />
          <AdminQueryProvider ref={scope}>
            {cache && <FarmCacheProbe target={cache} />}
            {editorOpen && (farmId ? <FarmDetail farmId={farmId} /> : <FarmEditor />)}
          </AdminQueryProvider>
        </AdminBreadcrumbProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
}

function renderEditor(farmId?: string, scope?: Ref<() => void>, cache?: Ref<QueryClient>) {
  if (farmId) mocks.search.set("tab", "information");
  const rendered = render(page(farmId, "session-a", scope, true, cache));
  return {
    show: (id: string, session = "session-a") =>
      rendered.rerender(page(id, session, scope, true, cache)),
    close: () => rendered.rerender(page(farmId, "session-a", scope, false, cache)),
  };
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
const deleteAllowed = { delete: { allowed: true, reasons: [] } };
const supplyReason = {
  code: "supplying_product" as const,
  id: "b06ab045-88cd-4679-b6e9-b33e923e2226",
  label: "RAU",
  name_vi: "Rau",
  name_en: "Greens",
};
const deleteBlocked = { delete: { allowed: false, reasons: [supplyReason] } };
const problem = (message: string, status?: number) => Object.assign(new Error(message), { status });
const month = () => screen.getByLabelText<HTMLInputElement>("Số người đăng ký 1 tháng");
const sixMonths = () => screen.getByLabelText<HTMLInputElement>("Số người đăng ký 6 tháng");
const visibility = () => screen.getByRole("checkbox", { name: /^Hiển thị trên Growth Tracker/ });
const saveInformation = () => screen.getByRole("button", { name: "Lưu thay đổi" });
const change = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });
const click = async (element: HTMLElement) => act(async () => fireEvent.click(element));

function deferredFarm() {
  let resolve!: (farm: Farm) => void;
  const promise = new Promise<Farm>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function informationReady() {
  await waitFor(() => expect(month()).toBeEnabled());
  return saveInformation();
}

async function confirmDeactivation() {
  await click(screen.getByRole("button", { name: "Tùy chọn khác" }));
  await click(await screen.findByRole("menuitem", { name: "Ngừng hoạt động" }));
  const dialog = await screen.findByRole("dialog");
  await click(within(dialog).getByRole("button", { name: "Ngừng hoạt động" }));
}

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
  mocks.getTracker.mockRejectedValue(problem("not_found", 404));
});
afterEach(cleanup);

it("uses the full information panel and groups the album and Tracker in one column", async () => {
  renderEditor(farm.id);
  const save = await informationReady();
  const form = save.closest("form");
  const photos = screen.getByRole("region", { name: "Ảnh trang trại" });

  expect(form).toHaveStyle({ width: "100%" });
  expect(form?.style.maxWidth).toBe("");
  expect(form).toContainElement(photos);
  expect(within(photos).getByLabelText("Chọn ảnh")).toBeInTheDocument();
  expect(photos).not.toContainElement(month());
  expect(photos.parentElement).toContainElement(month());
  expect(form).toContainElement(month());
});

it("saves only changed Farm information in place without creating a Tracker profile", async () => {
  const updated = { ...farm, name_vi: "Tên mới", version: 3 };
  mocks.save.mockResolvedValue(updated);
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(farm).mockResolvedValue(updated);
  renderEditor(farm.id);

  const save = await informationReady();
  expect(save).toBeDisabled();
  expect(month().value).toBe("0");
  expect(sixMonths().value).toBe("0");
  expect(visibility()).not.toBeChecked();
  expect(mocks.createTracker).not.toHaveBeenCalled();
  change(screen.getByDisplayValue(farm.name_vi), "Tên mới");
  await click(save);

  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, { version: 2, name_vi: "Tên mới" });
  expect(mocks.createTracker).not.toHaveBeenCalled();
  expect(mocks.updateTracker).not.toHaveBeenCalled();
  expect(mocks.get).toHaveBeenCalledTimes(3);
  expect(mocks.getTracker).toHaveBeenCalledTimes(2);
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Tên mới", level: 1 })).toBeVisible();
  expect(save).toBeDisabled();
});

it("patches only visibility without deleting the Tracker profile or changing its numbers", async () => {
  mocks.getTracker.mockResolvedValue(tracker);
  mocks.updateTracker.mockResolvedValue({ ...tracker, is_visible: false, version: 5 });
  renderEditor(farm.id);
  const save = await informationReady();

  await click(visibility());
  await click(save);

  expect(mocks.updateTracker).toHaveBeenCalledExactlyOnceWith(farm.id, {
    version: 4,
    is_visible: false,
  });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.deleteTracker).not.toHaveBeenCalled();
  expect(month().value).toBe("3");
  expect(sixMonths().value).toBe("12");
  expect(visibility()).not.toBeChecked();
  expect(save).toBeDisabled();
});

it("creates a missing Tracker only after saving a deliberate change", async () => {
  mocks.createTracker.mockResolvedValue({
    ...tracker,
    signup_count: 0,
    one_month_signup_count: 2,
    is_visible: false,
    version: 8,
  });
  renderEditor(farm.id);
  const save = await informationReady();
  change(month(), "2");

  expect(mocks.createTracker).not.toHaveBeenCalled();
  await click(save);
  expect(mocks.createTracker).toHaveBeenCalledExactlyOnceWith(farm.id, {
    one_month_signup_count: 2,
    signup_count: 0,
    is_visible: false,
  });
  expect(mocks.updateTracker).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(save).toBeDisabled();
});

it("saves Tracker before Farm and reads the Tracker revision after Farm succeeds", async () => {
  const tracked = { ...tracker, one_month_signup_count: 9, version: 5 };
  const renamed = { ...farm, name_vi: "Tên mới", version: 3 };
  let completeTracker!: (value: TrackerFarm) => void;
  mocks.getTracker
    .mockResolvedValueOnce(tracker)
    .mockResolvedValueOnce({ ...tracked, name_vi: renamed.name_vi, version: 6 });
  mocks.updateTracker.mockReturnValueOnce(
    new Promise<TrackerFarm>((resolve) => {
      completeTracker = resolve;
    }),
  );
  mocks.save.mockResolvedValueOnce(renamed);
  renderEditor(farm.id);
  const save = await informationReady();

  change(month(), "9");
  change(screen.getByDisplayValue(farm.name_vi), renamed.name_vi);
  await click(save);
  expect(mocks.updateTracker).toHaveBeenNthCalledWith(1, farm.id, {
    version: 4,
    one_month_signup_count: 9,
  });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.getTracker).toHaveBeenCalledTimes(1);

  await act(async () => completeTracker(tracked));
  await waitFor(() => expect(save).toBeDisabled());
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
    version: 2,
    name_vi: renamed.name_vi,
  });
  expect(mocks.getTracker).toHaveBeenCalledTimes(2);
  expect(mocks.getTracker.mock.calls[1]?.[0]).toBe(farm.id);
  expect(mocks.getTracker.mock.invocationCallOrder[1]).toBeGreaterThan(
    mocks.save.mock.invocationCallOrder[0],
  );

  mocks.updateTracker.mockResolvedValueOnce({
    ...tracked,
    name_vi: renamed.name_vi,
    signup_count: 15,
    version: 7,
  });
  change(sixMonths(), "15");
  await click(saveInformation());
  expect(mocks.updateTracker).toHaveBeenNthCalledWith(2, farm.id, {
    version: 6,
    signup_count: 15,
  });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(saveInformation()).toBeDisabled();
});

it("preserves a successful Tracker write while the rejected Farm draft is corrected", async () => {
  const tracked = { ...tracker, one_month_signup_count: 9, version: 5 };
  const renamed = { ...farm, name_vi: "Tên đã sửa", version: 3 };
  mocks.getTracker
    .mockResolvedValueOnce(tracker)
    .mockResolvedValueOnce({ ...tracked, name_vi: renamed.name_vi, version: 6 });
  mocks.updateTracker.mockResolvedValueOnce(tracked);
  mocks.save.mockRejectedValueOnce(problem("validation_error", 400)).mockResolvedValueOnce(renamed);
  renderEditor(farm.id);
  const save = await informationReady();

  change(month(), "9");
  change(screen.getByDisplayValue(farm.name_vi), "Tên bị từ chối");
  await click(save);

  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByDisplayValue("Tên bị từ chối")).toBeVisible();
  expect(month().value).toBe("9");
  expect(mocks.updateTracker).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenCalledTimes(1);

  change(screen.getByDisplayValue("Tên bị từ chối"), renamed.name_vi);
  await click(saveInformation());
  expect(mocks.updateTracker).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenNthCalledWith(2, farm.id, {
    version: 2,
    name_vi: renamed.name_vi,
  });
  expect(saveInformation()).toBeDisabled();
});

it("stops both-dirty save when the Tracker write is uncertain", async () => {
  mocks.getTracker.mockResolvedValueOnce(tracker);
  mocks.updateTracker.mockRejectedValueOnce(problem("request_timeout"));
  renderEditor(farm.id);
  const save = await informationReady();

  change(month(), "9");
  change(screen.getByDisplayValue(farm.name_vi), "Tên nháp");
  await click(save);

  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByDisplayValue("Tên nháp")).toBeVisible();
  expect(month().value).toBe("9");
  expect(saveInformation()).toBeDisabled();
  await act(async () => fireEvent.submit(save.closest("form")!));
  expect(mocks.updateTracker).toHaveBeenCalledTimes(1);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("retains the confirmed Farm change when the follow-up Tracker read fails", async () => {
  const renamed = { ...farm, name_vi: "Tên mới", version: 3 };
  mocks.getTracker
    .mockResolvedValueOnce(tracker)
    .mockRejectedValueOnce(problem("server_error", 502));
  mocks.save.mockResolvedValueOnce(renamed);
  renderEditor(farm.id);
  const save = await informationReady();

  change(screen.getByDisplayValue(farm.name_vi), renamed.name_vi);
  await click(save);

  expect(await screen.findByRole("alert")).toHaveTextContent(/Growth Tracker/);
  expect(screen.getByRole("heading", { name: renamed.name_vi, level: 1 })).toBeVisible();
  expect(screen.getByDisplayValue(renamed.name_vi)).toBeVisible();
  expect(crumbs().getByText(renamed.name_vi)).toBeVisible();
  expect(saveInformation()).toBeDisabled();
  await act(async () => fireEvent.submit(save.closest("form")!));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.updateTracker).not.toHaveBeenCalled();
});

it("keeps the dirty form after deactivation and saves against the verified revisions", async () => {
  const inactive = { ...farm, is_active: false, version: 3 };
  const tracked = { ...tracker, one_month_signup_count: 9, version: 6 };
  const renamed = { ...inactive, name_vi: "Tên nháp", version: 4 };
  mocks.getTracker
    .mockResolvedValueOnce(tracker)
    .mockResolvedValueOnce({ ...tracker, version: 5 })
    .mockResolvedValueOnce({ ...tracked, name_vi: renamed.name_vi, version: 7 });
  mocks.updateTracker.mockResolvedValueOnce(tracked);
  mocks.save.mockResolvedValueOnce(inactive).mockResolvedValueOnce(renamed);
  mocks.search = new URLSearchParams(filters);
  renderEditor(farm.id);
  await informationReady();

  change(month(), "9");
  change(screen.getByDisplayValue(farm.name_vi), renamed.name_vi);
  await confirmDeactivation();

  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, { version: 2, is_active: false });
  expect(mocks.updateTracker).not.toHaveBeenCalled();
  expect(within(screen.getByRole("banner")).getByText("Ngừng hoạt động")).toBeVisible();
  expect(screen.getByRole("tab", { name: "Thông tin" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByDisplayValue(renamed.name_vi)).toBeVisible();
  expect(month().value).toBe("9");
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.get).toHaveBeenCalledTimes(1);

  await waitFor(() => expect(saveInformation()).toBeEnabled());
  await click(saveInformation());
  expect(mocks.updateTracker).toHaveBeenCalledExactlyOnceWith(farm.id, {
    version: 5,
    one_month_signup_count: 9,
  });
  expect(mocks.save).toHaveBeenNthCalledWith(2, farm.id, {
    version: 3,
    name_vi: renamed.name_vi,
  });
  expect(saveInformation()).toBeDisabled();
});

it("keeps the Tracker draft locked when deactivation discovers a concurrent Tracker change", async () => {
  mocks.getTracker
    .mockResolvedValueOnce(tracker)
    .mockResolvedValueOnce({ ...tracker, signup_count: 15, version: 6 });
  mocks.save.mockResolvedValueOnce({ ...farm, is_active: false, version: 3 });
  renderEditor(farm.id);
  const save = await informationReady();
  change(month(), "9");
  await confirmDeactivation();

  expect(
    await screen.findByRole("button", { name: "Dùng dữ liệu mới và giữ chỉnh sửa" }),
  ).toBeVisible();
  expect(within(screen.getByRole("banner")).getByText("Ngừng hoạt động")).toBeVisible();
  expect(month().value).toBe("9");
  expect(sixMonths().value).toBe("12");
  expect(saveInformation()).toBeDisabled();
  await act(async () => fireEvent.submit(save.closest("form")!));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.updateTracker).not.toHaveBeenCalled();
});

it("keeps both writes locked after a toggle timeout until a newer read confirms the status", async () => {
  const inactive = { ...farm, is_active: false, version: farm.version + 1 };
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(farm).mockResolvedValueOnce(inactive);
  mocks.getTracker.mockResolvedValueOnce(tracker).mockResolvedValueOnce({
    ...tracker,
    version: tracker.version + 1,
  });
  mocks.save.mockRejectedValueOnce(problem("request_timeout", 408));
  renderEditor(farm.id);
  await informationReady();
  change(screen.getByDisplayValue(farm.name_vi), "Tên chưa lưu");
  await confirmDeactivation();

  const recover = () => screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" });
  expect(await screen.findByText("Chưa thể xác nhận trang trại đã được lưu.")).toBeVisible();
  expect(saveInformation()).toBeDisabled();
  expect(screen.getByRole("button", { name: "Tùy chọn khác" })).toBeDisabled();
  expect(mocks.get).toHaveBeenCalledTimes(1);

  await click(recover());
  expect(await screen.findByText(/Máy chủ vẫn trả về phiên bản cũ/)).toBeVisible();
  expect(saveInformation()).toBeDisabled();

  await click(recover());
  await waitFor(() => expect(saveInformation()).toBeEnabled());
  expect(within(screen.getByRole("banner")).getByText("Ngừng hoạt động")).toBeVisible();
  expect(screen.getByDisplayValue("Tên chưa lưu")).toBeVisible();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
    version: farm.version,
    is_active: false,
  });
  expect(mocks.get).toHaveBeenCalledTimes(3);
  expect(mocks.getTracker).toHaveBeenCalledTimes(2);
  expect(mocks.updateTracker).not.toHaveBeenCalled();
});

it("retains the draft for review when a background Farm read finds a concurrent edit", async () => {
  const latest = { ...farm, name_vi: "Tên được sửa ở nơi khác", version: 3 };
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(farm).mockResolvedValueOnce(latest);
  renderEditor(farm.id);
  const save = await informationReady();
  change(screen.getByDisplayValue(farm.description_vi), "Mô tả nháp");

  try {
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(latest.name_vi);
    expect(screen.getByDisplayValue("Mô tả nháp")).toBeVisible();
    expect(saveInformation()).toBeDisabled();
    await act(async () => fireEvent.submit(save.closest("form")!));
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.updateTracker).not.toHaveBeenCalled();
  } finally {
    focusManager.setFocused(undefined);
  }
});

it("compares normalized bilingual values and the ordered album to the baseline", async () => {
  mocks.get.mockResolvedValue({ ...farm, image: cover, photos: [cover, album] });
  renderEditor(farm.id);
  const save = await informationReady();

  change(screen.getByDisplayValue(farm.name_vi), ` ${farm.name_vi} `);
  expect(save).toBeDisabled();
  await click(screen.getByRole("tab", { name: /English/ }));
  expect(save).toBeDisabled();
  expect(screen.getByLabelText("Tên trang trại *")).toHaveValue(farm.name_en);
  change(screen.getByDisplayValue(farm.name_en), "English draft");
  expect(save).toBeEnabled();
  change(screen.getByDisplayValue("English draft"), farm.name_en);
  expect(save).toBeDisabled();
  change(screen.getByDisplayValue(farm.name_en), "English draft");
  change(month(), "4294967296");
  expect(save).toBeDisabled();
  change(month(), "0");
  expect(save).toBeEnabled();
  change(screen.getByDisplayValue("English draft"), farm.name_en);
  expect(save).toBeDisabled();

  await click(screen.getByRole("button", { name: "Chọn ảnh số 2" }));
  await click(screen.getByRole("button", { name: /Đặt làm đại diện/ }));
  expect(save).toBeEnabled();
  await click(screen.getByRole("button", { name: "Hoàn tác" }));
  expect(save).toBeDisabled();
  expect(mocks.deleteImage).not.toHaveBeenCalled();

  fireEvent.keyDown(document, { key: "Escape" });
  await click(screen.getByRole("button", { name: "Chọn ảnh số 2" }));
  await click(screen.getByRole("button", { name: /Đặt làm đại diện/ }));
  mocks.save.mockResolvedValueOnce({ ...farm, image: album, photos: [album, cover], version: 3 });
  await click(save);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
    version: 2,
    photo_ids: [album.id, cover.id],
  });
  expect(save).toBeDisabled();
});

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
  const create = screen.getByRole("button", { name: "Tạo trang trại" });
  const form = create.closest("form")!;
  await click(create);

  expect(mocks.replace).toHaveBeenCalledWith(`/farms/farm-1?${filters}`);
  expect(create).toBeDisabled();
  await act(async () => fireEvent.submit(form));
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it("keeps the persisted Farm name in the breadcrumb until inline save succeeds", async () => {
  mocks.search = new URLSearchParams(`${filters}&view=tracker`);
  const updated = { ...farm, name_vi: "Tên nháp", version: 3 };
  mocks.save.mockResolvedValue(updated);
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(farm).mockResolvedValue(updated);
  renderEditor(farm.id);
  const save = await informationReady();

  expect(crumbs().getByText(farm.name_vi)).toBeVisible();
  expect(crumbs().getByRole("link", { name: "Danh sách trang trại" })).toHaveAttribute(
    "href",
    `/farms?${filters}`,
  );
  expect(crumbs().queryByText("Chỉnh sửa")).not.toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

  change(screen.getByLabelText("Tên trang trại *"), "Tên nháp");
  expect(crumbs().getByText(farm.name_vi)).toBeVisible();
  expect(crumbs().queryByText("Tên nháp")).not.toBeInTheDocument();
  await click(save);
  expect(crumbs().getByText("Tên nháp")).toBeVisible();
  expect(screen.getByRole("tab", { name: "Thông tin" })).toHaveAttribute("aria-selected", "true");
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.get).toHaveBeenCalledTimes(3);
});

it.each([
  { pending: false, readVersion: 3, leave: false },
  { pending: true, readVersion: 3, leave: false },
  { pending: true, readVersion: 2, leave: false },
  { pending: true, readVersion: 3, leave: true },
])(
  "preserves confirmed information and canonical capability (pending $pending, revision $readVersion, navigation $leave)",
  async ({ pending, readVersion, leave }) => {
    const initial = { ...farm, capabilities: deleteAllowed };
    const saved = { ...initial, name_vi: "Tên đã lưu", version: 3 };
    const refreshed = {
      ...(readVersion === saved.version ? saved : initial),
      capabilities: deleteBlocked,
    };
    const patch = deferredFarm();
    const read = deferredFarm();
    mocks.get.mockResolvedValue(initial);
    mocks.getTracker
      .mockResolvedValueOnce(tracker)
      .mockResolvedValue({ ...tracker, version: tracker.version + 1 });
    mocks.save.mockReturnValueOnce(patch.promise);
    const cache = createRef<QueryClient>();
    const editor = renderEditor(farm.id, undefined, cache);
    const save = await informationReady();
    const client = cache.current!;
    const queryKey = farmDetailKey(farm.id);
    await waitFor(() => expect(client.getQueryState(queryKey)?.fetchStatus).toBe("idle"));
    const readCount = mocks.get.mock.calls.length;

    change(screen.getByDisplayValue(farm.name_vi), saved.name_vi);
    await click(save);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    mocks.get.mockReturnValueOnce(read.promise);
    await act(async () => {
      void client.invalidateQueries({ queryKey });
    });
    const signal = mocks.get.mock.calls.at(-1)?.[1] as AbortSignal;
    if (!pending) await act(async () => read.resolve(refreshed));

    await act(async () => patch.resolve(saved));
    expect(screen.getByDisplayValue(saved.name_vi)).toBeVisible();
    expect(client.getQueryData<Farm>(queryKey)?.name_vi).toBe(saved.name_vi);
    expect(signal.aborted).toBe(false);
    if (leave) {
      await act(async () => editor.close());
      expect(signal.aborted).toBe(true);
      expect(client.getQueryData<Farm>(queryKey)?.name_vi).toBe(saved.name_vi);
      mocks.get.mockResolvedValueOnce(refreshed);
      await act(async () => editor.show(farm.id));
      await act(async () => read.resolve(initial));
    } else if (pending) {
      expect(client.getQueryState(queryKey)).toMatchObject({
        fetchStatus: "fetching",
        isInvalidated: true,
      });
      expect(client.getQueryData<Farm>(queryKey)?.capabilities?.delete.allowed).not.toBe(true);
      await act(async () => read.resolve(refreshed));
    }
    await waitFor(() =>
      expect(client.getQueryData<Farm>(queryKey)?.capabilities).toEqual(deleteBlocked),
    );
    expect(client.getQueryData<Farm>(queryKey)?.name_vi).toBe(saved.name_vi);
    expect(client.getQueryData<Farm>(queryKey)?.version).toBe(saved.version);
    expect(mocks.get).toHaveBeenCalledTimes(readCount + (leave ? 2 : 1));
  },
);

it("keeps newer deletion blockers when the editor adopts a previously reviewed Farm revision", async () => {
  const initial = { ...farm, capabilities: deleteAllowed };
  const reviewed = { ...initial, version: 3, name_vi: "Tên mới trên máy chủ" };
  const refreshed = { ...reviewed, capabilities: deleteBlocked };
  mocks.get.mockResolvedValue(initial);
  mocks.save.mockRejectedValueOnce(problem("version_conflict", 409));
  const cache = createRef<QueryClient>();
  renderEditor(farm.id, undefined, cache);
  const save = await informationReady();
  const client = cache.current!;
  const queryKey = farmDetailKey(farm.id);
  await waitFor(() => expect(client.getQueryState(queryKey)?.fetchStatus).toBe("idle"));
  change(screen.getByDisplayValue(farm.description_vi), "Mô tả chưa lưu");
  await click(save);
  mocks.get.mockResolvedValueOnce(reviewed);
  await click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));
  const adopt = await screen.findByRole("button", { name: "Dùng phiên bản mới nhất" });

  mocks.get.mockResolvedValue(refreshed);
  await act(async () => client.invalidateQueries({ queryKey }));
  await click(adopt);

  expect(screen.getByDisplayValue(reviewed.name_vi)).toBeVisible();
  expect(screen.getByDisplayValue("Mô tả chưa lưu")).toBeVisible();
  expect(client.getQueryData<Farm>(queryKey)?.capabilities).toEqual(deleteBlocked);
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it.each([401, 403, 404])(
  "clears the Farm name and form after a %s save response",
  async (status) => {
    const rejection = problem("request_failed", status);
    mocks.save.mockRejectedValue(
      status === 404 ? Object.assign(rejection, { payload: { detail: "Not found." } }) : rejection,
    );
    renderEditor(farm.id);
    const save = await informationReady();

    expect(crumbs().getByText(farm.name_vi)).toBeVisible();
    change(screen.getByDisplayValue(farm.name_vi), "Dữ liệu cần bảo vệ");
    await click(save);
    expect(await crumbs().findByText("Chi tiết trang trại")).toBeVisible();
    expect(crumbs().queryByText(farm.name_vi)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Dữ liệu cần bảo vệ")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toBeVisible();
  },
);

it("keeps the information draft when PATCH and verification time out while reading a 404 body", async () => {
  const timeout = problem("request_timeout", 404);
  mocks.save.mockRejectedValueOnce(timeout);
  const cache = createRef<QueryClient>();
  renderEditor(farm.id, undefined, cache);
  const save = await informationReady();
  const queryKey = farmDetailKey(farm.id);
  await waitFor(() => expect(cache.current?.getQueryState(queryKey)?.fetchStatus).toBe("idle"));
  change(screen.getByDisplayValue(farm.name_vi), "Giữ bản nháp khi hết thời gian");

  await click(save);
  mocks.get.mockRejectedValueOnce(timeout);
  await click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" }));

  expect(screen.getByDisplayValue("Giữ bản nháp khi hết thời gian")).toBeVisible();
  expect(save).toBeDisabled();
  expect(cache.current?.getQueryData<Farm>(queryKey)?.id).toBe(farm.id);
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it("preserves the draft and access to Farm data when the write fails CSRF validation", async () => {
  mocks.save.mockRejectedValueOnce(problem("csrf_rejected", 403));
  renderEditor(farm.id);
  const save = await informationReady();
  change(screen.getByDisplayValue(farm.name_vi), "Tên nháp");
  await click(save);

  expect(crumbs().getByText(farm.name_vi)).toBeVisible();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByDisplayValue("Tên nháp")).toBeVisible();
  expect(save).toBeEnabled();
});

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
  const editor = renderEditor(farm.id);
  await informationReady();
  expect(crumbs().getByText(farm.name_vi)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
    target: { files: [new File(["image"], "staged.webp", { type: "image/webp" })] },
  });
  await screen.findByText("1/12");
  await click(saveInformation());
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(farm.id, {
    version: 2,
    photo_ids: [asset.id],
  });

  mocks.get.mockReturnValue(
    new Promise<Farm>((resolve) => {
      finishLoad = resolve;
    }),
  );
  editor.show(farm.id, "session-b");
  expect(crumbs().getByText("Chi tiết trang trại")).toBeVisible();
  expect(mocks.deleteImage).not.toHaveBeenCalled();

  await act(async () => finishSave({ ...farm, image: asset, photos: [asset], version: 3 }));
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(crumbs().queryByText(farm.name_vi)).not.toBeInTheDocument();
  await act(async () => finishLoad({ ...farm, name_vi: "Trang trại mới" }));
  expect(await crumbs().findByText("Trang trại mới")).toBeVisible();
});

it("hides the Farm draft and saved name if the query scope has retired before rerender", async () => {
  const scope = createRef<() => void>();
  const editor = renderEditor(farm.id, scope);
  fireEvent.change(await screen.findByDisplayValue(farm.name_vi), {
    target: { value: "Dữ liệu bản nháp cần bảo vệ" },
  });
  act(() => scope.current?.());
  editor.show(farm.id);

  expect(screen.queryByDisplayValue("Dữ liệu bản nháp cần bảo vệ")).not.toBeInTheDocument();
  expect(crumbs().queryByText(farm.name_vi)).not.toBeInTheDocument();
  expect(crumbs().getByText("Chi tiết trang trại")).toBeVisible();
});

it("ignores an old load when the detail opens a different Farm", async () => {
  let finishOldLoad!: (value: Farm) => void;
  mocks.get.mockReturnValueOnce(
    new Promise<Farm>((resolve) => {
      finishOldLoad = resolve;
    }),
  );
  const nextFarm = { ...farm, id: "farm-2", name_vi: "Nông trại mới" };
  mocks.get.mockResolvedValueOnce(nextFarm);

  const editor = renderEditor(farm.id);
  expect(crumbs().getByText("Chi tiết trang trại")).toBeVisible();
  const oldSignal: AbortSignal = mocks.get.mock.calls[0][1];
  editor.show(nextFarm.id);

  expect(await crumbs().findByText(nextFarm.name_vi)).toBeVisible();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishOldLoad(farm));
  expect(crumbs().getByText(nextFarm.name_vi)).toBeVisible();
  expect(screen.queryByDisplayValue(farm.name_vi)).not.toBeInTheDocument();
});

it("prevents duplicate saves while the inline write is pending and after the form is clean", async () => {
  let finishSave!: (value: Farm) => void;
  mocks.save.mockReturnValueOnce(
    new Promise<Farm>((resolve) => {
      finishSave = resolve;
    }),
  );
  renderEditor(farm.id);
  const save = await informationReady();
  const form = save.closest("form")!;
  change(screen.getByDisplayValue(farm.name_vi), "Tên nháp");
  await click(save);
  expect(save).toBeDisabled();
  await act(async () => fireEvent.submit(form));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async () => finishSave({ ...farm, name_vi: "Tên nháp", version: 3 }));
  expect(saveInformation()).toBeDisabled();
  await act(async () => fireEvent.submit(form));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.replace).not.toHaveBeenCalled();
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
  mocks.get.mockResolvedValueOnce(farm).mockResolvedValueOnce(farm);
  mocks.get.mockRejectedValueOnce(problem("server_error", 502));
  mocks.get.mockRejectedValueOnce(problem("invalid_response"));
  mocks.get.mockResolvedValueOnce({ ...farm, version: 1 });
  mocks.get.mockResolvedValueOnce(farm);
  mocks.save.mockRejectedValueOnce(problem("request_timeout"));
  mocks.deleteImage.mockResolvedValue(undefined);
  const editor = renderEditor(farm.id);
  const save = await informationReady();
  change(screen.getByDisplayValue(farm.name_vi), "Bản nháp sau timeout");
  await uploadPhotos(cover, album);

  await click(save);
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
  expect(mocks.get).toHaveBeenCalledTimes(6);
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
  const updated = { ...latest, version: 4, description_vi: "Mô tả tiếp theo" };
  mocks.get
    .mockResolvedValueOnce(farm)
    .mockResolvedValueOnce(farm)
    .mockResolvedValueOnce(latest)
    .mockResolvedValueOnce(latest)
    .mockResolvedValue(updated);
  mocks.save.mockRejectedValueOnce(problem("network_error")).mockResolvedValueOnce(updated);
  mocks.deleteImage.mockResolvedValue(undefined);
  const editor = renderEditor(farm.id);
  const save = await informationReady();
  change(screen.getByDisplayValue(farm.name_vi), "Giữ nguyên bản nháp");
  await uploadPhotos(cover, album, otherUpload);

  await click(save);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu mới nhất" })),
  );
  expect(screen.getByDisplayValue("Giữ nguyên bản nháp")).toBeVisible();
  expect(screen.getByText("3/12")).toBeVisible();
  expect(save).toBeDisabled();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.deleteImage).not.toHaveBeenCalled();

  await click(screen.getByRole("button", { name: "Giữ album đang chỉnh sửa" }));
  expect(screen.getByDisplayValue("Giữ nguyên bản nháp")).toBeVisible();
  expect(screen.getByText("3/12")).toBeVisible();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await click(screen.getByRole("button", { name: "Hoàn tác" }));
  expect(screen.getByDisplayValue(latest.name_vi)).toBeVisible();
  expect(screen.getByText("2/12")).toBeVisible();
  expect(saveInformation()).toBeDisabled();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  change(screen.getByDisplayValue(farm.description_vi), "Mô tả tiếp theo");
  await click(saveInformation());
  expect(mocks.save).toHaveBeenLastCalledWith(farm.id, {
    version: 3,
    description_vi: "Mô tả tiếp theo",
  });
  expect(mocks.replace).not.toHaveBeenCalled();
  editor.close();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("allows another attempt and cleans unneeded photos after a definite validation rejection", async () => {
  mocks.save.mockRejectedValueOnce(problem("validation_error", 400));
  mocks.deleteImage.mockResolvedValue(undefined);
  const editor = renderEditor(farm.id);
  const save = await informationReady();
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
  const save = await informationReady();
  await uploadPhotos(cover);
  await click(save);
  expect(mocks.save).toHaveBeenCalledTimes(1);
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
