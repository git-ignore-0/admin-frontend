import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { CSARoundEditor } from "@/components/csa-round-editor";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { CSACompanionDelivery } from "@/components/csa-companion-delivery";
import { api } from "@/lib/client-api";
import { validateReopenDeadline, validateRoundDates } from "@/lib/csa-rounds";
import type { CSASelection } from "@/lib/csa-rounds";
import { storeOrderFixture } from "@/tests/store-orders-fixture";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
const round = {
  id: "r",
  sequence: 1,
  name: "Round",
  status: "closed" as const,
  opens_at: "2026-12-30T08:00:00+07:00",
  closes_at: "2026-12-31T18:00:00+07:00",
  delivery_date: "2027-01-01",
  server_time: "2026-12-31T18:00:00+07:00",
};

const orderId = storeOrderFixture().id;
const selectionId = "2aa5ab34-2dce-4cac-8fc4-91e55f03e95f";
const nextOrderId = "2b8b1b30-3e07-4a4d-839b-3e3883250c31";
const nextSelectionId = "f50a5630-f50c-4ba8-8f53-8ab7a65928a9";

function reopenOrder(overrides: Partial<CSASelection> = {}, id = orderId) {
  const roundId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
  return storeOrderFixture({
    id,
    server_time: round.server_time,
    csa: {
      round: { ...round, id: roundId },
      selection: {
        id: selectionId,
        order_id: id,
        round_id: roundId,
        membership_id: "38703641-2dce-4cac-8fc4-91e55f03e95f",
        state: "locked",
        revision: 4,
        reopen_until: null,
        server_time: round.server_time,
        lines: [],
        ...overrides,
      },
    },
  });
}

it("saves an actual date without a fabricated delivery time", async () => {
  vi.mocked(api).mockResolvedValue({ id: "r" });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor />
    </AdminI18nProvider>,
  );
  fireEvent.change(await screen.findByRole("textbox", { name: "Configuration name" }), {
    target: { value: "Year end" },
  });
  fireEvent.change(screen.getByLabelText(/^Selection opens/), {
    target: { value: "2026-12-30T08:00" },
  });
  fireEvent.change(screen.getByLabelText(/^Selection closes/), {
    target: { value: "2026-12-31T18:00" },
  });
  const date = screen.getByLabelText(/^Delivery/);
  expect(date).toHaveAttribute("type", "date");
  fireEvent.change(date, { target: { value: "2027-01-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("admin/csa-round-configurations", {
      method: "POST",
      body: JSON.stringify({
        name: "Year end",
        opens_at: round.opens_at,
        closes_at: round.closes_at,
        delivery_date: "2027-01-01",
        recurrence_mode: null,
      }),
    }),
  );
});

it("validates closes before the Vietnam delivery day rather than UTC date", () => {
  expect(validateRoundDates({ ...round, closes_at: "2026-12-31T16:59:00Z" })).toBeNull();
  expect(validateRoundDates({ ...round, closes_at: "2026-12-31T17:00:00Z" })).toBe("schedule");
  expect(validateRoundDates({ ...round, delivery_date: "2027-02-30" })).toBe("schedule");
});
it.each(["2027-01-01", "2027-03-01", "2028-03-01"])(
  "keeps the strict date boundary for %s",
  (day) => {
    const boundary = Date.parse(`${day}T00:00:00+07:00`);
    const now = boundary - 2 * 60_000;
    expect(validateReopenDeadline(new Date(boundary - 60_000).toISOString(), day, now)).toBe(true);
    expect(validateReopenDeadline(new Date(boundary).toISOString(), day, now)).toBe(false);
    expect(validateReopenDeadline(new Date(now).toISOString(), day, now)).toBe(false);
  },
);

it("bounds companion cutoff to previous 23:59 and closes after cutoff", async () => {
  const configured = {
    companion_delivery_enabled: true,
    companion_delivery_cutoff: "2026-12-31T20:00:00+07:00",
  };
  vi.mocked(api)
    .mockResolvedValueOnce(configured)
    .mockResolvedValueOnce({ ...configured, companion_delivery_enabled: false });
  const receivedAt = performance.now();
  const result = render(
    <AdminI18nProvider initialLocale="en">
      <CSACompanionDelivery round={round} receivedAt={receivedAt} />
    </AdminI18nProvider>,
  );
  const input = await screen.findByLabelText("Companion order cutoff");
  expect(input).toHaveAttribute("max", "2026-12-31T23:59");
  fireEvent.change(input, { target: { value: "2026-12-31T23:59" } });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  fireEvent.change(input, { target: { value: "2027-01-01T00:00" } });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  result.rerender(
    <AdminI18nProvider initialLocale="en">
      <CSACompanionDelivery
        round={{ ...round, server_time: "2027-01-01T00:00:00+07:00" }}
        receivedAt={performance.now()}
      />
    </AdminI18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop accepting" }));
  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith("admin/csa-rounds/r/companion-delivery", {
      method: "PATCH",
      body: '{"companion_delivery_enabled":false}',
    }),
  );
});

it("reopen follows server elapsed time and requires a valid date before enabling", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-01-01T00:00:00Z"));
  vi.mocked(api).mockResolvedValue(reopenOrder());
  render(
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={selectionId}
        orderId={orderId}
        deliveryDate={round.delivery_date}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </AdminI18nProvider>,
  );
  const input = await screen.findByLabelText("Selection deadline");
  expect(input).toHaveAttribute("max", "2026-12-31T23:59");
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "2026-12-31T23:59" } });
  expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
  fireEvent.change(input, { target: { value: "2027-01-01T00:00" } });
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await act(async () => {});
});

it("ignores an old round save after navigating to another round", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api)
    .mockResolvedValueOnce({ ...round, can_edit: true })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ ...round, id: "new", name: "New round", can_edit: true });
  const result = render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor roundId="r" />
    </AdminI18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  result.rerender(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor roundId="new" />
    </AdminI18nProvider>,
  );
  await screen.findByDisplayValue("New round");
  await act(async () => finish({ id: "r" }));
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
});

it("ignores a round save after unmount", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api)
    .mockResolvedValueOnce({ ...round, can_edit: true })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const result = render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor roundId="r" />
    </AdminI18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
  result.unmount();
  await act(async () => finish({ id: "r" }));
  expect(push).not.toHaveBeenCalled();
});

it("keeps a reopen deadline draft across locale change while request remains single", async () => {
  vi.mocked(api).mockResolvedValue(reopenOrder());
  function Switch() {
    const { setLocale } = useAdminI18n();
    return <button onClick={() => setLocale("vi")}>VI</button>;
  }
  render(
    <AdminI18nProvider initialLocale="en">
      <Switch />
      <CSAReopenDialog
        selectionId={selectionId}
        orderId={orderId}
        deliveryDate={round.delivery_date}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </AdminI18nProvider>,
  );
  const input = await screen.findByLabelText("Selection deadline");
  fireEvent.change(input, { target: { value: "2026-12-31T23:59" } });
  fireEvent.click(screen.getByRole("button", { name: "VI" }));
  expect(screen.getByLabelText("Hạn khóa lại")).toHaveValue("2026-12-31T23:59");
  expect(api).toHaveBeenCalledTimes(1);
});

it("ignores an old reopen result after changing orders and releases the mutation lock", async () => {
  let finish!: (value: unknown) => void;
  const onSaved = vi.fn();
  vi.mocked(api)
    .mockResolvedValueOnce(reopenOrder())
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(reopenOrder({ id: nextSelectionId }, nextOrderId));
  const result = render(
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={selectionId}
        orderId={orderId}
        deliveryDate={round.delivery_date}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </AdminI18nProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Selection deadline"), {
    target: { value: "2026-12-31T23:59" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  result.rerender(
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={nextSelectionId}
        orderId={nextOrderId}
        deliveryDate={round.delivery_date}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </AdminI18nProvider>,
  );
  await screen.findByLabelText("Selection deadline");
  await act(async () => finish({}));
  expect(onSaved).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Selection deadline"), {
    target: { value: "2026-12-31T23:59" },
  });
  expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
});

it("retries a failed reopen read inside the dialog without automatically posting", async () => {
  let finish!: (value: unknown) => void;
  const onSaved = vi.fn();
  vi.mocked(api)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({});
  render(
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={selectionId}
        orderId={orderId}
        deliveryDate={round.delivery_date}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </AdminI18nProvider>,
  );
  const modal = screen.getByRole("dialog");
  await within(modal).findByRole("alert");
  expect(within(modal).getByRole("button", { name: "Confirm" })).toBeDisabled();
  fireEvent.click(within(modal).getByRole("button", { name: "Refresh" }));
  expect(within(modal).getByRole("status")).toBeVisible();
  expect(within(modal).getByRole("button", { name: "Confirm" })).toBeDisabled();
  await act(async () => finish(reopenOrder({ revision: 7 })));
  expect(api).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api).mock.calls.every(([, init]) => !init?.method)).toBe(true);
  expect(onSaved).not.toHaveBeenCalled();
  fireEvent.change(within(modal).getByLabelText("Selection deadline"), {
    target: { value: "2026-12-31T23:59" },
  });
  fireEvent.click(within(modal).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(api).toHaveBeenLastCalledWith(`admin/csa-selections/${selectionId}/reopen`, {
    method: "POST",
    body: JSON.stringify({ deadline: "2026-12-31T23:59:00+07:00", expected_revision: 7 }),
  });
});

it.each([
  [
    "locked",
    null,
    /Reopening releases the existing stock holds.*cannot select discontinued products/,
  ],
  [
    "reselecting",
    "2026-12-31T23:10:00+07:00",
    /Extending the deadline preserves the current selection and effective holds/,
  ],
] as const)(
  "shows the stock-hold consequence for a %s selection",
  async (state, reopenUntil, warning) => {
    vi.mocked(api).mockResolvedValue(reopenOrder({ state, reopen_until: reopenUntil }));
    render(
      <AdminI18nProvider initialLocale="en">
        <CSAReopenDialog
          selectionId={selectionId}
          orderId={orderId}
          deliveryDate={round.delivery_date}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </AdminI18nProvider>,
    );
    const explanation = await screen.findByRole("note");
    expect(explanation).toBeVisible();
    expect(explanation).toHaveTextContent(warning);
    expect(within(screen.getByRole("dialog")).getByLabelText(/deadline/i)).toHaveAttribute(
      "type",
      "datetime-local",
    );
    expect(
      screen.queryByText(
        state === "locked" ? /Extending the deadline preserves/ : /Reopening releases/,
      ),
    ).not.toBeInTheDocument();
  },
);
