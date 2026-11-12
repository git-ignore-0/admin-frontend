import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSARoundEditor } from "@/components/csa-round-editor";
import { CSARoundList } from "@/components/csa-round-list";
import { storeCancellationReason } from "@/lib/store-orders-copy";
import { csaSelectionReason } from "@/lib/csa-rounds-copy";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { api, apiEnvelope } from "@/lib/client-api";
import { isAllowedBackendRequest } from "@/lib/backend-target";
import { validateRoundDates, validateReopenDeadline } from "@/lib/csa-rounds";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const dates = {
  opens_at: "2026-11-20T08:00:00+07:00",
  closes_at: "2026-11-21T18:00:00+07:00",
  delivery_at: "2026-11-22T09:00:00+07:00",
};

describe("CSA rounds", () => {
  it("allows only exact implemented BFF routes", () => {
    for (const [path, methods] of [
      [
        ["admin", "csa-rounds"],
        ["GET", "POST"],
      ],
      [
        ["admin", "csa-rounds", id],
        ["GET", "PATCH"],
      ],
      [["admin", "csa-rounds", id, "publish"], ["POST"]],
      [["admin", "csa-rounds", id, "cancel"], ["POST"]],
      [["admin", "csa-rounds", id, "selections"], ["GET"]],
      [["admin", "csa-selections", id, "reopen"], ["POST"]],
      [["admin", "csa-selections", id, "events"], ["GET"]],
    ]) {
      for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"])
        expect(isAllowedBackendRequest(method, path)).toBe(methods.includes(method));
      expect(isAllowedBackendRequest("POST", [...path, "extra"])).toBe(false);
    }
    expect(isAllowedBackendRequest("POST", ["admin", "csa-selections", "bad", "reopen"])).toBe(
      false,
    );
  });
  it("validates A<B<C locally and leaves cross-round checks to publication", () => {
    expect(validateRoundDates(dates)).toBeNull();
    expect(validateRoundDates({ ...dates, closes_at: dates.opens_at })).toBe("schedule");
    expect(validateRoundDates({ ...dates, delivery_at: dates.closes_at })).toBe("schedule");
    expect(validateRoundDates({ ...dates, opens_at: "" })).toBe("schedule");
  });
  it("requires a future reopen deadline strictly before C", () => {
    const now = Date.parse(dates.closes_at);
    expect(validateReopenDeadline(dates.closes_at, dates.delivery_at, now)).toBe(false);
    expect(validateReopenDeadline(dates.delivery_at, dates.delivery_at, now)).toBe(false);
    expect(validateReopenDeadline("2026-11-21T20:00:00+07:00", dates.delivery_at, now)).toBe(true);
  });
  it("does not render an editable form when existing round loading fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("request_failed"));
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundEditor roundId={id} />
      </AdminI18nProvider>,
    );
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  });
  it("saves a draft with Vietnam timestamps and no product configuration", async () => {
    vi.mocked(api).mockResolvedValueOnce({ id });
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundEditor />
      </AdminI18nProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Round name"), { target: { value: "Week 1" } });
    for (const [label, value] of [
      ["Selection opens", "2026-11-20T08:00"],
      ["Selection closes", "2026-11-21T18:00"],
      ["Delivery", "2026-11-22T09:00"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/csa-rounds",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Week 1", ...dates }),
        }),
      ),
    );
  });
  it("blocks reopening an allocated order", async () => {
    vi.mocked(api).mockResolvedValue({
      status: "pending_delivery",
      approved_at: dates.closes_at,
      server_time: dates.closes_at,
      csa: { round: { delivery_at: dates.delivery_at }, selection: { id, state: "locked" } },
    });
    render(
      <AdminI18nProvider initialLocale="en">
        <CSAReopenDialog
          selectionId={id}
          orderId={id}
          deliveryAt={dates.delivery_at}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </AdminI18nProvider>,
    );
    expect(await screen.findByText(/already allocated/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(apiEnvelope).not.toHaveBeenCalled();
  });
});

const round = {
  id,
  sequence: 1,
  name: "Week 1",
  can_edit: true,
  ...dates,
  status: "draft" as const,
  server_time: dates.closes_at,
};
const selection = {
  id,
  round_id: id,
  membership_id: id,
  state: "locked" as const,
  revision: 1,
  order_id: id,
  reopen_until: null,
  server_time: dates.closes_at,
  customer_name: "Member A",
  lines: [
    {
      product_id: id,
      quantity: 2,
      name: "Tomato",
      unit_size: "1",
      unit_label: "kg",
      quota_cost: "1",
    },
  ],
  events: [],
};

it("locks editing when a published round already has a participant", async () => {
  vi.mocked(api).mockResolvedValue({ ...round, status: "open", can_edit: false });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor roundId={id} />
    </AdminI18nProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be edited/i);
  expect(screen.queryByLabelText("Round name")).not.toBeInTheDocument();
});

it("reopens with a Vietnam deadline, blocks duplicate submissions and calls refresh", async () => {
  let resolve: (value: unknown) => void = () => {};
  vi.mocked(api)
    .mockResolvedValueOnce({
      status: "pending_review",
      approved_at: null,
      server_time: dates.closes_at,
      csa: { round, selection },
    })
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  const onSaved = vi.fn();
  render(
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={id}
        orderId={id}
        deliveryAt={dates.delivery_at}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </AdminI18nProvider>,
  );
  const input = await screen.findByLabelText("Selection deadline");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "2026-11-21T20:00" } });
  const confirm = screen.getByRole("button", { name: "Confirm" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(api).toHaveBeenCalledTimes(2);
  expect(api).toHaveBeenLastCalledWith(`admin/csa-selections/${id}/reopen`, {
    method: "POST",
    body: JSON.stringify({
      deadline: "2026-11-21T20:00:00+07:00",
      expected_revision: selection.revision,
    }),
  });
  resolve(selection);
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
});

it("keeps the deadline form when backend rejects the selected deadline", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({
      status: "pending_review",
      approved_at: null,
      server_time: dates.closes_at,
      csa: { round, selection },
    })
    .mockRejectedValueOnce(new Error("csa_reselection_deadline_invalid"));
  render(
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={id}
        orderId={id}
        deliveryAt={dates.delivery_at}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </AdminI18nProvider>,
  );
  const input = await screen.findByLabelText("Selection deadline");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "2026-11-21T20:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/before the delivery time/);
  expect(input).toHaveValue("2026-11-21T20:00");
});

it("does not offer allocation approval while a CSA member is choosing again", async () => {
  const { getStoreOrderActions } = await import("@/lib/store-orders");
  const order = {
    status: "pending_review",
    total_vnd: "0",
    payment_status: "not_required",
    csa: { round, selection: { ...selection, state: "reselecting" } },
  };
  expect(getStoreOrderActions(order as never)).not.toContain("approve");
  expect(getStoreOrderActions({ ...order, csa: { round, selection } } as never)).toContain(
    "approve",
  );
});

it("uses round editability metadata without fetching participants", async () => {
  vi.mocked(api).mockResolvedValue(round);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor roundId={id} />
    </AdminI18nProvider>,
  );
  await screen.findByLabelText("Round name");
  expect(api).toHaveBeenCalledTimes(1);
  expect(apiEnvelope).not.toHaveBeenCalled();
});

it("translates system reasons in both languages and preserves administrator text", () => {
  expect(csaSelectionReason("reselection_expired", null, "vi")).toBe("Đã hết hạn chọn lại.");
  expect(csaSelectionReason("empty_or_revoked", null, "vi")).toBe(
    "Lựa chọn trống hoặc quyền lợi đã bị thu hồi.",
  );
  expect(csaSelectionReason("empty_or_revoked", null, "en")).toBe(
    "The selection was empty or the membership benefit was revoked.",
  );
  expect(csaSelectionReason("reselection_expired", id, "vi")).toBe("reselection_expired");
  expect(csaSelectionReason("No harvest", id, "en")).toBe("No harvest");
});
it("pages the round list using server totals", async () => {
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({ data: [round], meta: { page: 1, page_size: 20, total: 21 } })
    .mockResolvedValueOnce({
      data: [{ ...round, id: "other", name: "Week 2" }],
      meta: { page: 2, page_size: 20, total: 21 },
    });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundList />
    </AdminI18nProvider>,
  );
  await screen.findByText("Week 1");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Week 2")).toBeVisible();
  expect(apiEnvelope).toHaveBeenLastCalledWith("admin/csa-rounds?page=2&page_size=20");
});

it("shows the authoritative overlap error when saving a published round", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ ...round, status: "scheduled" })
    .mockRejectedValueOnce(new Error("csa_round_schedule_conflict"));
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 1, total: 0 },
    demand: [],
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor roundId={id} />
    </AdminI18nProvider>,
  );
  await screen.findByLabelText("Round name");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Selection windows overlap a published round.",
  );
  expect(screen.getByLabelText("Round name")).toHaveValue("Week 1");
  expect(api).toHaveBeenLastCalledWith(`admin/csa-rounds/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Week 1", ...dates }),
  });
});

it("translates expired CSA reselection cancellation in Store orders", () => {
  expect(storeCancellationReason("reselection_expired", "en")).toBe("Reselection deadline expired");
  expect(storeCancellationReason("reselection_expired", "vi")).not.toBe("reselection_expired");
  expect(storeCancellationReason("Farmer unavailable", "en")).toBe("Farmer unavailable");
});
