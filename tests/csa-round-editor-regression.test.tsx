import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { it, vi, expect, afterEach } from "vitest";
import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { CSARoundEditor } from "@/components/csa-round-editor";
import { api, apiEnvelope } from "@/lib/client-api";

const rootId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const childId = "3894c718-0ed1-414f-9dfe-c6d880fd871b";
const root = {
  id: rootId,
  name: "Weekly basket",
  sequence: 1,
  status: "draft",
  can_edit: true,
  recurrence_mode: "auto",
  opens_at: "2026-11-20T08:00:00+07:00",
  closes_at: "2026-11-21T18:00:00+07:00",
  delivery_date: "2026-11-22",
  server_time: "2026-11-19T08:00:00+07:00",
  recurrence: {
    root_round_id: rootId,
    mode: "auto",
    status: "pending",
    next_create_at: null,
    occurrence_count: 1,
  },
};
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function Switch() {
  const { setLocale } = useAdminI18n();
  return <button onClick={() => setLocale("vi")}>Switch locale</button>;
}
it("preserves unsaved round edits when switching locale", async () => {
  vi.mocked(api).mockResolvedValue({
    id: "r",
    name: "Server name",
    status: "draft",
    can_edit: true,
    opens_at: "2026-11-20T08:00:00+07:00",
    closes_at: "2026-11-21T18:00:00+07:00",
    delivery_date: "2026-11-22",
  });
  render(
    <AdminI18nProvider initialLocale="en">
      <Switch />
      <CSARoundEditor roundId="r" />
    </AdminI18nProvider>,
  );
  expect(screen.getByRole("heading", { name: "Edit round", level: 1 })).toHaveClass(
    "mantine-VisuallyHidden-root",
  );
  fireEvent.change(await screen.findByRole("textbox", { name: "Round name" }), {
    target: { value: "Unsaved new name" },
  });
  expect(screen.getByRole("textbox", { name: "Round name" })).toHaveValue("Unsaved new name");
  fireEvent.change(screen.getByLabelText(/^Selection opens/), {
    target: { value: "2026-11-20T10:00" },
  });
  fireEvent.click(screen.getByText("Switch locale"));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Tên đợt" })).toHaveValue("Unsaved new name"),
  );
  expect(screen.getByLabelText(/^Bắt đầu chọn hàng/)).toHaveValue("2026-11-20T10:00");
  expect(api).toHaveBeenCalledTimes(1);
  expect(apiEnvelope).not.toHaveBeenCalled();
});

it("shows configuration information, schedule and the one-time default in the Vietnamese create form", async () => {
  render(
    <AdminI18nProvider initialLocale="vi">
      <CSARoundEditor />
    </AdminI18nProvider>,
  );

  expect(screen.getByRole("heading", { name: "Tạo cấu hình", level: 1 })).toHaveClass(
    "mantine-VisuallyHidden-root",
  );
  const details = await screen.findByRole("group", { name: "Thông tin cấu hình" });
  expect(within(details).getByRole("textbox", { name: "Tên cấu hình" })).toBeVisible();
  const schedule = screen.getByRole("group", { name: "Lịch chọn và giao" });
  expect(within(schedule).getByLabelText(/^Bắt đầu chọn hàng/)).toBeRequired();
  expect(within(schedule).getByLabelText(/^Kết thúc chọn hàng/)).toBeRequired();
  expect(within(schedule).getByLabelText(/^Giao hàng/)).toBeRequired();

  const configuration = screen.getByRole("radiogroup", { name: "Loại cấu hình" });
  expect(within(configuration).getByRole("radio", { name: "Một lần" })).toBeChecked();
  expect(within(configuration).getByRole("radio", { name: "Lặp hằng tuần" })).not.toBeChecked();
  expect(screen.queryByRole("radiogroup", { name: "Chế độ lặp" })).not.toBeInTheDocument();
});

it.each(["draft", "auto"])(
  "saves the selected weekly mode (%s) without publishing",
  async (mode) => {
    vi.mocked(api).mockResolvedValue({ ...root, recurrence: { ...root.recurrence, mode } });
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundEditor />
      </AdminI18nProvider>,
    );
    const weekly = await screen.findByRole("radio", { name: "Weekly" });
    const oneTime = screen.getByRole("radio", { name: "One-time" });
    expect(oneTime).toBeChecked();
    expect(weekly).not.toBeChecked();
    expect(screen.queryByRole("radiogroup", { name: "Recurrence mode" })).not.toBeInTheDocument();
    fireEvent.click(weekly);
    expect(oneTime).not.toBeChecked();
    expect(weekly).toBeChecked();
    const group = screen.getByRole("radiogroup", { name: "Recurrence mode" });
    const draft = within(group).getByRole("radio", { name: "Create a draft for me to publish" });
    expect(draft).toBeChecked();
    expect(draft).toHaveAccessibleDescription("Create the round 24 hours before selection opens.");
    const automatic = within(group).getByRole("radio", { name: "Publish automatically" });
    expect(automatic).toHaveAccessibleDescription(
      "Create and publish the round when selection opens.",
    );
    if (mode === "auto") {
      fireEvent.click(automatic);
      fireEvent.click(oneTime);
      expect(screen.queryByRole("radiogroup", { name: "Recurrence mode" })).not.toBeInTheDocument();
      fireEvent.click(weekly);
      expect(screen.getByRole("radio", { name: "Publish automatically" })).toBeChecked();
    }
    fireEvent.change(screen.getByRole("textbox", { name: "Configuration name" }), {
      target: { value: root.name },
    });
    for (const [label, value] of [
      ["Selection opens", "2026-11-20T08:00"],
      ["Selection closes", "2026-11-21T18:00"],
      ["Delivery", "2026-11-22"],
    ])
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("admin/csa-round-configurations", {
        method: "POST",
        body: JSON.stringify({
          name: root.name,
          opens_at: root.opens_at,
          closes_at: root.closes_at,
          delivery_date: root.delivery_date,
          recurrence_mode: mode,
        }),
      }),
    );
    expect(api).toHaveBeenCalledTimes(1);
  },
);

it("lets a draft root explicitly clear weekly recurrence", async () => {
  vi.mocked(api).mockResolvedValue(root);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor configurationId={rootId} />
    </AdminI18nProvider>,
  );
  expect(await screen.findByRole("radio", { name: "Publish automatically" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "One-time" }));
  expect(screen.queryByRole("radiogroup", { name: "Recurrence mode" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith(`admin/csa-round-configurations/${rootId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: root.name,
        opens_at: root.opens_at,
        closes_at: root.closes_at,
        delivery_date: root.delivery_date,
        recurrence_mode: null,
      }),
    }),
  );
});

it("persists the selected mode when saving a draft configuration", async () => {
  vi.mocked(api).mockResolvedValue(root);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor configurationId={rootId} />
    </AdminI18nProvider>,
  );

  fireEvent.change(await screen.findByRole("textbox", { name: "Configuration name" }), {
    target: { value: "Renamed weekly basket" },
  });
  expect(screen.getByRole("radio", { name: "Weekly" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Publish automatically" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith(`admin/csa-round-configurations/${rootId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: "Renamed weekly basket",
        opens_at: root.opens_at,
        closes_at: root.closes_at,
        delivery_date: root.delivery_date,
        recurrence_mode: "auto",
      }),
    }),
  );
});

it.each([
  [rootId, "scheduled", "active"],
  [rootId, "scheduled", "stopped"],
  [childId, "draft", "active"],
  [childId, "draft", "stopped"],
])(
  "edits occurrence %s (%s, %s) without changing its recurrence",
  async (id, status, recurrenceStatus) => {
    vi.mocked(api).mockResolvedValue({
      ...root,
      id,
      status,
      recurrence: { ...root.recurrence, status: recurrenceStatus },
    });
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundEditor roundId={id} />
      </AdminI18nProvider>,
    );
    fireEvent.change(await screen.findByRole("textbox", { name: "Round name" }), {
      target: { value: "This basket only" },
    });
    expect(
      screen.queryByRole("radiogroup", { name: "Configuration type" }),
    ).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toHaveAccessibleDescription(/changes apply only to this round/i);
    fireEvent.click(save);
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(`admin/csa-rounds/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: "This basket only",
          opens_at: root.opens_at,
          closes_at: root.closes_at,
          delivery_date: root.delivery_date,
        }),
      }),
    );
  },
);
