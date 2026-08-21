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
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { TrackerFarmManager, trackerMilestone } from "@/components/tracker-farm-manager";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { TrackerFarm } from "@/lib/types";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/tracker-farms",
}));

const firstFarm: TrackerFarm = {
  id: "11111111-1111-4111-8111-111111111111",
  name_en: "Green Valley Farm",
  name_vi: "Nông trại Thung Lũng Xanh",
  location_en: "Da Lat, Vietnam",
  location_vi: "Đà Lạt, Việt Nam",
  signup_count: 14,
  is_visible: true,
  sort_order: 0,
  version: 1,
  created_at: "2026-08-20T01:00:00Z",
  updated_at: "2026-08-20T01:00:00Z",
};

const secondFarm: TrackerFarm = {
  ...firstFarm,
  id: "22222222-2222-4222-8222-222222222222",
  name_en: "River Farm",
  name_vi: "Nông trại Ven Sông",
  location_en: "Hoi An, Vietnam",
  location_vi: "Hội An, Việt Nam",
  signup_count: 32,
  is_visible: false,
  sort_order: 1,
};

function providers(locale: "en" | "vi" = "en") {
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>
        <TrackerFarmManager />
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

function rows() {
  return screen.getAllByRole("row").slice(1);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
});

describe("tracker farm manager", () => {
  it("shows a stable loading state before rendering the list", async () => {
    const load = deferred<TrackerFarm[]>();
    vi.mocked(api).mockReturnValueOnce(load.promise);
    providers();

    expect(screen.getByRole("status")).toHaveTextContent("Loading tracker farms…");
    expect(screen.queryByRole("table")).toBeNull();

    await act(async () => load.resolve([firstFarm]));
    expect(await screen.findByRole("table")).toBeVisible();
  });

  it("renders EN/VI data, milestones, visibility, and the empty state", async () => {
    vi.mocked(api).mockResolvedValueOnce([firstFarm, secondFarm]);
    const view = providers();

    expect(await screen.findByText("Green Valley Farm")).toBeVisible();
    expect(screen.getByText(/Nông trại Thung Lũng Xanh/)).toBeVisible();
    expect(screen.getByText("Da Lat, Vietnam")).toBeVisible();
    expect(screen.getByText(/Đà Lạt, Việt Nam/)).toBeVisible();
    expect(screen.getByText("Getting Started")).toBeVisible();
    expect(screen.getByText("Community Leader")).toBeVisible();
    expect(screen.getByText("Visible")).toBeVisible();
    expect(screen.getByText("Hidden")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Farm name — English" })).toBeVisible();

    vi.mocked(api).mockResolvedValueOnce([]);
    view.unmount();
    providers("vi");
    expect(await screen.findByText("Chưa có nông trại nào trong Growth Tracker.")).toBeVisible();
  });

  it("computes every milestone boundary and previews changes in the add form", async () => {
    expect([0, 9, 10, 19, 20, 29, 30].map(trackerMilestone)).toEqual([
      "seedPlanted",
      "seedPlanted",
      "gettingStarted",
      "gettingStarted",
      "providingForFamily",
      "providingForFamily",
      "communityLeader",
    ]);
    vi.mocked(api).mockResolvedValueOnce([]);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "+ Add farm" }));
    const dialog = screen.getByRole("dialog", { name: "Add farm" });
    expect(within(dialog).getByText("Milestone preview: Seed planted")).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Total signups *"), {
      target: { value: "20" },
    });
    expect(within(dialog).getByText("Milestone preview: Providing for Family")).toBeVisible();
  });

  it("shows field errors for required bilingual content and invalid signup counts", async () => {
    vi.mocked(api).mockResolvedValueOnce([]);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "+ Add farm" }));
    const dialog = screen.getByRole("dialog", { name: "Add farm" });
    fireEvent.change(within(dialog).getByLabelText("Total signups *"), {
      target: { value: "-1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add farm" }));

    for (const label of [
      "Farm name — English *",
      "Tên nông trại — Tiếng Việt *",
      "Location — English *",
      "Địa điểm — Tiếng Việt *",
    ]) {
      expect(within(dialog).getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    }
    expect(within(dialog).getAllByText("This field is required.")).toHaveLength(4);
    expect(within(dialog).getAllByText(/whole number of 0 or more/).length).toBeGreaterThan(0);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("rejects non-integer signup input from typing and paste without submitting it", async () => {
    vi.mocked(api).mockResolvedValueOnce([]);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "+ Add farm" }));
    const dialog = screen.getByRole("dialog", { name: "Add farm" });
    const signupInput = within(dialog).getByLabelText("Total signups *");

    for (const value of ["abc", "12abc", "1.5", "-1", "1e2", "1 2"]) {
      fireEvent.change(signupInput, { target: { value } });
      expect(signupInput).toHaveValue("0");
      expect(signupInput).toHaveAttribute("aria-invalid", "true");
    }

    const invalidPaste = createEvent.paste(signupInput, {
      clipboardData: { getData: () => "12abc" },
    });
    fireEvent(signupInput, invalidPaste);
    expect(invalidPaste.defaultPrevented).toBe(true);
    expect(signupInput).toHaveValue("0");
    expect(within(dialog).getByText(/whole number of 0 or more/)).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add farm" }));
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("requires a signup count, accepts zero and integers, and submits a normalized integer", async () => {
    const created = { ...firstFarm, signup_count: 25 };
    vi.mocked(api)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce([created]);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "+ Add farm" }));
    const dialog = screen.getByRole("dialog", { name: "Add farm" });
    const signupInput = within(dialog).getByLabelText("Total signups *");

    fireEvent.change(signupInput, { target: { value: "" } });
    expect(signupInput).toHaveValue("");
    expect(within(dialog).getByText("This field is required.")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add farm" }));
    expect(api).toHaveBeenCalledTimes(1);

    fireEvent.change(signupInput, { target: { value: "0" } });
    expect(signupInput).toHaveValue("0");
    expect(signupInput).toHaveAttribute("aria-invalid", "false");
    fireEvent.change(signupInput, { target: { value: "00025" } });
    expect(signupInput).toHaveValue("00025");

    fireEvent.change(within(dialog).getByLabelText("Farm name — English *"), {
      target: { value: "Green Valley Farm" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tên nông trại — Tiếng Việt *"), {
      target: { value: "Nông trại Thung Lũng Xanh" },
    });
    fireEvent.change(within(dialog).getByLabelText("Location — English *"), {
      target: { value: "Da Lat, Vietnam" },
    });
    fireEvent.change(within(dialog).getByLabelText("Địa điểm — Tiếng Việt *"), {
      target: { value: "Đà Lạt, Việt Nam" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add farm" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toMatchObject({
      signup_count: 25,
    });
  });

  it("trims and creates a farm without version, then refreshes the list", async () => {
    const created = { ...firstFarm, signup_count: 20 };
    vi.mocked(api)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce([created]);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "+ Add farm" }));
    const dialog = screen.getByRole("dialog", { name: "Add farm" });
    fireEvent.change(within(dialog).getByLabelText("Farm name — English *"), {
      target: { value: "  Green Valley Farm  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Tên nông trại — Tiếng Việt *"), {
      target: { value: "  Nông trại Thung Lũng Xanh  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Location — English *"), {
      target: { value: "  Da Lat, Vietnam  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Địa điểm — Tiếng Việt *"), {
      target: { value: "  Đà Lạt, Việt Nam  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Total signups *"), {
      target: { value: "20" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add farm" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(api).toHaveBeenNthCalledWith(2, "admin/tracker-farms", {
      method: "POST",
      body: JSON.stringify({
        name_en: "Green Valley Farm",
        name_vi: "Nông trại Thung Lũng Xanh",
        location_en: "Da Lat, Vietnam",
        location_vi: "Đà Lạt, Việt Nam",
        signup_count: 20,
        is_visible: true,
      }),
    });
    expect(screen.queryByRole("dialog", { name: "Add farm" })).toBeNull();
    expect(await screen.findByText("Green Valley Farm")).toBeVisible();
  });

  it("edits with the current version and saves the visibility toggle", async () => {
    const updated = { ...firstFarm, name_en: "Updated Farm", is_visible: false, version: 2 };
    vi.mocked(api).mockResolvedValueOnce([firstFarm]).mockResolvedValueOnce(updated);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Green Valley Farm" }));
    const dialog = screen.getByRole("dialog", { name: "Edit farm" });
    fireEvent.change(within(dialog).getByLabelText("Farm name — English *"), {
      target: { value: "  Updated Farm  " },
    });
    fireEvent.click(within(dialog).getByLabelText("Visible on the public Growth Tracker"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const update = vi.mocked(api).mock.calls[1];
    expect(update[0]).toBe(`admin/tracker-farms/${firstFarm.id}`);
    expect(JSON.parse(String(update[1]?.body))).toEqual({
      name_en: "Updated Farm",
      name_vi: firstFarm.name_vi,
      location_en: firstFarm.location_en,
      location_vi: firstFarm.location_vi,
      signup_count: 14,
      is_visible: false,
      version: 1,
    });
    expect(await screen.findByText("Updated Farm")).toBeVisible();
    expect(screen.getByText("Hidden")).toBeVisible();
  });

  it("reloads authoritative form data and reports a version conflict", async () => {
    const fresh = { ...firstFarm, name_en: "Server Farm", signup_count: 18, version: 2 };
    const conflict = Object.assign(new Error("version_conflict"), { status: 409 });
    vi.mocked(api)
      .mockResolvedValueOnce([firstFarm])
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce([fresh]);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Green Valley Farm" }));
    const dialog = screen.getByRole("dialog", { name: "Edit farm" });
    fireEvent.change(within(dialog).getByLabelText("Farm name — English *"), {
      target: { value: "Stale edit" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Another administrator updated the list",
    );
    expect(within(dialog).getByLabelText("Farm name — English *")).toHaveValue("Server Farm");
    expect(api).toHaveBeenNthCalledWith(3, "admin/tracker-farms");
  });

  it("requires permanent-delete confirmation and removes only after success", async () => {
    vi.mocked(api).mockResolvedValueOnce([firstFarm, secondFarm]);
    vi.mocked(apiEnvelope).mockResolvedValueOnce({ data: undefined });
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "Delete Green Valley Farm" }));
    const dialog = screen.getByRole("dialog", { name: "Permanently delete farm" });
    expect(dialog).toHaveTextContent("cannot be restored");
    expect(apiEnvelope).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenCalledWith(`admin/tracker-farms/${firstFarm.id}`, {
        method: "DELETE",
      }),
    );
    expect(screen.queryByText("Green Valley Farm")).toBeNull();
    expect(screen.getByText("River Farm")).toBeVisible();
  });

  it("preserves the farm and dialog when permanent deletion fails", async () => {
    vi.mocked(api).mockResolvedValueOnce([firstFarm]);
    vi.mocked(apiEnvelope).mockRejectedValueOnce(new Error("network_error"));
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "Delete Green Valley Farm" }));
    const dialog = screen.getByRole("dialog", { name: "Permanently delete farm" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Could not connect");
    expect(screen.getByText("Green Valley Farm")).toBeVisible();
    expect(dialog).toBeVisible();
  });

  it("changes order locally with keyboard controls and Cancel restores server order", async () => {
    vi.mocked(api).mockResolvedValueOnce([firstFarm, secondFarm]);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley Farm down" }));
    expect(rows()[0]).toHaveTextContent("River Farm");
    expect(screen.getByRole("button", { name: "Save order" })).toBeVisible();
    expect(api).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel order changes" }));
    expect(rows()[0]).toHaveTextContent("Green Valley Farm");
    expect(screen.queryByRole("button", { name: "Save order" })).toBeNull();
  });

  it("uses only the drag handle to change local order without auto-saving", async () => {
    vi.mocked(api).mockResolvedValueOnce([firstFarm, secondFarm]);
    providers();
    const data = new Map<string, string>();
    const dataTransfer = {
      dropEffect: "move",
      effectAllowed: "move",
      getData: (key: string) => data.get(key) ?? "",
      setData: (key: string, value: string) => data.set(key, value),
    };

    const handle = await screen.findByRole("button", { name: "Drag to reorder Green Valley Farm" });
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.drop(rows()[1], { dataTransfer });

    expect(rows()[0]).toHaveTextContent("River Farm");
    expect(screen.getByRole("button", { name: "Save order" })).toBeVisible();
    expect(api).toHaveBeenCalledTimes(1);
    expect(rows()[0]).not.toHaveAttribute("draggable");
  });

  it("sends every farm/version once, prevents duplicate saves, and uses server order", async () => {
    const save = deferred<TrackerFarm[]>();
    const serverOrder = [
      { ...secondFarm, sort_order: 0, version: 2 },
      { ...firstFarm, sort_order: 1, version: 2 },
    ];
    vi.mocked(api).mockResolvedValueOnce([firstFarm, secondFarm]).mockReturnValueOnce(save.promise);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley Farm down" }));
    const saveButton = screen.getByRole("button", { name: "Save order" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenNthCalledWith(2, "admin/tracker-farms/reorder", {
      method: "PATCH",
      body: JSON.stringify({
        items: [
          { id: secondFarm.id, sort_order: 0, version: 1 },
          { id: firstFarm.id, sort_order: 1, version: 1 },
        ],
      }),
    });
    expect(screen.getByRole("button", { name: "Saving order…" })).toBeDisabled();

    await act(async () => save.resolve(serverOrder));
    expect(screen.queryByRole("button", { name: "Save order" })).toBeNull();
    expect(rows()[0]).toHaveTextContent("River Farm");
  });

  it("discards local order and reloads after a reorder version conflict", async () => {
    const fresh = [
      { ...firstFarm, name_en: "Fresh First", version: 2 },
      { ...secondFarm, version: 2 },
    ];
    const conflict = Object.assign(new Error("version_conflict"), { status: 409 });
    vi.mocked(api)
      .mockResolvedValueOnce([firstFarm, secondFarm])
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(fresh);
    providers();

    fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley Farm down" }));
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));

    expect(
      (await screen.findAllByRole("alert")).some((alert) =>
        alert.textContent?.includes("Another administrator updated the list"),
      ),
    ).toBe(true);
    expect(rows()[0]).toHaveTextContent("Fresh First");
    expect(screen.queryByRole("button", { name: "Save order" })).toBeNull();
    expect(api).toHaveBeenNthCalledWith(3, "admin/tracker-farms");
  });

  it("keeps drag, keyboard, Edit, and Delete controls accessible on mobile", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    vi.mocked(api).mockResolvedValueOnce([firstFarm, secondFarm]);
    providers();

    expect(
      await screen.findByRole("button", { name: "Drag to reorder Green Valley Farm" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Move Green Valley Farm down" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit Green Valley Farm" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete Green Valley Farm" })).toBeVisible();
  });
});
