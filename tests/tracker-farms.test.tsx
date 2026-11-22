import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { TrackerFarmManager } from "@/components/tracker-farm-manager";
import { ToastProvider } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import type { MediaAsset, TrackerFarm } from "@/lib/types";

const push = vi.fn();
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
const secondFarmImage: MediaAsset = {
  ...farmImage,
  id: "image-2",
  url: "https://example.test/farms/river-farm.webp",
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
  expect(
    (await screen.findByRole("link", { name: "+ Enable Growth Tracker" })).getAttribute("href"),
  ).toBe("/tracker-farms/new");
  const edit = screen.getByRole("link", { name: "Edit Green Valley" });
  expect(edit.getAttribute("href")).toBe("/tracker-farms/farm-1");
  expect(edit).toHaveAttribute("title", "Edit Green Valley");
  expect(edit).toHaveTextContent("");
  expect(edit.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

  const remove = screen.getByRole("button", { name: "Disable Growth Tracker for Green Valley" });
  expect(remove).toHaveAttribute("title", "Disable Growth Tracker for Green Valley");
  expect(remove).toHaveTextContent("");
  expect(remove.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
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
  const vietnameseEdit = screen.getByRole("link", { name: "Chỉnh sửa Thung lũng Xanh" });
  expect(vietnameseEdit).toBeVisible();
  expect(vietnameseEdit).toHaveAttribute("title", "Chỉnh sửa Thung lũng Xanh");
  expect(vietnameseEdit).toHaveTextContent("");
  expect(
    screen.getByRole("button", { name: "Tắt Growth Tracker của Thung lũng Xanh" }),
  ).toHaveAttribute("title", "Tắt Growth Tracker của Thung lũng Xanh");
});

it("keeps icon-only Edit and Delete on one equal square action row at every breakpoint", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />);

  const edit = await screen.findByRole("link", { name: "Edit Green Valley" });
  const remove = screen.getByRole("button", { name: "Disable Growth Tracker for Green Valley" });
  expect(edit.parentElement).toHaveClass("tracker-row-actions");
  expect(remove.parentElement).toBe(edit.parentElement);
  expect(edit).toHaveClass("mantine-ActionIcon-root");
  expect(edit).toHaveAttribute("data-variant", "default");
  expect(remove).toHaveClass("mantine-ActionIcon-root");
  expect(remove).toHaveStyle({ "--ai-color": "var(--mantine-color-red-light-color)" });
  expect(within(edit).queryByText("Edit")).toBeNull();
  expect(within(remove).queryByText("Delete")).toBeNull();

  expect(edit).toHaveStyle({ "--ai-size": "calc(2.25rem * var(--mantine-scale))" });
  expect(remove).toHaveStyle({ "--ai-size": "calc(2.25rem * var(--mantine-scale))" });
});

it("renders a Rewards-style farm thumbnail or milestone fallback in EN and VI list rows", async () => {
  vi.mocked(api).mockResolvedValueOnce([
    { ...farm, image: farmImage, photos: [secondFarmImage, farmImage] },
    { ...farm, id: "farm-2", name_en: "River Farm", name_vi: "Nông trại Sông" },
  ]);
  const view = renderWithProviders(<TrackerFarmManager />);

  const photo = await screen.findByAltText("Green Valley");
  expect(photo).toHaveClass("reward-thumbnail");
  expect(photo).toHaveAttribute("src", expect.stringContaining("river-farm.webp"));
  expect(screen.getByRole("columnheader", { name: "Farm image" })).toBeVisible();
  expect(screen.getAllByAltText("Green Valley")).toHaveLength(1);
  expect(document.querySelector('img[src*="green-valley"]')).toBeNull();
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

  fireEvent.click(screen.getByRole("link", { name: "+ Enable Growth Tracker" }));
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
  fireEvent.click(screen.getByRole("link", { name: "+ Enable Growth Tracker" }));
  const saveDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(saveDialog).getByRole("button", { name: "Save order" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/tracker-farms/new"));
});

it("disables only the Growth Tracker profile after confirmation and preserves the item on failure", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([farm, secondFarm])
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(undefined);
  renderWithProviders(<TrackerFarmManager />);

  fireEvent.click(
    await screen.findByRole("button", { name: "Disable Growth Tracker for Green Valley" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Disable Growth Tracker" });
  expect(within(dialog).getByText(/farm and its products will remain/)).toBeVisible();
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole("button", { name: "Disable Growth Tracker" }));
  expect(await within(dialog).findByRole("alert")).toBeVisible();
  expect(screen.getByText("Green Valley")).toBeVisible();

  fireEvent.click(within(dialog).getByRole("button", { name: "Disable Growth Tracker" }));
  await waitFor(() => expect(screen.queryByText("Green Valley")).toBeNull());
  expect(api).toHaveBeenCalledWith(
    "admin/farms/farm-1/growth-tracker",
    { method: "DELETE" },
    { response: "no-content" },
  );
  expect(screen.getByText("River Farm")).toBeVisible();
});
