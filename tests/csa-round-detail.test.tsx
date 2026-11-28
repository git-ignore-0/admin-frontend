import { storeOrderFixture } from "@/tests/store-orders-fixture";
import {
  act,
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { readRoundNavigationContext } from "@/app/(admin)/csa-rounds/round-navigation";
import { CSARoundDetail } from "@/components/csa-round-detail";
import { api, apiEnvelope } from "@/lib/client-api";

function render(ui: ReactElement) {
  return renderView(ui, { wrapper: AdminQueryProvider });
}
vi.mock("@/components/csa-companion-delivery", () => ({ CSACompanionDelivery: () => null }));
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});
const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const round = {
  id,
  version: 3,
  sequence: 1,
  name: "Week 1",
  status: "draft",
  opens_at: "2026-11-20T08:00:00+07:00",
  closes_at: "2026-11-21T18:00:00+07:00",
  delivery_date: "2026-11-22",
  server_time: "2026-11-19T08:00:00+07:00",
  can_edit: false,
  recurrence: null,
};
const rootId = "3894c718-0ed1-414f-9dfe-c6d880fd871b";

it("uses the native member and demand table layouts while waiting for a round's selections", async () => {
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof apiEnvelope>>>();
  vi.mocked(api).mockResolvedValue({ ...round, status: "open" });
  vi.mocked(apiEnvelope).mockReturnValue(pending.promise);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  await screen.findByRole("tab", { name: "Members", selected: true });
  const members = screen.getByRole("tabpanel", { name: "Members" });
  const memberScroll = members.querySelector<HTMLElement>('[role="region"][aria-hidden="true"]');
  expect(memberScroll?.style.getPropertyValue("--table-min-width")).toBe("30rem");
  expect(memberScroll?.querySelectorAll("th")).toHaveLength(4);
  expect(memberScroll?.querySelector("a, button, input, [tabindex]")).toBeNull();
  expect(within(members).getByRole("status")).toHaveTextContent("Loading CSA round…");
  expect(within(members).queryByRole("table")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Product demand" }));
  const demand = screen.getByRole("tabpanel", { name: "Product demand" });
  const demandScroll = demand.querySelector<HTMLElement>('[role="region"][aria-hidden="true"]');
  expect(demandScroll?.style.getPropertyValue("--table-min-width")).toBe(
    "calc(22.5rem * var(--mantine-scale))",
  );
  expect(demandScroll?.querySelectorAll("th")).toHaveLength(2);
  expect(demandScroll?.querySelector("tbody td:nth-child(2)")).toHaveStyle({ textAlign: "right" });
  expect(within(demand).getByRole("status")).toHaveTextContent("Loading CSA round…");
  expect(within(demand).queryByRole("table")).not.toBeInTheDocument();

  await act(async () =>
    pending.resolve({
      data: [],
      meta: { page: 1, page_size: 20, total: 0 },
      demand: [{ product_id: id, name: "Tomato", quantity: 2, unit_size: "500", unit_label: "g" }],
    } as never),
  );
  expect(within(demand).getByRole("table")).toHaveTextContent("Tomato");
  expect(demand.querySelectorAll("table")).toHaveLength(1);
  const loadedDemand = within(demand).getByRole("region");
  expect(loadedDemand.style.getPropertyValue("--table-min-width")).toBe(
    demandScroll?.style.getPropertyValue("--table-min-width"),
  );
  expect(loadedDemand).toHaveAttribute("tabindex", "0");
  expect(within(demand).queryByRole("status")).not.toBeInTheDocument();
});

it.each([
  [rootId, "active"],
  [rootId, "stopped"],
])("describes the impact of publishing a draft from %s (%s)", async (rootRoundId, status) => {
  vi.mocked(api).mockResolvedValue({
    ...round,
    configuration_id: rootId,
    recurrence: {
      root_round_id: rootRoundId,
      mode: "draft",
      status,
      occurrence_count: 2,
      next_create_at: status === "active" ? round.opens_at : null,
    },
  });
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
    demand: [],
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail
        roundId={id}
        listContext={readRoundNavigationContext({
          type: "weekly",
          page: "2",
          configurationId: rootRoundId,
          occurrenceStatus: "draft",
          occurrencePage: "3",
        })}
      />
    </AdminI18nProvider>,
  );
  const publish = await screen.findByRole("button", { name: "Publish round" });
  if (rootRoundId === rootId) {
    expect(await screen.findByRole("link", { name: "View original round" })).toHaveAttribute(
      "href",
      `/csa-rounds/${rootId}?page=2&type=weekly&configurationId=${rootId}&occurrenceStatus=draft&occurrencePage=3`,
    );
    expect(screen.getByText("Generated weekly round")).toBeVisible();
  }
  expect(screen.queryByRole("button", { name: "Stop recurrence" })).not.toBeInTheDocument();
  fireEvent.click(publish);
  const dialog = screen.getByRole("dialog");
  const confirmation = within(dialog).queryByText(
    /publishing the first round starts the weekly schedule/i,
  );
  expect(confirmation).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(1);
});

it("cancels only the chosen occurrence of an active configuration", async () => {
  const recurringRound = {
    ...round,
    can_edit: true,
    recurrence: {
      root_round_id: rootId,
      mode: "auto",
      status: "active",
      occurrence_count: 2,
      next_create_at: round.opens_at,
    },
  };
  const cancelled = {
    ...recurringRound,
    status: "cancelled",
    can_edit: false,
    cancellation_reason: "Flood",
  };
  let finishReload: (value: typeof cancelled) => void = () => {};
  const reload = new Promise<typeof cancelled>((resolve) => {
    finishReload = resolve;
  });
  vi.mocked(api)
    .mockResolvedValueOnce(recurringRound)
    .mockResolvedValueOnce(cancelled)
    .mockReturnValueOnce(reload);
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
    demand: [],
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id.toUpperCase()} />
    </AdminI18nProvider>,
  );
  expect(await screen.findByRole("link", { name: "Edit round" })).toBeVisible();
  fireEvent.click(await screen.findByRole("button", { name: "Cancel this round" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Cancellation reason" }), {
    target: { value: "Flood" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("link", { name: "Edit round" })).not.toBeInTheDocument();
  await act(async () => finishReload(cancelled));
  expect(await screen.findByText("Flood")).toBeVisible();
  expect(vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([
    [`admin/csa-rounds/${id}/cancel`, { method: "POST", body: '{"reason":"Flood","version":3}' }],
  ]);
});
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
      body: '{"version":3}',
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(apiEnvelope).toHaveBeenCalledTimes(2);
});
it("retires the round and closes confirmation when publishing loses access", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(round)
    .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
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
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByText(round.name)).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toBeVisible();
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
  fireEvent.click(await screen.findByRole("button", { name: "Cancel this round" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a cancellation reason.");
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Cancellation reason" }), {
    target: { value: "No harvest" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/already allocated/);
  expect(screen.getByRole("textbox", { name: "Cancellation reason" })).toHaveValue("No harvest");
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
  function HeaderBreadcrumb() {
    const [parent] = useAdminBreadcrumbs([]);
    return parent?.href ? <a href={parent.href}>{parent.label}</a> : null;
  }
  const uppercaseId = id.toUpperCase();
  const detailPath = `/csa-rounds/${uppercaseId}`;
  const search = "status=published&page=2";
  window.history.replaceState(null, "", `${detailPath}?${search}`);
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminBreadcrumbProvider pathname={detailPath} search={search}>
        <header>
          <HeaderBreadcrumb />
        </header>
        <main>
          <CSARoundDetail roundId={uppercaseId} listPage={2} listStatus="published" />
        </main>
      </AdminBreadcrumbProvider>
    </AdminI18nProvider>,
  );
  expect(await screen.findByText("Member A")).toBeVisible();
  expect(screen.getByRole("link", { name: "CSA round configurations" })).toHaveAttribute(
    "href",
    "/csa-rounds?status=published&page=2",
  );
  expect(
    within(screen.getByRole("main")).queryByRole("link", { name: "Back to rounds" }),
  ).toBeNull();
  const memberTable = screen.getByRole("table", { name: "Participating members" });
  const member = within(memberTable).getByRole("button", { name: "Member A" });
  const memberRow = member.closest("tr")!;
  expect(within(memberRow).getByText("Locked")).toBeVisible();
  expect(within(memberRow).getByText("1")).toBeVisible();
  expect(within(memberRow).getByText("Linked order")).toBeVisible();
  expect(screen.queryByRole("link", { name: "View order" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Membership used for this order" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Product demand" }));
  expect(within(screen.getByRole("table")).getByText("Tomato")).toBeVisible();
  expect(within(screen.getByRole("table")).getByText("2 × 500 g")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Members" }));
  fireEvent.click(within(memberRow).getByText("Locked"));
  const drawer = within(await screen.findByRole("dialog", { name: "Member A" }));
  expect(drawer.getByRole("heading", { name: "Selected products" })).toBeVisible();
  expect(drawer.getByText("Tomato")).toBeVisible();
  expect(drawer.getByText("2 × 500 g")).toBeVisible();
  expect(drawer.getByRole("link", { name: "View order" })).toHaveAttribute(
    "href",
    `/store-orders/${id}`,
  );
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
  const history = drawer.getByText("Selection history").closest("details")!;
  history.open = true;
  fireEvent(history, new Event("toggle"));
  expect(await screen.findByText("The reselection deadline expired.")).toBeVisible();
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    `admin/csa-selections/${id}/events?page=1&page_size=20`,
    { signal: expect.any(AbortSignal) },
  );
  fireEvent.click(within(history).getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(apiEnvelope).toHaveBeenLastCalledWith(
      `admin/csa-selections/${id}/events?page=2&page_size=20`,
      { signal: expect.any(AbortSignal) },
    ),
  );
  fireEvent.click(drawer.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(member).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

it.each([
  ["draft", "Settings"],
  ["open", "Members"],
])(
  "opens %s rounds in the right tab and keeps the round visible across tabs",
  async (status, tab) => {
    vi.mocked(api).mockResolvedValue({ ...round, status, can_edit: false });
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
    expect(await screen.findByRole("tab", { name: tab, selected: true })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit round" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to rounds" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Product demand" }));
    expect(screen.getByRole("heading", { name: "CSA round details", level: 1 })).toHaveClass(
      "mantine-VisuallyHidden-root",
    );
    expect(screen.getByText(round.name, { selector: "p" })).toBeVisible();
    expect(screen.getByRole("tabpanel", { name: "Product demand" })).toBeVisible();
    const demandTab = screen.getByRole("tab", { name: "Product demand" });
    demandTab.focus();
    fireEvent.keyDown(demandTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Settings", selected: true })).toHaveFocus();
    expect(apiEnvelope).toHaveBeenCalledTimes(1);
  },
);

it("checks the latest order only when a member drawer is opened and gates reopening accordingly", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.startsWith("admin/store-orders/")
      ? storeOrderFixture({
          id,
          status: "pending_delivery",
          approved_at: round.server_time,
          server_time: round.server_time,
          csa: {
            selection: {
              id,
              state: "locked",
              round_id: id,
              membership_id: rootId,
              order_id: id,
              revision: 1,
              server_time: round.server_time,
              reopen_until: null,
              lines: [],
            },
            round: { ...round, status: "closed" },
          },
        })
      : { ...round, status: "closed" },
  );
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [{ id, customer_name: "Member A", state: "locked", order_id: id, lines: [] }],
    demand: [],
    meta: { page: 1, page_size: 20, total: 1 },
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  const member = await screen.findByRole("button", { name: "Member A" });
  expect(api).not.toHaveBeenCalledWith(`admin/store-orders/${id}`, expect.anything());
  fireEvent.click(member);
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(`admin/store-orders/${id}`, {
      signal: expect.any(AbortSignal),
    }),
  );
  expect(screen.queryByRole("button", { name: "Reopen selection" })).not.toBeInTheDocument();
});

it.each(["Escape", "save", "permission_denied", "csrf_rejected"])(
  "keeps the member drawer consistent when reopening ends by %s",
  async (ending) => {
    const membershipId = "1c2a3445-e248-4649-a9e3-a2d02e9a8c7f";
    const person = {
      id,
      round_id: id,
      membership_id: membershipId,
      customer_name: "Member A",
      state: "locked" as const,
      order_id: id,
      reopen_until: null,
      revision: 1,
      server_time: round.server_time,
      lines: [],
    };
    const closedRound = { ...round, status: "closed" as const };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/csa-selections/${id}/reopen`) {
        if (ending === "permission_denied" || ending === "csrf_rejected") {
          throw Object.assign(new Error(ending), { status: 403 });
        }
        return {};
      }
      if (path === `admin/memberships/${membershipId}?locale=en`)
        return { id: membershipId, status: "active" };
      if (path === `admin/store-orders/${id}`) {
        return storeOrderFixture({
          id,
          status: "pending_review",
          approved_at: null,
          server_time: round.server_time,
          csa: { selection: person, round: closedRound },
        });
      }
      return closedRound;
    });
    const participants = {
      data: [person],
      demand: [],
      meta: { page: 1, page_size: 20, total: 1 },
    };
    const deadline = "2026-11-21T20:00:00+07:00";
    let releaseRefresh!: () => void;
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce(participants as never)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseRefresh = () =>
              resolve({
                ...participants,
                data: [{ ...person, state: "reselecting", reopen_until: deadline, revision: 2 }],
              } as never);
          }),
      );
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundDetail roundId={id} />
      </AdminI18nProvider>,
    );
    const member = await screen.findByRole("button", { name: "Member A" });
    fireEvent.click(member);
    const drawer = await screen.findByRole("dialog", { name: "Member A" });
    const reopen = await within(drawer).findByRole("button", { name: "Reopen selection" });
    reopen.focus();
    fireEvent.click(reopen);
    const confirmation = await screen.findByRole("dialog", { name: "Reopen selection" });
    const input = await within(confirmation).findByLabelText("Selection deadline");
    expect(screen.queryByRole("dialog", { name: "Member A" })).not.toBeInTheDocument();
    if (ending === "Escape") {
      fireEvent.keyDown(within(confirmation).getByRole("button", { name: "Close" }), {
        key: "Escape",
      });
      await waitFor(() => expect(reopen).toHaveFocus());
    } else {
      fireEvent.change(input, { target: { value: "2026-11-21T20:00" } });
      fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm" }));
      if (ending === "permission_denied") {
        await waitFor(() => expect(member).not.toBeInTheDocument());
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(apiEnvelope).toHaveBeenCalledTimes(1);
        return;
      }
      if (ending === "csrf_rejected") {
        await within(confirmation).findByRole("alert");
        expect(member).toBeInTheDocument();
        expect(input).toHaveValue("2026-11-21T20:00");
        expect(apiEnvelope).toHaveBeenCalledTimes(1);
        return;
      }
      const close = await within(
        await screen.findByRole("dialog", { name: "Member A" }),
      ).findByRole("button", { name: "Close" });
      await waitFor(() => expect(close).toHaveFocus());
      expect(api).toHaveBeenCalledWith(
        `admin/csa-selections/${id}/reopen`,
        {
          method: "POST",
          body: JSON.stringify({ deadline, expected_revision: 1 }),
        },
        { shouldRedirectToLogin: expect.any(Function) },
      );
      await act(async () => releaseRefresh());
      expect(within(drawer).getByText("Awaiting reselection")).toBeVisible();
      expect(within(drawer).getByText("21/11/2026 20:00")).toHaveAttribute("datetime", deadline);
      expect(within(member.closest("tr")!).getByText("Awaiting reselection")).toBeVisible();
    }
    expect(screen.getByRole("dialog", { name: "Member A" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Reopen selection" })).not.toBeInTheDocument();
  },
);

it.each(["active", "revoked"])(
  "checks membership %s before offering to reopen an unallocated order",
  async (membershipStatus) => {
    const membershipId = "1c2a3445-e248-4649-a9e3-a2d02e9a8c7f";
    const membershipPath = `admin/memberships/${membershipId}?locale=en`;
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === membershipPath) return { id: membershipId, status: membershipStatus };
      if (path.startsWith("admin/store-orders/")) {
        return storeOrderFixture({
          id,
          status: "pending_review",
          approved_at: null,
          server_time: round.server_time,
          csa: {
            selection: {
              id,
              membership_id: membershipId,
              state: "locked",
              round_id: id,
              order_id: id,
              revision: 1,
              server_time: round.server_time,
              reopen_until: null,
              lines: [],
            },
            round: { ...round, status: "closed" },
          },
        });
      }
      return { ...round, status: "closed" };
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        {
          id,
          membership_id: membershipId,
          customer_name: "Member A",
          state: "locked",
          order_id: id,
          lines: [],
        },
      ],
      demand: [],
      meta: { page: 1, page_size: 20, total: 1 },
    } as never);
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundDetail roundId={id} />
      </AdminI18nProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Member A" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(membershipPath, { signal: expect.any(AbortSignal) }),
    );
    if (membershipStatus === "active") {
      expect(await screen.findByRole("button", { name: "Reopen selection" })).toBeEnabled();
    } else {
      expect(screen.queryByRole("button", { name: "Reopen selection" })).not.toBeInTheDocument();
    }
  },
);

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
  let finishPage!: () => void;
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce({
      data: [person],
      meta: { page: 1, page_size: 20, total: 21 },
      demand,
    } as never)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPage = () =>
            resolve({
              data: [{ ...person, customer_name: "Second page member" }],
              meta: { page: 2, page_size: 20, total: 21 },
              demand,
            } as never);
        }),
    );
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  await screen.findByText("First member");
  expect(screen.queryByRole("link", { name: "Edit round" })).not.toBeInTheDocument();
  const nextPage = screen.getByRole("button", { name: "Next" });
  await waitFor(() => expect(nextPage).toBeEnabled());
  nextPage.focus();
  fireEvent.click(nextPage);
  expect(screen.getByRole("group", { name: "Members" })).toHaveFocus();
  expect(screen.queryByText("First member")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Product demand" }));
  expect(screen.getByText("Full demand tomato")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Members" }));
  await act(async () => finishPage());
  const member = await screen.findByRole("button", { name: "Second page member" });
  member.focus();
  fireEvent.click(member, { detail: 0 });
  const drawer = await screen.findByRole("dialog", { name: "Second page member" });
  fireEvent.keyDown(within(drawer).getByRole("button", { name: "Close" }), { key: "Escape" });
  await waitFor(() => expect(member).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Page 2/2" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Product demand" }));
  expect(screen.getByText("Full demand tomato")).toBeVisible();
  expect(apiEnvelope).toHaveBeenLastCalledWith(
    `admin/csa-rounds/${id}/selections?page=2&page_size=20&locale=en`,
    { signal: expect.any(AbortSignal) },
  );
  expect(apiEnvelope).toHaveBeenCalledTimes(2);
});

it("returns to the last participants page when a refresh invalidates the current page", async () => {
  vi.mocked(api).mockResolvedValue({ ...round, status: "closed" });
  const page = (number: number, total: number) =>
    ({
      data: [],
      meta: { page: number, page_size: 20, total },
      demand: [],
    }) as never;
  vi.mocked(apiEnvelope)
    .mockResolvedValueOnce(page(1, 21))
    .mockResolvedValueOnce(page(2, 21))
    .mockResolvedValueOnce(page(2, 20))
    .mockResolvedValueOnce(page(1, 20));
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  await screen.findByRole("navigation", { name: "Page 2/2" });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(4));
  expect(vi.mocked(apiEnvelope).mock.lastCall?.[0]).toContain("selections?page=1&");
  expect(screen.queryByRole("navigation", { name: "Page 2/2" })).not.toBeInTheDocument();
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
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith("admin/csa-rounds/new-round", {
          signal: expect.any(AbortSignal),
        }),
      );
    }
    const reads = vi.mocked(api).mock.calls.filter(([, init]) => !init?.method).length;
    await act(async () => finish(round));
    expect(vi.mocked(api).mock.calls.filter(([, init]) => !init?.method)).toHaveLength(reads);
  },
);
