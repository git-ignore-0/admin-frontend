import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSARoundDetail } from "@/components/csa-round-detail";
import { api, apiEnvelope } from "@/lib/client-api";
vi.mock("@/components/csa-companion-delivery", () => ({ CSACompanionDelivery: () => null }));
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const round = {
  id,
  sequence: 1,
  name: "Week 1",
  status: "draft",
  opens_at: "2026-11-20T08:00:00+07:00",
  closes_at: "2026-11-21T18:00:00+07:00",
  delivery_date: "2026-11-22",
  server_time: "2026-11-19T08:00:00+07:00",
};
it("publishes only after confirmation and reloads the round", async () => {
  vi.mocked(api).mockResolvedValue(round);
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
    demand: [],
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Publish round" }));
  const dialog = screen.getByRole("dialog");
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(`admin/csa-rounds/${id}/publish`, {
      method: "POST",
      body: "{}",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(apiEnvelope).toHaveBeenCalledTimes(2);
});
it("requires a reason for cancellation and keeps it after a rejected cancellation", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(round)
    .mockRejectedValueOnce(new Error("csa_order_already_allocated"));
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
    demand: [],
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Cancel round" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a cancellation reason.");
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Cancellation reason"), {
    target: { value: "No harvest" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/already allocated/);
  expect(screen.getByLabelText("Cancellation reason")).toHaveValue("No harvest");
});
it("shows demand, member selections, history and the existing order link", async () => {
  vi.mocked(api).mockResolvedValue({ ...round, status: "closed" });
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [
      {
        id,
        round_id: id,
        membership_id: id,
        customer_name: "Member A",
        state: "locked",
        order_id: id,
        reopen_until: null,
        revision: 1,
        lines: [
          {
            product_id: id,
            name: "Tomato",
            quantity: 2,
            unit_size: "500",
            unit_label: "g",
            quota_cost: "1",
          },
        ],
      },
    ],
    meta: { page: 1, page_size: 20, total: 21 },
    demand: [
      {
        product_id: "other-product",
        quantity: 2,
        name: "Tomato",
        unit_size: "500",
        unit_label: "g",
      },
    ],
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  expect(await screen.findByText("Member A")).toBeVisible();
  expect(screen.getByRole("link", { name: "View order" })).toHaveAttribute(
    "href",
    `/store-orders/${id}`,
  );
  expect(
    screen.queryByRole("link", { name: "Membership used for this order" }),
  ).not.toBeInTheDocument();
  expect(within(screen.getByRole("table")).getByText("Tomato")).toBeVisible();
  expect(within(screen.getByRole("table")).getByText("2 × 500 g")).toBeVisible();
  const member = screen.getByText("Member A").closest("article")!;
  expect(within(member).getByText("Tomato").closest("li")).toHaveTextContent("Tomato 2 × 500 g");
  expect(apiEnvelope).toHaveBeenCalledTimes(1);
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [
      {
        action: "cancelled",
        created_at: round.closes_at,
        actor_id: null,
        context: { reason: "reselection_expired" },
      },
    ],
    meta: { page: 1, page_size: 20, total: 21 },
  });
  const history = screen.getByText("Selection history").closest("details")!;
  history.open = true;
  fireEvent(history, new Event("toggle"));
  expect(await screen.findByText("The reselection deadline expired.")).toBeVisible();
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    `admin/csa-selections/${id}/events?page=1&page_size=20`,
  );
  fireEvent.click(within(history).getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(apiEnvelope).toHaveBeenLastCalledWith(
      `admin/csa-selections/${id}/events?page=2&page_size=20`,
    ),
  );
});

it("shows the saved cancellation reason", async () => {
  vi.mocked(api).mockResolvedValue({
    ...round,
    status: "cancelled",
    cancellation_reason: "No harvest",
  });
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
    demand: [],
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  expect(await screen.findByText("No harvest")).toBeVisible();
});

it("pages participants without fetching history or losing full demand labels", async () => {
  vi.mocked(api).mockResolvedValue({ ...round, status: "closed" });
  const person = {
    id,
    membership_id: id,
    customer_name: "First member",
    state: "locked",
    lines: [],
    reopen_until: null,
  };
  const demand = [
    {
      product_id: "not-on-this-page",
      name: "Full demand tomato",
      unit_size: "1",
      unit_label: "kg",
      quantity: 8,
    },
  ];
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({
      data: [person],
      meta: { page: 1, page_size: 20, total: 21 },
      demand,
    } as never)
    .mockResolvedValueOnce({
      data: [{ ...person, customer_name: "Second page member" }],
      meta: { page: 2, page_size: 20, total: 21 },
      demand,
    } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  await screen.findByText("First member");
  expect(screen.queryByRole("link", { name: "Edit round" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Second page member")).toBeVisible();
  expect(screen.getByText("Full demand tomato")).toBeVisible();
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    `admin/csa-rounds/${id}/selections?page=2&page_size=20&locale=en`,
  );
  expect(apiEnvelope).toHaveBeenCalledTimes(2);
});

it.each([false, true])(
  "ignores an old mutation after round identity change or unmount (%s)",
  async (unmount) => {
    let finish!: (value: unknown) => void;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (init?.method === "POST")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return { ...round, id: path.endsWith("/new-round") ? "new-round" : id };
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      demand: [],
      meta: { page: 1, page_size: 20, total: 0 },
    } as never);
    const result = render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundDetail roundId={id} />
      </AdminI18nProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Publish round" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    if (unmount) result.unmount();
    else {
      result.rerender(
        <AdminI18nProvider initialLocale="en">
          <CSARoundDetail roundId="new-round" />
        </AdminI18nProvider>,
      );
      await waitFor(() => expect(api).toHaveBeenCalledWith("admin/csa-rounds/new-round"));
    }
    const reads = vi.mocked(api).mock.calls.filter(([, init]) => !init?.method).length;
    await act(async () => finish(round));
    expect(vi.mocked(api).mock.calls.filter(([, init]) => !init?.method)).toHaveLength(reads);
  },
);
