import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef, type ComponentPropsWithRef } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmList } from "@/components/farm-list";
import {
  TrackerFarmManager,
  type TrackerFarmManagerHandle,
} from "@/components/tracker-farm-manager";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { MediaAsset, TrackerFarm } from "@/lib/types";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({
    href,
    onNavigate,
    onClick,
    ...props
  }: ComponentPropsWithRef<"a"> & {
    onNavigate?: (event: { preventDefault: () => void }) => void;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        )
          return;
        event.preventDefault();
        let canceled = false;
        onNavigate?.({
          preventDefault: () => {
            canceled = true;
          },
        });
        if (!canceled) push(href);
      }}
    />
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

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
      <ToastProvider>
        <AdminQueryProvider>{node}</AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
}
afterEach(() => {
  cleanup();
  searchParams = new URLSearchParams();
  vi.resetAllMocks();
});

it("provides integrated Farm links for enabling or editing Tracker with list context", async () => {
  searchParams = new URLSearchParams("tab=tracker&search=green&is_active=true&page=3");
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />);
  expect(
    (await screen.findByRole("link", { name: "+ Enable Growth Tracker" })).getAttribute("href"),
  ).toBe("/farms?search=green&is_active=true&page=3&setup=tracker");
  const edit = screen.getByRole("link", { name: "Edit Green Valley" });
  expect(edit.getAttribute("href")).toBe(
    "/farms/farm-1?search=green&is_active=true&page=3&view=tracker&tab=tracker",
  );
  expect(screen.getByRole("link", { name: "Green Valley" })).toHaveAttribute(
    "href",
    edit.getAttribute("href"),
  );
  expect(edit).toHaveAttribute("title", "Edit Green Valley");
  expect(edit).toHaveTextContent("");
  expect(edit.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

  const remove = screen.getByRole("button", { name: "Disable Growth Tracker for Green Valley" });
  expect(remove).toHaveAttribute("title", "Disable Growth Tracker for Green Valley");
  expect(remove).toHaveTextContent("");
  expect(remove.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByRole("heading")).toBeNull();
});

it("renders only the active admin locale's name and location in the list", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  const view = renderWithProviders(<TrackerFarmManager />);

  expect(await screen.findByRole("columnheader", { name: "Farm name" })).toBeVisible();
  const farmCell = screen.getByRole("link", { name: "Green Valley" }).closest("td")!;
  expect(within(farmCell).getByText("Da Lat")).toBeVisible();
  expect(screen.queryByText("Thung lũng Xanh")).toBeNull();
  expect(screen.queryByText("Đà Lạt")).toBeNull();
  expect(screen.getByRole("link", { name: "Edit Green Valley" })).toBeVisible();
  expect(screen.queryByRole("columnheader", { name: "Farm name — English" })).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "English" })).toBeNull();

  view.unmount();
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />, "vi");
  expect(await screen.findByRole("columnheader", { name: "Tên nông trại" })).toBeVisible();
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

it("groups icon-only Edit and Disable actions with accessible names", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />);

  const edit = await screen.findByRole("link", { name: "Edit Green Valley" });
  const remove = screen.getByRole("button", { name: "Disable Growth Tracker for Green Valley" });
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

it("renders the primary farm thumbnail or milestone fallback in EN and VI list rows", async () => {
  vi.mocked(api).mockResolvedValueOnce([
    { ...farm, image: farmImage, photos: [secondFarmImage, farmImage] },
    { ...farm, id: "farm-2", name_en: "River Farm", name_vi: "Nông trại Sông" },
  ]);
  const view = renderWithProviders(<TrackerFarmManager />);

  const photo = await screen.findByAltText("Green Valley");
  expect(photo).toHaveAttribute("src", expect.stringContaining("river-farm.webp"));
  expect(photo.closest("td")).toBe(
    screen.getByRole("link", { name: "Green Valley" }).closest("td"),
  );
  expect(screen.getAllByAltText("Green Valley")).toHaveLength(1);
  expect(document.querySelector('img[src*="green-valley"]')).toBeNull();
  expect(screen.getAllByRole("img", { name: "River Farm" })).toHaveLength(1);
  expect(screen.getByRole("img", { name: "River Farm" })).toHaveTextContent("🌱");

  view.unmount();
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />, "vi");
  expect(await screen.findByText(/Thung lũng Xanh/)).toBeVisible();
  expect(screen.getAllByRole("img", { name: "Thung lũng Xanh" })).toHaveLength(1);
  expect(screen.getByRole("img", { name: "Thung lũng Xanh" })).toHaveTextContent("🌱");
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

it("guards Enable and Edit links while preserving modified clicks", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([farm, secondFarm])
    .mockResolvedValueOnce([
      { ...secondFarm, sort_order: 0, version: 2 },
      { ...farm, sort_order: 1, version: 2 },
    ]);
  renderWithProviders(<TrackerFarmManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));

  const enable = screen.getByRole("link", { name: "+ Enable Growth Tracker" });
  const edit = screen.getByRole("link", { name: "Edit Green Valley" });
  // Avoid jsdom's unimplemented browser navigation after React handles the click.
  const preventBrowserNavigation = (event: MouseEvent) => event.preventDefault();
  document.addEventListener("click", preventBrowserNavigation, { once: true });
  fireEvent.click(enable, { ctrlKey: true });
  document.addEventListener("click", preventBrowserNavigation, { once: true });
  fireEvent.click(edit, { metaKey: true });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(push).not.toHaveBeenCalled();

  fireEvent.click(enable);
  const stayDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(within(stayDialog).getByRole("button", { name: "Stay" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("River Farm");

  fireEvent.click(edit);
  const discardDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(discardDialog).getByRole("button", { name: "Discard changes" }));
  expect(push).toHaveBeenCalledWith("/farms/farm-1?view=tracker&tab=tracker");

  push.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Move Green Valley down" }));
  fireEvent.click(enable);
  const saveDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(saveDialog).getByRole("button", { name: "Save order" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/farms?setup=tracker"));
});

it("guards leaving the active Tracker tab until the reorder is saved or discarded", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm, secondFarm]);
  const manager = createRef<TrackerFarmManagerHandle>();
  const switchToFarmList = vi.fn();
  renderWithProviders(<TrackerFarmManager ref={manager} />);
  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));

  act(() => manager.current!.requestNavigation(switchToFarmList));
  const stayDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  expect(switchToFarmList).not.toHaveBeenCalled();
  fireEvent.click(within(stayDialog).getByRole("button", { name: "Stay" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("River Farm");

  act(() => manager.current!.requestNavigation(switchToFarmList));
  const discardDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(discardDialog).getByRole("button", { name: "Discard changes" }));
  expect(switchToFarmList).toHaveBeenCalledTimes(1);
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Green Valley");
  expect(api).toHaveBeenCalledTimes(1);
});

it("reads only the active list tab and guards the actual tab switch with a dirty reorder", async () => {
  searchParams = new URLSearchParams("search=river&is_active=false&page=2&tab=tracker");
  vi.mocked(api).mockResolvedValueOnce([farm, secondFarm]);
  vi.mocked(apiEnvelope).mockResolvedValueOnce({
    data: [
      { ...secondFarm, is_active: false, in_stock_product_count: 1, out_of_stock_product_count: 1 },
    ],
    meta: { page: 2, page_size: 20, total: 40 },
  });
  const view = renderWithProviders(<FarmList />);
  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));
  expect(apiEnvelope).not.toHaveBeenCalled();
  const farmTab = screen.getByRole("tab", { name: "Farm list" });
  fireEvent.click(farmTab);
  let dialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(farmTab);
  dialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Discard changes" }));
  expect(push).toHaveBeenCalledExactlyOnceWith("/farms?search=river&is_active=false&page=2", {
    scroll: false,
  });

  searchParams = new URLSearchParams("search=river&is_active=false&page=2");
  view.rerender(
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <AdminQueryProvider>
          <FarmList />
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
  expect(await screen.findByRole("link", { name: "River Farm" })).toHaveAttribute(
    "href",
    "/farms/farm-2?search=river&is_active=false&page=2",
  );
  expect(api).toHaveBeenCalledTimes(1);
  expect(apiEnvelope).toHaveBeenCalledExactlyOnceWith(
    "admin/farms?page=2&search=river&is_active=false",
    { signal: expect.any(AbortSignal) },
  );
});

it("supports drag-and-drop and clears the draft after moving back to the saved order", async () => {
  vi.mocked(api).mockResolvedValueOnce([
    { ...farm, sort_order: 4 },
    { ...secondFarm, sort_order: 6 },
  ]);
  renderWithProviders(<TrackerFarmManager />);
  const handle = await screen.findByRole("button", { name: "Drag to reorder Green Valley" });
  const target = screen.getByRole("row", { name: /River Farm/ });
  const dataTransfer = { setData: vi.fn(), dropEffect: "", effectAllowed: "" };
  fireEvent.dragStart(handle, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  expect(dataTransfer.dropEffect).toBe("move");
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("River Farm");
  expect(screen.getByRole("button", { name: "Save order" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Move Green Valley up" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Green Valley");
  expect(screen.queryByRole("button", { name: "Save order" })).toBeNull();
  expect(api).toHaveBeenCalledTimes(1);
});

it("shows loading, an error and retry, then the empty Tracker state", async () => {
  const request = deferred<TrackerFarm[]>();
  vi.mocked(api).mockReturnValueOnce(request.promise).mockResolvedValueOnce([]);
  renderWithProviders(<TrackerFarmManager />);

  expect(screen.getByRole("status")).toHaveTextContent("Loading tracker farms");
  await act(async () => request.resolve([{ error: "invalid response" } as unknown as TrackerFarm]));
  const error = await screen.findByRole("alert");
  fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No farms have been added to the Growth Tracker.")).toBeVisible();
  expect(screen.getByRole("link", { name: "+ Enable Growth Tracker" })).toBeVisible();
  expect(api).toHaveBeenCalledTimes(2);
});

it("clears protected rows and an unsaved order when saving loses permission", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([farm, secondFarm])
    .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
  renderWithProviders(<TrackerFarmManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));
  fireEvent.click(screen.getByRole("button", { name: "Save order" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByText("Green Valley")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save order" })).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(2);
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
