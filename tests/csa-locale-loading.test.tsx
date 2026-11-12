import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { CSARoundDetail } from "@/components/csa-round-detail";
import { CSARoundList } from "@/components/csa-round-list";
import { CSASelectionHistory } from "@/components/csa-selection-history";
import { api, apiEnvelope } from "@/lib/client-api";
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function Switch() {
  const { setLocale } = useAdminI18n();
  return <button onClick={() => setLocale("vi")}>Switch</button>;
}
function wrap(children: React.ReactNode) {
  return render(
    <AdminI18nProvider initialLocale="en">
      <Switch />
      {children}
    </AdminI18nProvider>,
  );
}
it("keeps round list data when switching locale", async () => {
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
  });
  wrap(<CSARoundList />);
  await screen.findByText("No CSA rounds yet.");
  expect(apiEnvelope).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Switch"));
  await screen.findByText("Chưa có đợt CSA.");
  expect(apiEnvelope).toHaveBeenCalledTimes(1);
});
it("keeps loaded history when switching locale", async () => {
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
  });
  wrap(<CSASelectionHistory selectionId="s" />);
  const details = screen.getByText("Selection history").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await screen.findByText("No history yet.");
  expect(apiEnvelope).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Switch"));
  await screen.findByText("Chưa có lịch sử.");
  expect(apiEnvelope).toHaveBeenCalledTimes(1);
});
it("refreshes only localized demand and keeps history open on locale change", async () => {
  vi.mocked(api).mockResolvedValue({
    id: "r",
    sequence: 1,
    name: "Round",
    status: "closed",
    opens_at: "2026-11-20T08:00:00+07:00",
    closes_at: "2026-11-21T18:00:00+07:00",
    delivery_at: "2026-11-22T09:00:00+07:00",
  });
  vi.mocked(apiEnvelope).mockImplementation(async (path) =>
    path.includes("/events?")
      ? { data: [], meta: { page: 1, page_size: 20, total: 0 } }
      : {
          data: [{ id: "s", membership_id: "m", state: "locked", lines: [], reopen_until: null }],
          demand: [],
          meta: { page: 1, page_size: 20, total: 1 },
        },
  );
  wrap(<CSARoundDetail roundId="r" />);
  const details = (await screen.findByText("Selection history")).closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await screen.findByText("No history yet.");
  expect(vi.mocked(apiEnvelope).mock.calls.filter(([p]) => p.includes("/events?"))).toHaveLength(1);
  fireEvent.click(screen.getByText("Switch"));
  await waitFor(() =>
    expect(
      vi.mocked(apiEnvelope).mock.calls.filter(([p]) => p.includes("/selections?")),
    ).toHaveLength(2),
  );
  const newDetails = (await screen.findByText("Lịch sử lựa chọn")).closest("details")!;
  expect(newDetails.open).toBe(true);
  expect(vi.mocked(apiEnvelope).mock.calls.filter(([p]) => p.includes("/events?"))).toHaveLength(1);
  expect(
    vi.mocked(apiEnvelope).mock.calls.filter(([p]) => p.includes("/selections?")),
  ).toHaveLength(2);
});

it("refreshes open history when the selection revision changes", async () => {
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
  });
  const view = wrap(<CSASelectionHistory selectionId="s" refreshToken="1:locked" />);
  const details = screen.getByText("Selection history").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await screen.findByText("No history yet.");
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [
      {
        action: "saved",
        actor_id: "member",
        created_at: "2026-11-21T18:00:00+07:00",
        context: {
          lines: [{ name: "Fresh carrots", quantity: 2, unit_size: "500", unit_label: "g" }],
        },
      },
    ],
    meta: { page: 1, page_size: 20, total: 1 },
  });
  view.rerender(
    <AdminI18nProvider initialLocale="en">
      <Switch />
      <CSASelectionHistory selectionId="s" refreshToken="2:reselecting" />
    </AdminI18nProvider>,
  );
  const product = await screen.findByText("Fresh carrots:");
  expect(product.closest("li")).toHaveTextContent("Fresh carrots: 2 × 500 g");
  expect(screen.getByText("Selection history").closest("details")!.open).toBe(true);
  expect(apiEnvelope).toHaveBeenCalledTimes(2);
});

it("keeps fresh round status when locale changes during an explicit refresh", async () => {
  const draft = {
    id: "r",
    sequence: 1,
    name: "Round",
    status: "draft",
    opens_at: "2026-11-20T08:00:00+07:00",
    closes_at: "2026-11-21T18:00:00+07:00",
    delivery_at: "2026-11-22T09:00:00+07:00",
  };
  const published = { ...draft, status: "scheduled" };
  let finishRefresh!: (value: typeof published) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(draft)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    )
    .mockResolvedValue(published);
  const participants = {
    data: [],
    demand: [],
    meta: { page: 1, page_size: 20, total: 0 },
  };
  vi.mocked(apiEnvelope).mockResolvedValue(participants);
  wrap(<CSARoundDetail roundId="r" />);
  await screen.findByRole("button", { name: "Publish round" });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByText("Switch"));
  await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(3));
  await act(async () => finishRefresh(published));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Công bố đợt" })).not.toBeInTheDocument(),
  );
});

it("retains the current locale when a pending mutation completes", async () => {
  const round = {
    id: "r",
    name: "Round",
    status: "draft",
    opens_at: "2026-11-10T01:00:00Z",
    closes_at: "2026-11-11T01:00:00Z",
    delivery_at: "2026-11-15T01:00:00Z",
  };
  let finish!: () => void;
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (init?.method === "POST") await new Promise<void>((r) => (finish = r));
    return round;
  });
  vi.mocked(apiEnvelope).mockImplementation(async (path) => ({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
    demand: [
      {
        product_id: "p",
        name: path.endsWith("locale=en") ? "English demand" : "Nhu cầu Việt",
        quantity: 2,
        unit_size: "500",
        unit_label: "g",
      },
    ],
  }));
  render(
    <AdminI18nProvider initialLocale="en">
      <Switch />
      <CSARoundDetail roundId="r" />
    </AdminI18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Publish round" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.click(screen.getByText("Switch"));
  await screen.findByText("Nhu cầu Việt");
  await act(async () => finish());
  await waitFor(() => expect(screen.queryByText("English demand")).not.toBeInTheDocument());
  expect(screen.getByText("Nhu cầu Việt")).toBeVisible();
  expect(screen.getByText("Tổng nhu cầu sản phẩm")).toBeVisible();
});
