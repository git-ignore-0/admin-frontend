import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminHeaderContent } from "@/components/admin-header";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSARoundEditor } from "@/components/csa-round-editor";
import { CSARoundList } from "@/components/csa-round-list";
import { storeCancellationReason } from "@/lib/store-orders-copy";
import { csaSelectionReason } from "@/lib/csa-rounds-copy";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { api, apiEnvelope } from "@/lib/client-api";
import { isAllowedBackendRequest } from "@/lib/backend-target";
import { getRoundParticipants, validateRoundDates, validateReopenDeadline } from "@/lib/csa-rounds";

import type { StoreOrder } from "@/lib/types";
import type { CSASelection } from "@/lib/csa-rounds";
import { storeOrderFixture } from "./store-orders-fixture";
import { selectOption } from "./select-option";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    window.addEventListener("popstate", notify);
    return () => window.removeEventListener("popstate", notify);
  };
  return {
    useRouter: () => ({ push, replace: push }),
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search);
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});
beforeEach(() => {
  window.history.replaceState(null, "", "/csa-rounds");
  for (const method of ["pushState", "replaceState"] as const) {
    const change = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation(
      (data, unused, url?: string | URL | null) => {
        change(data, unused, url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
    );
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const dates = {
  opens_at: "2026-11-20T08:00:00+07:00",
  closes_at: "2026-11-21T18:00:00+07:00",
  delivery_date: "2026-11-22",
};

function Header() {
  return <AdminHeaderContent items={useAdminBreadcrumbs([])} />;
}

describe("CSA rounds", () => {
  it("allows only exact implemented BFF routes", () => {
    for (const [path, methods] of [
      [["admin", "csa-rounds"], ["GET"]],
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
  it("validates opening, closing and the delivery day of a single round", () => {
    expect(validateRoundDates(dates)).toBeNull();
    expect(validateRoundDates({ ...dates, closes_at: dates.opens_at })).toBe("schedule");
    expect(validateRoundDates({ ...dates, delivery_date: dates.closes_at })).toBe("schedule");
    expect(validateRoundDates({ ...dates, opens_at: "" })).toBe("schedule");
  });
  it("requires a future reopen deadline strictly before the delivery day", () => {
    const now = Date.parse(dates.closes_at);
    expect(validateReopenDeadline(dates.closes_at, dates.delivery_date, now)).toBe(false);
    expect(validateReopenDeadline(dates.delivery_date, dates.delivery_date, now)).toBe(false);
    expect(validateReopenDeadline("2026-11-21T20:00:00+07:00", dates.delivery_date, now)).toBe(
      true,
    );
  });
  it("does not render an editable form when existing round loading fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("request_failed"));
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundEditor roundId={id} />
      </AdminI18nProvider>,
    );
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });
  it("saves a draft with Vietnam timestamps and no product configuration", async () => {
    const search = "?status=draft&page=2";
    window.history.replaceState(null, "", `/csa-rounds/new${search}`);
    vi.mocked(api).mockResolvedValueOnce({ id });
    render(
      <AdminI18nProvider initialLocale="en">
        <AdminBreadcrumbProvider pathname="/csa-rounds/new" search={search}>
          <Header />
          <CSARoundEditor listPage={2} listStatus="draft" />
        </AdminBreadcrumbProvider>
      </AdminI18nProvider>,
    );
    expect(
      within(screen.getByRole("navigation")).getByRole("link", {
        name: "CSA round configurations",
      }),
    ).toHaveAttribute("href", "/csa-rounds?status=draft&page=2");
    fireEvent.change(await screen.findByRole("textbox", { name: "Configuration name" }), {
      target: { value: "Week 1" },
    });
    for (const [label, value] of [
      ["Selection opens", "2026-11-20T08:00"],
      ["Selection closes", "2026-11-21T18:00"],
      ["Delivery", "2026-11-22"],
    ])
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/csa-round-configurations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Week 1", ...dates, recurrence_mode: null }),
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith(`/csa-rounds/configurations/${id}?status=draft&page=2`);
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("blocks reopening an allocated order", async () => {
    vi.mocked(api).mockResolvedValue(
      reopenOrderFixture({ status: "pending_delivery", approved_at: dates.closes_at }),
    );
    render(
      <AdminI18nProvider initialLocale="en">
        <CSAReopenDialog
          selectionId={id}
          orderId={id}
          deliveryDate={dates.delivery_date}
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
  type: "standalone" as const,
  created_at: dates.opens_at,
  recurrence: null,
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

function reopenOrderFixture(
  overrides: Partial<StoreOrder> = {},
  selected: Partial<CSASelection> = {},
) {
  return storeOrderFixture({
    id,
    server_time: dates.closes_at,
    csa: { round, selection: { ...selection, ...selected } },
    ...overrides,
  });
}

it("locks editing when a published round already has a participant", async () => {
  vi.mocked(api).mockResolvedValue({ ...round, status: "open", can_edit: false });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundEditor roundId={id} />
    </AdminI18nProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be edited/i);
  expect(screen.queryByRole("textbox", { name: "Round name" })).not.toBeInTheDocument();
});

it("reopens with a Vietnam deadline, blocks duplicate submissions and calls refresh", async () => {
  let resolve: (value: unknown) => void = () => {};
  vi.mocked(api)
    .mockResolvedValueOnce(reopenOrderFixture())
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
        deliveryDate={dates.delivery_date}
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
    .mockResolvedValueOnce(reopenOrderFixture())
    .mockRejectedValueOnce(new Error("csa_reselection_deadline_invalid"));
  render(
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={id}
        orderId={id}
        deliveryDate={dates.delivery_date}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </AdminI18nProvider>,
  );
  const input = await screen.findByLabelText("Selection deadline");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "2026-11-21T20:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/before the delivery day/);
  expect(input).toHaveValue("2026-11-21T20:00");
});

it("does not offer allocation approval while a CSA member is choosing again", async () => {
  const { getStoreOrderActions } = await import("@/lib/store-orders");
  const order = {
    workflow_version: 1,
    expires_at: null,
    approved_at: null,
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
  await screen.findByRole("textbox", { name: "Round name" });
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
it("opens a round through its name and refreshes the current list", async () => {
  let finishRefresh!: () => void;
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({ data: [round], meta: { page: 1, page_size: 20, total: 1 } })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = () =>
            resolve({
              data: [{ ...round, name: "Week 1 updated" }],
              meta: { page: 1, page_size: 20, total: 1 },
            });
        }),
    );
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundList />
    </AdminI18nProvider>,
  );

  const name = await screen.findByRole("link", { name: "Week 1" });
  expect(name).toHaveAttribute("href", `/csa-rounds/configurations/${id}`);
  expect(screen.getByRole("link", { name: "Create configuration" })).toHaveAttribute(
    "href",
    "/csa-rounds/new",
  );
  const refresh = screen.getByRole("button", { name: "Refresh" });
  fireEvent.click(refresh);
  const results = within(screen.getByRole("group", { name: "CSA round configurations" }));
  expect(results.queryByText("Loading CSA round…")).not.toBeInTheDocument();
  expect(results.getByRole("status")).toHaveTextContent("Refreshing CSA list…");
  expect(results.getByRole("table")).toHaveAttribute("aria-busy", "true");
  expect(name).toBeVisible();
  expect(refresh).toHaveAttribute("aria-busy", "true");

  await act(async () => finishRefresh());
  expect(await screen.findByRole("link", { name: "Week 1 updated" })).toBeVisible();
  expect(apiEnvelope).toHaveBeenCalledTimes(2);
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    "admin/csa-round-configurations?page=1&page_size=20",
    {
      signal: expect.any(AbortSignal),
    },
  );
});

it("applies and clears the status filter from page one and preserves it in round links", async () => {
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({ data: [round], meta: { page: 2, page_size: 20, total: 21 } })
    .mockResolvedValueOnce({
      data: [{ ...round, name: "Open round", status: "published" }],
      meta: { page: 1, page_size: 20, total: 1 },
    })
    .mockResolvedValueOnce({ data: [round], meta: { page: 1, page_size: 20, total: 1 } });
  window.history.replaceState(null, "", "/csa-rounds?page=2");
  try {
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundList />
      </AdminI18nProvider>,
    );

    await screen.findByRole("link", { name: round.name });
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    const filters = within(screen.getByRole("dialog"));
    selectOption(
      filters.getByRole("textbox", {
        name: "Configuration status",
      }),
      "published",
    );
    expect(apiEnvelope).toHaveBeenCalledTimes(1);
    fireEvent.click(filters.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("link", { name: "Open round" })).toHaveAttribute(
      "href",
      `/csa-rounds/configurations/${id}?status=published`,
    );
    expect(screen.getByRole("link", { name: "Create configuration" })).toHaveAttribute(
      "href",
      "/csa-rounds/new?status=published",
    );
    expect(apiEnvelope).toHaveBeenLastCalledWith(
      "admin/csa-round-configurations?page=1&page_size=20&status=published",
      { signal: expect.any(AbortSignal) },
    );
    expect(window.location.pathname + window.location.search).toBe("/csa-rounds?status=published");

    fireEvent.click(screen.getByRole("button", { name: "Filter (1)" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Clear filters" }),
    );
    expect(await screen.findByRole("link", { name: round.name })).toHaveAttribute(
      "href",
      `/csa-rounds/configurations/${id}`,
    );
    expect(apiEnvelope).toHaveBeenLastCalledWith(
      "admin/csa-round-configurations?page=1&page_size=20",
      {
        signal: expect.any(AbortSignal),
      },
    );
    expect(window.location.pathname + window.location.search).toBe("/csa-rounds");
  } finally {
    window.history.replaceState(null, "", "/");
  }
});

it("hides previous results while a different status loads on the same page", async () => {
  let resolveFiltered!: (value: Awaited<ReturnType<typeof apiEnvelope>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof apiEnvelope>>>((resolve) => {
    resolveFiltered = resolve;
  });
  window.history.replaceState(null, "", "/csa-rounds");
  const meta = { page: 1, page_size: 20, total: 1 };
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({ data: [round], meta })
    .mockReturnValueOnce(pending);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundList />
    </AdminI18nProvider>,
  );

  await screen.findByRole("link", { name: round.name });
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
  const filters = within(screen.getByRole("dialog"));
  selectOption(filters.getByRole("textbox", { name: "Configuration status" }), "published");
  fireEvent.click(filters.getByRole("button", { name: "Apply" }));

  expect(screen.queryByRole("link", { name: round.name })).not.toBeInTheDocument();
  resolveFiltered({ data: [{ ...round, name: "Open round", status: "published" }], meta });
  expect(await screen.findByRole("link", { name: "Open round" })).toBeVisible();
  window.history.replaceState(null, "", "/");
});

it("follows the restored filter and page in the browser history", async () => {
  window.history.pushState(null, "", "/csa-rounds?status=published&page=2");
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({
      data: [{ ...round, name: "Open round on page two", status: "published" }],
      meta: { page: 2, page_size: 20, total: 21 },
    })
    .mockResolvedValueOnce({ data: [round], meta: { page: 1, page_size: 20, total: 1 } });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundList />
    </AdminI18nProvider>,
  );

  expect(await screen.findByRole("link", { name: "Open round on page two" })).toHaveAttribute(
    "href",
    `/csa-rounds/configurations/${id}?status=published&page=2`,
  );
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    "admin/csa-round-configurations?page=2&page_size=20&status=published",
    {
      signal: expect.any(AbortSignal),
    },
  );

  act(() => {
    window.history.pushState(null, "", "/csa-rounds");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(await screen.findByRole("link", { name: round.name })).toHaveAttribute(
    "href",
    `/csa-rounds/configurations/${id}`,
  );
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    "admin/csa-round-configurations?page=1&page_size=20",
    {
      signal: expect.any(AbortSignal),
    },
  );
});

it("pages a filtered round list using server totals and preserves the filter", async () => {
  window.history.replaceState(null, "", "/csa-rounds?status=draft");
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({ data: [round], meta: { page: 1, page_size: 20, total: 21 } })
    .mockResolvedValueOnce({
      data: [{ ...round, id: "other", name: "Week 2", status: "draft" }],
      meta: { page: 2, page_size: 20, total: 21 },
    });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundList />
    </AdminI18nProvider>,
  );
  await screen.findByText("Week 1");
  expect(apiEnvelope).toHaveBeenCalledWith(
    "admin/csa-round-configurations?page=1&page_size=20&status=draft",
    {
      signal: expect.any(AbortSignal),
    },
  );
  const next = screen.getByRole("button", { name: "Next" });
  next.focus();
  fireEvent.click(next);
  expect(screen.getByRole("group", { name: "CSA round configurations" })).toHaveFocus();
  expect(await screen.findByRole("link", { name: "Week 2" })).toHaveAttribute(
    "href",
    "/csa-rounds/configurations/other?status=draft&page=2",
  );
  expect(window.location.pathname + window.location.search).toBe("/csa-rounds?status=draft&page=2");
  window.history.replaceState(null, "", "/");
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    "admin/csa-round-configurations?page=2&page_size=20&status=draft",
    {
      signal: expect.any(AbortSignal),
    },
  );
});

it.each([
  { data: [], meta: { page: 1, page_size: 20, total: 0 } },
  { data: [], meta: { page: 1, page_size: 20, total: 0 }, demand: {} },
  { data: [], meta: { page: 1, page_size: 20, total: 0 }, demand: [null] },
  { data: {}, meta: { page: 1, page_size: 20, total: 0 }, demand: [] },
  { data: [], demand: [] },
])("rejects malformed CSA participant pages %j", async (payload) => {
  vi.mocked(apiEnvelope).mockResolvedValueOnce(payload as never);
  await expect(getRoundParticipants(id)).rejects.toThrow("invalid_response");
});

it("preserves full demand and zero totals when a CSA participant page is empty", async () => {
  const payload = {
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
    demand: [{ product_id: id, quantity: 2, name: "Tomato", unit_size: "1", unit_label: "kg" }],
  };
  vi.mocked(apiEnvelope).mockResolvedValueOnce(payload);
  await expect(getRoundParticipants(id)).resolves.toBe(payload);
});

it("shows the authoritative schedule error when saving a published round", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ ...round, status: "scheduled" })
    .mockRejectedValueOnce(new Error("csa_round_schedule_invalid"));
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
  await screen.findByRole("textbox", { name: "Round name" });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Selection must close after it opens and before the delivery day.",
  );
  expect(screen.getByRole("textbox", { name: "Round name" })).toHaveValue("Week 1");
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

it("blocks extending an existing reselection after its own deadline passes", async () => {
  let elapsed = 1000;
  const monotonic = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  vi.mocked(api).mockResolvedValueOnce(
    reopenOrderFixture(
      {},
      {
        state: "reselecting",
        reopen_until: "2026-11-21T18:01:00+07:00",
      },
    ),
  );
  const view = () => (
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={id}
        orderId={id}
        deliveryDate={dates.delivery_date}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </AdminI18nProvider>
  );
  const rendered = render(view());
  try {
    fireEvent.change(await screen.findByLabelText("Selection deadline"), {
      target: { value: "2026-11-21T18:30" },
    });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeEnabled();
    // Click before a clock-tick rerender: the handler itself must recheck eligibility.
    elapsed = 61000;
    fireEvent.click(confirm);
    expect(api).toHaveBeenCalledTimes(1);
    rendered.rerender(view());
    expect(confirm).toBeDisabled();
  } finally {
    monotonic.mockRestore();
  }
});

it("identifies standalone configurations and links to the selected configuration", async () => {
  const search = "?status=draft&page=2";
  window.history.replaceState(null, "", `/csa-rounds${search}`);
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [round],
    meta: { page: 2, page_size: 20, total: 21 },
  });
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminBreadcrumbProvider pathname="/csa-rounds" search={search}>
        <Header />
        <CSARoundList />
      </AdminBreadcrumbProvider>
    </AdminI18nProvider>,
  );

  expect(
    within(screen.getByRole("navigation")).getByText("CSA round configurations"),
  ).toHaveAttribute("aria-current", "page");
  const name = await screen.findByRole("link", { name: round.name });
  expect(name).toHaveAttribute("href", `/csa-rounds/configurations/${id}${search}`);
  const row = within(name.closest("tr")!);
  expect(row.getByRole("cell", { name: round.name })).toContainElement(name);
  expect(row.getByRole("cell", { name: "Draft" })).toBeVisible();
  expect(row.getByRole("cell", { name: "One-time" })).toBeVisible();
  expect(row.getByText("20/11/2026")).toHaveAttribute("datetime", round.created_at);
  expect(screen.getByRole("link", { name: "Create configuration" })).toHaveAttribute(
    "href",
    `/csa-rounds/new${search}`,
  );
});

it("returns from the edit form via the Admin Header to the same round and filtered list", async () => {
  const search = "?status=draft&page=2";
  const detailPath = `/csa-rounds/${id}`;
  const pathname = `${detailPath}/edit`;
  window.history.replaceState(null, "", pathname + search);
  vi.mocked(api).mockResolvedValue(round);
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminBreadcrumbProvider pathname={pathname} search={search}>
        <Header />
        <main>
          <CSARoundEditor roundId={id} listPage={2} listStatus="draft" />
        </main>
      </AdminBreadcrumbProvider>
    </AdminI18nProvider>,
  );

  await screen.findByRole("textbox", { name: "Round name" });
  const breadcrumbs = within(screen.getByRole("navigation"));
  expect(breadcrumbs.getByRole("link", { name: "CSA round configurations" })).toHaveAttribute(
    "href",
    `/csa-rounds${search}`,
  );
  expect(breadcrumbs.getByRole("link", { name: "CSA round details" })).toHaveAttribute(
    "href",
    detailPath + search,
  );
  expect(within(screen.getByRole("main")).queryByRole("link")).not.toBeInTheDocument();
});

it("cancels an obsolete round-list transport when the URL changes", async () => {
  vi.mocked(apiEnvelope)
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValueOnce({ data: [round], meta: { page: 1, page_size: 20, total: 1 } });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundList />
    </AdminI18nProvider>,
  );
  const signal = vi.mocked(apiEnvelope).mock.calls[0]?.[1]?.signal;
  expect(signal?.aborted).toBe(false);
  act(() => {
    window.history.replaceState(null, "", "/csa-rounds?status=draft");
  });
  expect(signal?.aborted).toBe(true);
  expect(await screen.findByRole("link", { name: round.name })).toBeVisible();
});

it("retains same-query rows on refresh failure and retries the same query", async () => {
  const meta = { page: 2, page_size: 20, total: 21 };
  const query = "?status=draft&page=2";
  window.history.replaceState(null, "", `/csa-rounds${query}`);
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({ data: [round], meta })
    .mockRejectedValueOnce(new Error("request_failed"))
    .mockResolvedValueOnce({ data: [{ ...round, name: "Refreshed round" }], meta });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundList />
    </AdminI18nProvider>,
  );

  await screen.findByRole("link", { name: round.name });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("link", { name: round.name })).toHaveAttribute(
    "href",
    `/csa-rounds/configurations/${id}${query}`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("link", { name: "Refreshed round" })).toBeVisible();
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    "admin/csa-round-configurations?page=2&page_size=20&status=draft",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it("requires refreshing a stale selection before another reopen request", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(reopenOrderFixture())
    .mockRejectedValueOnce(Object.assign(new Error("csa_selection_stale"), { status: 409 }))
    .mockResolvedValueOnce(reopenOrderFixture({}, { revision: 3, state: "confirmed" }))
    .mockResolvedValueOnce({});
  render(
    <AdminI18nProvider initialLocale="en">
      <CSAReopenDialog
        selectionId={id}
        orderId={id}
        deliveryDate={dates.delivery_date}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </AdminI18nProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Selection deadline"), {
    target: { value: "2026-11-21T20:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  const input = await screen.findByLabelText("Selection deadline");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "2026-11-21T21:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(4));
  expect(JSON.parse(String(vi.mocked(api).mock.calls[3][1]?.body)).expected_revision).toBe(3);
});
