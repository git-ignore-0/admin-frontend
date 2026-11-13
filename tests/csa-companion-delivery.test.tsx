import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { CSACompanionDelivery } from "@/components/csa-companion-delivery";
import { CSARoundDetail } from "@/components/csa-round-detail";
import { api, apiEnvelope } from "@/lib/client-api";
import { isAllowedBackendRequest } from "@/lib/backend-target";
import { companionDeliveryStatus } from "@/lib/csa-companion-delivery";
import type { CSARound } from "@/lib/csa-rounds";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const path = `admin/csa-rounds/${id}/companion-delivery`;
const round: CSARound = {
  id,
  sequence: 1,
  name: "CSA",
  status: "closed",
  opens_at: "2026-11-19T08:00:00+07:00",
  closes_at: "2026-11-20T08:00:00+07:00",
  delivery_at: "2026-11-22T09:00:00+07:00",
  server_time: "2026-11-20T09:00:00+07:00",
};
const empty = { companion_delivery_enabled: false, companion_delivery_cutoff: null };
const enabled = {
  companion_delivery_enabled: true,
  companion_delivery_cutoff: "2026-11-21T18:00:00+07:00",
};
function view(value = round, locale: "vi" | "en" = "en", receivedAt = performance.now()) {
  return (
    <AdminI18nProvider initialLocale={locale}>
      <CSACompanionDelivery round={value} receivedAt={receivedAt} />
    </AdminI18nProvider>
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it("allows only exact GET/PATCH companion paths", () => {
  for (const method of ["GET", "PATCH", "POST", "PUT", "DELETE", "HEAD"])
    expect(isAllowedBackendRequest(method, path.split("/"))).toBe(
      ["GET", "PATCH"].includes(method),
    );
  expect(isAllowedBackendRequest("GET", [...path.split("/"), "extra"])).toBe(false);
  expect(
    isAllowedBackendRequest("PATCH", ["admin", "csa-rounds", "bad", "companion-delivery"]),
  ).toBe(false);
});
it("distinguishes configured from effective accepting status", () => {
  const now = Date.parse(round.server_time);
  expect(companionDeliveryStatus(empty, round, now)).toBe("not_enabled");
  expect(companionDeliveryStatus(enabled, round, now)).toBe("accepting");
  expect(
    companionDeliveryStatus(enabled, round, Date.parse(enabled.companion_delivery_cutoff)),
  ).toBe("expired");
  expect(
    companionDeliveryStatus({ ...enabled, companion_delivery_enabled: false }, round, now),
  ).toBe("closed");
  expect(companionDeliveryStatus(enabled, { ...round, status: "cancelled" }, now)).toBe(
    "cancelled",
  );
  expect(companionDeliveryStatus(enabled, { ...round, status: "draft" }, now)).toBe("draft");
});
it("loads unconfigured data and saves a valid VN cutoff even when schedule is immutable", async () => {
  vi.mocked(api).mockResolvedValueOnce(empty).mockResolvedValueOnce(enabled);
  render(view());
  expect(await screen.findByText("Not enabled")).toBeVisible();
  const save = screen.getByRole("button", { name: "Start accepting" });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(path, { method: "PATCH", body: JSON.stringify(enabled) }),
  );
  expect(await screen.findByText("Accepting orders")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});
it.each(["2026-11-19T18:00", "2026-11-20T09:00", "2026-11-22T09:00", "2026-11-22T10:00"])(
  "disables invalid cutoff %s",
  async (value) => {
    vi.mocked(api).mockResolvedValue(empty);
    render(view());
    await screen.findByText("Not enabled");
    fireEvent.change(screen.getByLabelText("Companion order cutoff"), { target: { value } });
    expect(screen.getByRole("button", { name: "Start accepting" })).toBeDisabled();
  },
);
it("closes using only enabled=false and reopens with a valid cutoff", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(enabled)
    .mockResolvedValueOnce({ ...enabled, companion_delivery_enabled: false })
    .mockResolvedValueOnce(enabled);
  render(view());
  await screen.findByText("Accepting orders");
  fireEvent.click(screen.getByRole("button", { name: "Stop accepting" }));
  await screen.findByText("Closed");
  expect(api).toHaveBeenLastCalledWith(path, {
    method: "PATCH",
    body: '{"companion_delivery_enabled":false}',
  });
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
  await screen.findByText("Accepting orders");
});
it("keeps edits on API failure and prevents repeat submission while busy", async () => {
  const pending = deferred<typeof enabled>();
  vi.mocked(api)
    .mockResolvedValueOnce(empty)
    .mockImplementationOnce(() => pending.promise)
    .mockRejectedValueOnce(new Error("csa_companion_deadline_invalid"));
  render(view());
  await screen.findByText("Not enabled");
  const input = screen.getByLabelText("Companion order cutoff");
  fireEvent.change(input, { target: { value: "2026-11-21T18:00" } });
  const save = screen.getByRole("button", { name: "Start accepting" });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(api).toHaveBeenCalledTimes(2);
  expect(input).toBeDisabled();
  await act(async () => {
    pending.resolve(enabled);
  });
  fireEvent.change(input, { target: { value: "2026-11-21T19:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("future");
  expect(input).toHaveValue("2026-11-21T19:00");
});
it("does not allow changes on a cancelled round", async () => {
  vi.mocked(api).mockResolvedValue(enabled);
  render(view({ ...round, status: "cancelled" }));
  await screen.findByText("Cancelled");
  expect(screen.getByLabelText("Companion order cutoff")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Stop accepting" })).not.toBeInTheDocument();
});
it("ignores a late load after changing the round", async () => {
  const pending = deferred<typeof enabled>();
  vi.mocked(api)
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValueOnce(empty);
  const result = render(view());
  const other = { ...round, id: "24803641-2dce-4cac-8fc4-91e55f03e950" };
  result.rerender(view(other));
  await screen.findByText("Not enabled");
  await act(async () => {
    pending.resolve(enabled);
  });
  expect(screen.queryByText("Accepting orders")).not.toBeInTheDocument();
});

function LocaleSwitch({ value = round }: { value?: CSARound }) {
  const { setLocale } = useAdminI18n();
  return (
    <>
      <button onClick={() => setLocale("vi")}>VI</button>
      <CSACompanionDelivery round={value} receivedAt={0} />
    </>
  );
}
it("keeps a pending mutation locked across locale changes and refreshes in the current locale", async () => {
  const pending = deferred<typeof enabled>();
  vi.mocked(api)
    .mockResolvedValueOnce(empty)
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValueOnce(empty)
    .mockResolvedValueOnce(enabled);
  render(
    <AdminI18nProvider initialLocale="en">
      <LocaleSwitch />
    </AdminI18nProvider>,
  );
  await screen.findByText("Not enabled");
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start accepting" }));
  fireEvent.click(screen.getByRole("button", { name: "VI" }));
  await screen.findByText("Chưa bật");
  const input = screen.getByLabelText("Hạn nhận đơn kèm", { selector: "input" });
  expect(input).toBeDisabled();
  await act(async () => {
    pending.resolve(enabled);
  });
  expect(await screen.findByText("Đang nhận đơn")).toBeVisible();
  expect(screen.queryByText("Accepting orders")).not.toBeInTheDocument();
  expect(
    vi.mocked(api).mock.calls.filter(([, options]) => options?.method === "PATCH"),
  ).toHaveLength(1);
});
it("does not reload a different round after an old mutation completes", async () => {
  const pending = deferred<typeof enabled>();
  vi.mocked(api)
    .mockResolvedValueOnce(empty)
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValueOnce(empty);
  const result = render(view());
  await screen.findByText("Not enabled");
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start accepting" }));
  result.rerender(view({ ...round, id: "24803641-2dce-4cac-8fc4-91e55f03e950" }));
  await screen.findByText("Not enabled");
  await act(async () => {
    pending.resolve(enabled);
  });
  expect(screen.queryByText("Accepting orders")).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(3);
});

it("uses server time despite a skewed device clock and expires the displayed status", async () => {
  const receivedAt = performance.now();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-01-01T00:00:00Z"));
  vi.mocked(api).mockResolvedValue(enabled);
  const result = render(view(round, "en", receivedAt));
  await screen.findByText("Accepting orders");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T19:00" },
  });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  const elapsed = Date.parse(enabled.companion_delivery_cutoff) - Date.parse(round.server_time);
  result.rerender(view(round, "en", performance.now() - elapsed));
  expect(screen.getByText("Expired")).toBeVisible();
  vi.mocked(Date.now).mockRestore();
});
it("shows load errors with retry and never renders editable controls before loading", async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error("network_error")).mockResolvedValueOnce(empty);
  render(view());
  const alert = await screen.findByRole("alert");
  expect(alert).toBeVisible();
  expect(screen.queryByLabelText("Companion order cutoff")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Not enabled")).toBeVisible();
});

it("disables companion actions when BE reports the round was cancelled", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(empty)
    .mockRejectedValueOnce(new Error("csa_round_cancelled"));
  render(view());
  await screen.findByText("Not enabled");
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start accepting" }));
  expect(await screen.findByText("Cancelled")).toBeVisible();
  expect(screen.getByLabelText("Companion order cutoff")).toBeDisabled();
});

it("integrates companion settings independently of locked schedule editing", async () => {
  vi.mocked(api).mockImplementation(async (target, init) =>
    target === path ? (init?.method === "PATCH" ? enabled : empty) : { ...round, can_edit: false },
  );
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    demand: [],
    meta: { page: 1, page_size: 20, total: 1 },
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  await screen.findByText("Not enabled");
  expect(screen.queryByRole("link", { name: "Edit round" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start accepting" }));
  expect(await screen.findByText("Accepting orders")).toBeVisible();
  expect(api).toHaveBeenCalledWith(path, { method: "PATCH", body: JSON.stringify(enabled) });
});

it("expires an open form on the server-anchored timer without another request", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let elapsed = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const shortly = { ...enabled, companion_delivery_cutoff: "2026-11-20T09:00:01+07:00" };
  vi.mocked(api).mockResolvedValue(shortly);
  render(view(round, "en", 0));
  await act(async () => {});
  expect(screen.getByText("Accepting orders")).toBeVisible();
  act(() => {
    elapsed = 1000;
    vi.advanceTimersByTime(1000);
  });
  expect(screen.getByText("Expired")).toBeVisible();
  expect(api).toHaveBeenCalledTimes(1);
});
it("does not update or reload after the component is unmounted during a mutation", async () => {
  const pending = deferred<typeof enabled>();
  vi.mocked(api)
    .mockResolvedValueOnce(empty)
    .mockImplementationOnce(() => pending.promise);
  const result = render(view());
  await screen.findByText("Not enabled");
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start accepting" }));
  result.unmount();
  await act(async () => {
    pending.resolve(enabled);
  });
  expect(api).toHaveBeenCalledTimes(2);
});

it("maps validation field names to localized labels while retaining the input", async () => {
  const validation = Object.assign(new Error("validation_error"), {
    field: "companion_delivery_cutoff",
  });
  vi.mocked(api).mockResolvedValueOnce(empty).mockRejectedValueOnce(validation);
  render(view());
  await screen.findByText("Not enabled");
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start accepting" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Companion order cutoff");
  expect(alert).not.toHaveTextContent("companion_delivery_cutoff");
  expect(screen.getByLabelText("Companion order cutoff")).toHaveValue("2026-11-21T18:00");
});

it("keeps the cutoff draft and avoids config requests when participants change page", async () => {
  let reads = 0;
  vi.mocked(api).mockImplementation(async (target) =>
    target === path ? empty : { ...round, server_time: `2026-11-20T09:00:0${reads++}+07:00` },
  );
  vi.mocked(apiEnvelope).mockImplementation(
    async (target) =>
      ({
        data: [],
        demand: [],
        meta: { page: target.includes("page=2") ? 2 : 1, page_size: 20, total: 21 },
      }) as never,
  );
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundDetail roundId={id} />
    </AdminI18nProvider>,
  );
  await screen.findByText("Not enabled");
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(reads).toBe(2));
  await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeDisabled());
  expect(screen.getByLabelText("Companion order cutoff")).toHaveValue("2026-11-21T18:00");
  expect(vi.mocked(api).mock.calls.filter(([target]) => target === path)).toHaveLength(1);
});

it("keeps an unsaved cutoff when changing locale", async () => {
  vi.mocked(api).mockResolvedValue(empty);
  render(
    <AdminI18nProvider initialLocale="en">
      <LocaleSwitch />
    </AdminI18nProvider>,
  );
  await screen.findByText("Not enabled");
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "VI" }));
  expect(screen.getByLabelText("Hạn nhận đơn kèm", { selector: "input" })).toHaveValue(
    "2026-11-21T18:00",
  );
  expect(api).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "refreshes saved config explicitly without replacing a dirty draft (%s)",
  async (dirty) => {
    let configReads = 0;
    vi.mocked(api).mockImplementation(async (target) =>
      target === path ? (++configReads === 1 ? empty : enabled) : round,
    );
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      demand: [],
      meta: { page: 1, page_size: 20, total: 0 },
    } as never);
    render(
      <AdminI18nProvider initialLocale="en">
        <CSARoundDetail roundId={id} />
      </AdminI18nProvider>,
    );
    await screen.findByText("Not enabled");
    if (dirty)
      fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
        target: { value: "2026-11-21T19:00" },
      });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Accepting orders");
    expect(screen.getByLabelText("Companion order cutoff")).toHaveValue(
      dirty ? "2026-11-21T19:00" : "2026-11-21T18:00",
    );
    expect(configReads).toBe(2);
  },
);

it.each([false, true])(
  "keeps an explicit config refresh when locale replaces the pending round request (%s)",
  async (dirty) => {
    const pending = deferred<CSARound>();
    let roundReads = 0;
    let configReads = 0;
    vi.mocked(api).mockImplementation(async (target) =>
      target === path
        ? ++configReads === 1
          ? empty
          : enabled
        : ++roundReads === 2
          ? pending.promise
          : round,
    );
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      demand: [],
      meta: { page: 1, page_size: 20, total: 0 },
    } as never);
    function DetailWithLocale() {
      const { setLocale } = useAdminI18n();
      return (
        <>
          <button onClick={() => setLocale("vi")}>VI</button>
          <CSARoundDetail roundId={id} />
        </>
      );
    }
    render(
      <AdminI18nProvider initialLocale="en">
        <DetailWithLocale />
      </AdminI18nProvider>,
    );
    await screen.findByText("Not enabled");
    if (dirty)
      fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
        target: { value: "2026-11-21T19:00" },
      });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(roundReads).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "VI" }));
    await waitFor(() => expect(roundReads).toBe(3));
    await waitFor(() => expect(screen.getByRole("button", { name: "Tải lại" })).toBeEnabled());
    await act(async () => pending.resolve(round));
    expect(await screen.findByText("Đang nhận đơn")).toBeVisible();
    expect(screen.getByLabelText("Hạn nhận đơn kèm", { selector: "input" })).toHaveValue(
      dirty ? "2026-11-21T19:00" : "2026-11-21T18:00",
    );
    expect(configReads).toBe(2);
  },
);

it("shows a pending cancellation rejection in the current locale and prevents resubmission", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(empty)
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(empty);
  render(
    <AdminI18nProvider initialLocale="en">
      <LocaleSwitch />
    </AdminI18nProvider>,
  );
  await screen.findByText("Not enabled");
  fireEvent.change(screen.getByLabelText("Companion order cutoff"), {
    target: { value: "2026-11-21T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start accepting" }));
  fireEvent.click(screen.getByRole("button", { name: "VI" }));
  await act(async () => reject(new Error("csa_round_cancelled")));
  expect(await screen.findByText("Đã hủy")).toBeVisible();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("Hạn nhận đơn kèm", { selector: "input" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Bật nhận đơn" })).toBeDisabled();
  expect(
    vi.mocked(api).mock.calls.filter(([, options]) => options?.method === "PATCH"),
  ).toHaveLength(1);
});
