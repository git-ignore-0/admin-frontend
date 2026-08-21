import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { TrackerFarmEditor } from "@/components/tracker-farm-editor";
import { TrackerFarmManager } from "@/components/tracker-farm-manager";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { MediaAsset, TrackerFarm } from "@/lib/types";

const replace = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh }) }));

const farm: TrackerFarm = {
  id: "farm-1",
  name_en: "Green Valley",
  name_vi: "Thung lũng Xanh",
  location_en: "Da Lat",
  location_vi: "Đà Lạt",
  description_en: "English description",
  description_vi: "Mô tả Việt",
  image: null,
  signup_count: 14,
  is_visible: true,
  sort_order: 0,
  version: 1,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
const farmImage: MediaAsset = {
  id: "image-1",
  url: "https://example.test/farms/green-valley.webp",
  width: 1200,
  height: 900,
  variants: [],
};
const secondFarm: TrackerFarm = {
  ...farm,
  id: "farm-2",
  name_en: "River Farm",
  name_vi: "Nông trại Sông",
  location_en: "Hoi An",
  location_vi: "Hội An",
  signup_count: 32,
  sort_order: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fillRequiredEditorFields() {
  fireEvent.change(screen.getByLabelText("Farm name *"), { target: { value: "Green Valley" } });
  fireEvent.change(screen.getByLabelText("Tên nông trại *"), {
    target: { value: "Thung lũng Xanh" },
  });
  fireEvent.change(screen.getByLabelText("Location *"), { target: { value: "Da Lat" } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: "Đà Lạt" } });
}
function renderWithProviders(node: React.ReactNode, locale: "en" | "vi" = "en") {
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>{node}</ToastProvider>
    </AdminI18nProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("uses routes for create and edit instead of a farm form dialog", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />);
  expect((await screen.findByRole("link", { name: "+ Add farm" })).getAttribute("href")).toBe(
    "/tracker-farms/new",
  );
  expect(screen.getByRole("link", { name: "Edit Green Valley" }).getAttribute("href")).toBe(
    "/tracker-farms/farm-1",
  );
  expect(screen.queryByRole("dialog", { name: "Edit farm" })).toBeNull();
});

it("renders only the active admin locale's name and location in the list", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  const view = renderWithProviders(<TrackerFarmManager />);

  expect(await screen.findByRole("columnheader", { name: "Farm name" })).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Location" })).toBeVisible();
  expect(screen.getByText("Green Valley")).toBeVisible();
  expect(screen.getByText("Da Lat")).toBeVisible();
  expect(screen.queryByText("Thung lũng Xanh")).toBeNull();
  expect(screen.queryByText("Đà Lạt")).toBeNull();
  expect(screen.getByRole("link", { name: "Edit Green Valley" })).toBeVisible();
  expect(screen.queryByRole("columnheader", { name: "Farm name — English" })).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "English" })).toBeNull();

  view.unmount();
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />, "vi");
  expect(await screen.findByRole("columnheader", { name: "Tên nông trại" })).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Địa điểm" })).toBeVisible();
  expect(screen.getByText("Thung lũng Xanh")).toBeVisible();
  expect(screen.getByText("Đà Lạt")).toBeVisible();
  expect(screen.getByText("Bắt đầu phát triển")).toBeVisible();
  expect(screen.queryByText("Getting Started")).toBeNull();
  expect(screen.queryByText("Green Valley")).toBeNull();
  expect(screen.queryByText("Da Lat")).toBeNull();
  expect(screen.getByRole("link", { name: "Chỉnh sửa Thung lũng Xanh" })).toBeVisible();
});

it("keeps Edit and Delete on one equal-width action row at every breakpoint", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />);

  const edit = await screen.findByRole("link", { name: "Edit Green Valley" });
  const remove = screen.getByRole("button", { name: "Delete Green Valley" });
  expect(edit.parentElement).toHaveClass("tracker-row-actions");
  expect(remove.parentElement).toBe(edit.parentElement);

  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  expect(css).toMatch(/\.tracker-row-actions \{[\s\S]*?display: flex;[\s\S]*?align-items: center;/);
  expect(css).toMatch(
    /\.tracker-row-actions \.button \{[\s\S]*?height: 44px;[\s\S]*?flex: 1 1 0;[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;/,
  );
  expect(css).toMatch(
    /@media \(max-width: 480px\) \{[\s\S]*?\.tracker-row-actions \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: nowrap;/,
  );
});

it("renders a Rewards-style farm thumbnail or milestone fallback in EN and VI list rows", async () => {
  vi.mocked(api).mockResolvedValueOnce([
    { ...farm, image: farmImage },
    { ...farm, id: "farm-2", name_en: "River Farm", name_vi: "Nông trại Sông" },
  ]);
  const view = renderWithProviders(<TrackerFarmManager />);

  const photo = await screen.findByAltText("Green Valley");
  expect(photo).toHaveClass("reward-thumbnail");
  expect(photo).toHaveAttribute("src", expect.stringContaining("green-valley.webp"));
  expect(screen.getByRole("columnheader", { name: "Farm image" })).toBeVisible();
  expect(screen.getAllByAltText("Green Valley")).toHaveLength(1);
  expect(screen.getAllByRole("img", { name: "River Farm" })).toHaveLength(1);
  expect(screen.getByRole("img", { name: "River Farm" })).toHaveClass(
    "tracker-farm-thumbnail-fallback",
  );

  view.unmount();
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />, "vi");
  expect(await screen.findByText(/Thung lũng Xanh/)).toBeVisible();
  expect(screen.getAllByRole("img", { name: "Thung lũng Xanh" })).toHaveLength(1);
  expect(screen.getByRole("img", { name: "Thung lũng Xanh" })).toHaveClass(
    "tracker-farm-thumbnail-fallback",
  );
  expect(screen.getAllByText("🌱")).toHaveLength(1);
});

it("localizes every milestone label in the Vietnamese list", async () => {
  vi.mocked(api).mockResolvedValueOnce([
    { ...farm, id: "seed", signup_count: 0 },
    { ...farm, id: "start", signup_count: 10 },
    { ...farm, id: "family", signup_count: 20 },
    { ...farm, id: "leader", signup_count: 30 },
  ]);
  renderWithProviders(<TrackerFarmManager />, "vi");

  for (const label of [
    "Hạt giống đã gieo",
    "Bắt đầu phát triển",
    "Chăm lo cho gia đình",
    "Dẫn dắt cộng đồng",
  ]) {
    expect(await screen.findByText(label)).toBeVisible();
  }
  for (const english of [
    "Seed planted",
    "Getting Started",
    "Providing for Family",
    "Community Leader",
  ]) {
    expect(screen.queryByText(english)).toBeNull();
  }
});

it("loads the edit screen, preserves validation, and returns to the list after save", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([farm])
    .mockResolvedValueOnce({ ...farm, version: 2 });
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Green Valley")).toBeVisible();
  fireEvent.change(screen.getByDisplayValue("Green Valley"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("This field is required.")).toBeVisible();
  fireEvent.change(document.querySelector('input[lang="en"]')!, {
    target: { value: "New farm" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/tracker-farms"));
  expect(refresh).toHaveBeenCalled();
});

it("localizes editor copy and keeps the signup cluster compact on desktop", () => {
  const view = renderWithProviders(<TrackerFarmEditor />);
  expect(screen.getByText("Manage the image, signup total, and visibility.")).toBeVisible();
  expect(screen.getByLabelText("Total signups *")).toBeVisible();
  expect(screen.getByLabelText("Farm name *")).toBeVisible();
  expect(screen.getByLabelText("Location *")).toBeVisible();
  expect(screen.getByLabelText("Description")).toBeVisible();
  expect(screen.queryByLabelText("Farm name — English *")).toBeNull();

  const signup = screen.getByLabelText("Total signups *");
  expect(signup.closest(".tracker-farm-signup-cluster")).not.toBeNull();
  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  expect(css).toMatch(
    /\.tracker-farm-basics-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(180px, 220px\);/,
  );
  expect(css).toMatch(/\.tracker-farm-signup-cluster \{[\s\S]*?width: min\(220px, 100%\);/);

  view.unmount();
  renderWithProviders(<TrackerFarmEditor />, "vi");
  expect(screen.getByText("Quản lý ảnh, số lượt đăng ký và trạng thái hiển thị.")).toBeVisible();
  expect(screen.getByLabelText("Tổng số lượt đăng ký *")).toBeVisible();
  expect(screen.getByLabelText("Farm name *")).toBeVisible();
  expect(screen.getByLabelText("Tên nông trại *")).toBeVisible();
  expect(screen.getByLabelText("Địa điểm *")).toBeVisible();
  expect(screen.getByLabelText("Mô tả")).toBeVisible();
  expect(screen.queryByLabelText("Tên nông trại — Tiếng Việt *")).toBeNull();
});

it("keeps the bilingual fields and image controls on the localized detail form", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />, "vi");
  expect(await screen.findByDisplayValue("Thung lũng Xanh")).toBeVisible();
  expect(screen.getByDisplayValue("Mô tả Việt")).toBeVisible();
  expect(screen.getByText("Chọn ảnh")).toBeVisible();
  expect(screen.getByLabelText("Tổng số lượt đăng ký *")).toBeVisible();
  expect(screen.getByRole("link", { name: "Hủy" }).getAttribute("href")).toBe("/tracker-farms");
});

it("keeps a stale editor draft and reloads authoritative data only on request", async () => {
  const fresh = { ...farm, name_en: "Server Farm", signup_count: 18, version: 2 };
  const conflict = Object.assign(new Error("version_conflict"), { status: 409 });
  vi.mocked(api)
    .mockResolvedValueOnce([farm])
    .mockRejectedValueOnce(conflict)
    .mockResolvedValueOnce([fresh]);
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);

  const name = await screen.findByDisplayValue("Green Valley");
  fireEvent.change(name, { target: { value: "Stale draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect((await screen.findAllByText(/Your draft is unchanged/))[0]).toBeVisible();
  expect(name).toHaveValue("Stale draft");
  expect(api).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Reload latest" }));
  await waitFor(() => expect(name).toHaveValue("Server Farm"));
  expect(screen.getByLabelText("Total signups *")).toHaveValue("18");
  expect(screen.queryByRole("button", { name: "Reload latest" })).toBeNull();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  expect(api).toHaveBeenNthCalledWith(3, "admin/tracker-farms");
});

it("validates numeric typing, paste, empty values, and submits a normalized integer", async () => {
  vi.mocked(api).mockResolvedValueOnce({ ...farm, signup_count: 25 });
  renderWithProviders(<TrackerFarmEditor />);
  fillRequiredEditorFields();
  const signup = screen.getByLabelText("Total signups *");

  for (const invalid of ["abc", "12abc", "1.5", "-1", "1e2", "1 2"]) {
    fireEvent.change(signup, { target: { value: invalid } });
    expect(signup).toHaveValue("0");
    expect(signup).toHaveAttribute("aria-invalid", "true");
  }
  const invalidPaste = createEvent.paste(signup, {
    clipboardData: { getData: () => "12abc" },
  });
  fireEvent(signup, invalidPaste);
  expect(invalidPaste.defaultPrevented).toBe(true);

  fireEvent.change(signup, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Add farm" }));
  expect(screen.getByText("This field is required.")).toBeVisible();
  expect(api).not.toHaveBeenCalled();

  fireEvent.change(signup, { target: { value: "00025" } });
  fireEvent.click(screen.getByRole("button", { name: "Add farm" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body))).toMatchObject({
    signup_count: 25,
  });
});

it("uploads an image and sends the uploaded id with trimmed descriptions", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(farmImage)
    .mockResolvedValueOnce({ ...farm, image: farmImage });
  const { container } = renderWithProviders(<TrackerFarmEditor />);
  fillRequiredEditorFields();
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "  English description  " },
  });
  fireEvent.change(screen.getByLabelText("Mô tả"), { target: { value: "  Mô tả Việt  " } });
  const file = new File(["image"], "farm.png", { type: "image/png" });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Add farm" }));

  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(api).toHaveBeenNthCalledWith(1, "admin/tracker-farms/media", {
    method: "POST",
    body: expect.any(FormData),
  });
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toMatchObject({
    description_en: "English description",
    description_vi: "Mô tả Việt",
    image_id: "image-1",
  });
});

it("keeps the selected image draft and blocks farm submission when upload fails", async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error("upload_failed"));
  const { container } = renderWithProviders(<TrackerFarmEditor />);
  fillRequiredEditorFields();
  const file = new File(["image"], "farm.png", { type: "image/png" });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Add farm" }));

  expect(await screen.findByText(/current image is unchanged/)).toBeVisible();
  expect(screen.getByText("Change image")).toBeVisible();
  expect(api).toHaveBeenCalledTimes(1);
});

it("removes an existing image by submitting image_id null", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([{ ...farm, image: farmImage }])
    .mockResolvedValueOnce({ ...farm, image: null, version: 2 });
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);

  expect(await screen.findByAltText("Green Valley")).toHaveAttribute(
    "src",
    expect.stringContaining("green-valley.webp"),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Remove image" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toMatchObject({
    image_id: null,
    version: 1,
  });
});

it("saves and cancels local reorder changes without duplicate requests", async () => {
  const saving = deferred<TrackerFarm[]>();
  const serverOrder = [
    { ...secondFarm, sort_order: 0, version: 2 },
    { ...farm, sort_order: 1, version: 2 },
  ];
  vi.mocked(api).mockResolvedValueOnce([farm, secondFarm]).mockReturnValueOnce(saving.promise);
  renderWithProviders(<TrackerFarmManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("River Farm");
  fireEvent.click(screen.getByRole("button", { name: "Cancel order changes" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Green Valley");

  fireEvent.click(screen.getByRole("button", { name: "Move Green Valley down" }));
  const save = screen.getByRole("button", { name: "Save order" });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(api).toHaveBeenNthCalledWith(2, "admin/tracker-farms/reorder", {
    method: "PATCH",
    body: JSON.stringify({
      items: [
        { id: "farm-2", sort_order: 0, version: 1 },
        { id: "farm-1", sort_order: 1, version: 1 },
      ],
    }),
  });
  await act(async () => saving.resolve(serverOrder));
  expect(screen.queryByRole("button", { name: "Save order" })).toBeNull();
});

it("reloads server order after a reorder version conflict", async () => {
  const conflict = Object.assign(new Error("version_conflict"), { status: 409 });
  const fresh = [
    { ...farm, name_en: "Fresh Farm", version: 2 },
    { ...secondFarm, version: 2 },
  ];
  vi.mocked(api)
    .mockResolvedValueOnce([farm, secondFarm])
    .mockRejectedValueOnce(conflict)
    .mockResolvedValueOnce(fresh);
  renderWithProviders(<TrackerFarmManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));
  fireEvent.click(screen.getByRole("button", { name: "Save order" }));
  expect(await screen.findByText("Fresh Farm")).toBeVisible();
  expect(
    screen
      .getAllByRole("alert")
      .some((alert) => alert.textContent?.includes("latest data has been reloaded")),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Save order" })).toBeNull();
});

it("guards Add and Edit navigation while reorder changes are unsaved", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([farm, secondFarm])
    .mockResolvedValueOnce([
      { ...secondFarm, sort_order: 0, version: 2 },
      { ...farm, sort_order: 1, version: 2 },
    ]);
  renderWithProviders(<TrackerFarmManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));

  fireEvent.click(screen.getByRole("link", { name: "+ Add farm" }));
  const stayDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(within(stayDialog).getByRole("button", { name: "Stay" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("River Farm");

  fireEvent.click(screen.getByRole("link", { name: "Edit Green Valley" }));
  const discardDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(discardDialog).getByRole("button", { name: "Discard changes" }));
  expect(push).toHaveBeenCalledWith("/tracker-farms/farm-1");

  push.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Move Green Valley down" }));
  fireEvent.click(screen.getByRole("link", { name: "+ Add farm" }));
  const saveDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(saveDialog).getByRole("button", { name: "Save order" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/tracker-farms/new"));
});

it("deletes permanently only after confirmation and preserves the item on failure", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm, secondFarm]);
  vi.mocked(apiEnvelope)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce({ data: undefined });
  renderWithProviders(<TrackerFarmManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Delete Green Valley" }));
  const dialog = screen.getByRole("dialog", { name: "Permanently delete farm" });
  expect(apiEnvelope).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
  expect(await within(dialog).findByRole("alert")).toBeVisible();
  expect(screen.getByText("Green Valley")).toBeVisible();

  fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(screen.queryByText("Green Valley")).toBeNull());
  expect(screen.getByText("River Farm")).toBeVisible();
});
