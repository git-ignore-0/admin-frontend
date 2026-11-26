import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmTrackerFields, useFarmTracker } from "@/components/farm-tracker-profile-editor";
import { LanguageSwitcher } from "@/components/language-switcher";
import { farmAccess, farmDetailKey, farmSupplyKey } from "@/lib/farm-query";

const api = vi.hoisted(() => ({
  getFarm: vi.fn(),
  getFarmTracker: vi.fn(),
  enableFarmTracker: vi.fn(),
  updateFarmTracker: vi.fn(),
  disableFarmTracker: vi.fn(),
  saveFarm: vi.fn(),
}));
vi.mock("@/lib/farms-api", () => api);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const farmId = "farm-1";
const profile = {
  id: farmId,
  signup_count: 12,
  one_month_signup_count: 3,
  is_visible: true,
  version: 4,
};
const month = "Số người đăng ký 1 tháng";
const sixMonths = "Số người đăng ký 6 tháng";
const visibility = "Hiển thị trên Growth Tracker";
const notFound = () => Object.assign(new Error("not_found"), { status: 404 });
const error = (message: string, status: number) => Object.assign(new Error(message), { status });
const save = () => screen.getByRole("button", { name: "Lưu thay đổi" });
const check = () => screen.getByRole("button", { name: "Đồng bộ sau khi lưu trang trại" });
const checkExternal = () => screen.getByRole("button", { name: "Đồng bộ sau thay đổi bên ngoài" });
const changeCount = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const retry = (name = "Kiểm tra lại dữ liệu") =>
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name }));

function Tracker({
  id = farmId,
  enabled = true,
  farmActive = true,
  canAct = () => true,
  onAccessLost = () => undefined,
}: {
  id?: string;
  enabled?: boolean;
  farmActive?: boolean;
  canAct?: () => boolean;
  onAccessLost?: (cause: unknown) => void;
}) {
  const tracker = useFarmTracker({ farmId: id, enabled, canAct, onAccessLost });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void tracker.save();
      }}
    >
      {enabled && <FarmTrackerFields tracker={tracker} disabled={false} farmActive={farmActive} />}
      <button type="submit" disabled={!tracker.dirty || !tracker.ready || tracker.busy}>
        Lưu thay đổi
      </button>
      <button type="button" onClick={tracker.reset}>
        Hoàn tác
      </button>
      <button type="button" onClick={() => void tracker.syncAfterFarmWrite()}>
        Đồng bộ sau khi lưu trang trại
      </button>
      <button type="button" onClick={() => void tracker.syncAfterFarmWrite(false)}>
        Đồng bộ sau thay đổi bên ngoài
      </button>
    </form>
  );
}

function tree(node: React.ReactNode, session = "original") {
  return (
    <AdminI18nProvider initialLocale="vi">
      <AdminQueryProvider key={session}>{node}</AdminQueryProvider>
    </AdminI18nProvider>
  );
}

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getFarmTracker.mockResolvedValue(profile);
  api.getFarm.mockResolvedValue({ id: farmId });
});
afterEach(cleanup);

it("loads lazily and creates a missing profile only after an actual change", async () => {
  api.getFarmTracker.mockRejectedValueOnce(notFound());
  api.enableFarmTracker.mockResolvedValue({
    ...profile,
    signup_count: 9,
    one_month_signup_count: 0,
    is_visible: false,
  });
  const rendered = render(tree(<Tracker enabled={false} />));
  fireEvent.click(check());
  expect(api.getFarmTracker).not.toHaveBeenCalled();
  rendered.rerender(tree(<Tracker />));

  expect(await screen.findByLabelText(sixMonths)).toHaveValue("0");
  expect(screen.getByLabelText(month)).toHaveValue("0");
  expect(screen.getByRole("checkbox", { name: visibility })).not.toBeChecked();
  expect(save()).toBeDisabled();
  expect(api.enableFarmTracker).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /bật|tắt growth tracker/i })).not.toBeInTheDocument();

  changeCount(sixMonths, "9");
  fireEvent.click(save());
  await waitFor(() => expect(save()).toBeDisabled());
  expect(api.enableFarmTracker).toHaveBeenCalledExactlyOnceWith(farmId, {
    signup_count: 9,
    one_month_signup_count: 0,
    is_visible: false,
  });
  expect(api.getFarmTracker).toHaveBeenCalledExactlyOnceWith(farmId, expect.any(AbortSignal));
  expect(api.getFarm).toHaveBeenCalledExactlyOnceWith(farmId, api.getFarmTracker.mock.calls[0][1]);
  expect(api.saveFarm).not.toHaveBeenCalled();
});

it.each(["initial load", "post-write verification"])(
  "retires cached Farm data when Tracker and Farm both return 404 during %s",
  async (phase) => {
    let client!: ReturnType<typeof useQueryClient>;
    function CaptureClient() {
      client = useQueryClient();
      return null;
    }
    const onAccessLost = vi.fn();
    const detailKey = farmDetailKey(farmId);
    const supplyKey = farmSupplyKey(farmId);
    const missingFarm = notFound();
    if (phase === "post-write verification") api.getFarmTracker.mockResolvedValueOnce(profile);
    api.getFarmTracker.mockRejectedValueOnce(notFound());
    api.getFarm.mockRejectedValueOnce(missingFarm);
    render(
      tree(
        <>
          <CaptureClient />
          <Tracker onAccessLost={onAccessLost} />
        </>,
      ),
    );
    client.setQueryData(detailKey, { id: farmId });
    client.setQueryData(supplyKey, []);
    if (phase === "post-write verification") {
      await screen.findByLabelText(month);
      changeCount(month, "7");
      fireEvent.click(check());
    }

    await screen.findByRole("alert");
    expect(onAccessLost).toHaveBeenCalledExactlyOnceWith(missingFarm);
    expect(client.getQueryData(detailKey)).toBeUndefined();
    expect(client.getQueryData(supplyKey)).toBeUndefined();
    expect(screen.queryByLabelText(month)).not.toBeInTheDocument();
    expect(api.getFarm).toHaveBeenCalledTimes(1);
    expect(api.enableFarmTracker).not.toHaveBeenCalled();
  },
);

it.each([
  new Error("network_error"),
  error("server_error", 502),
  error("invalid_response", 200),
  error("request_timeout", 404),
])("allows retry after Farm verification fails with %s", async (cause) => {
  api.getFarmTracker.mockRejectedValueOnce(notFound()).mockRejectedValueOnce(notFound());
  api.getFarm.mockRejectedValueOnce(cause);
  render(tree(<Tracker />));

  await screen.findByRole("alert");
  expect(screen.queryByLabelText(month)).not.toBeInTheDocument();
  expect(save()).toBeDisabled();
  retry("Thử lại");
  expect(await screen.findByLabelText(month)).toHaveValue("0");
  expect(api.getFarmTracker).toHaveBeenCalledTimes(2);
  expect(api.getFarm).toHaveBeenCalledTimes(2);
  expect(api.enableFarmTracker).not.toHaveBeenCalled();
});

it.each([
  ["forbidden", 403],
  ["session_expired", 401],
  ["session_changed", 409],
])("retires protected Farm data after verification fails with %s", async (code, status) => {
  const denial = error(code, status);
  const onAccessLost = vi.fn();
  api.getFarmTracker.mockRejectedValueOnce(notFound());
  api.getFarm.mockRejectedValueOnce(denial);
  render(tree(<Tracker onAccessLost={onAccessLost} />));

  await screen.findByRole("alert");
  expect(onAccessLost).toHaveBeenCalledExactlyOnceWith(denial);
  expect(screen.queryByLabelText(month)).not.toBeInTheDocument();
  expect(api.enableFarmTracker).not.toHaveBeenCalled();
});

it("ignores successful verification for a Farm that is no longer open", async () => {
  let finish!: (value: { id: string }) => void;
  api.getFarmTracker
    .mockRejectedValueOnce(notFound())
    .mockResolvedValueOnce({ ...profile, id: "other", one_month_signup_count: 8 });
  api.getFarm.mockReturnValueOnce(new Promise<{ id: string }>((resolve) => (finish = resolve)));
  const rendered = render(tree(<Tracker />));
  await waitFor(() => expect(api.getFarm).toHaveBeenCalledTimes(1));

  rendered.rerender(tree(<Tracker id="other" />));
  expect(await screen.findByLabelText(month)).toHaveValue("8");
  expect(api.getFarmTracker.mock.calls[0][1].aborted).toBe(true);
  await act(async () => finish({ id: farmId }));
  expect(screen.getByLabelText(month)).toHaveValue("8");
  expect(api.getFarm).toHaveBeenCalledTimes(1);
  expect(api.enableFarmTracker).not.toHaveBeenCalled();
});

it("patches only the changed visibility and preserves both signup counts", async () => {
  api.updateFarmTracker.mockResolvedValue({ ...profile, is_visible: false, version: 5 });
  render(tree(<Tracker />));
  const checkbox = await screen.findByRole("checkbox", { name: visibility });
  expect(save()).toBeDisabled();
  fireEvent.click(checkbox);
  expect(save()).toBeEnabled();
  fireEvent.click(checkbox);
  expect(save()).toBeDisabled();
  fireEvent.click(checkbox);
  fireEvent.click(save());
  await waitFor(() => expect(checkbox).toBeEnabled());
  expect(save()).toBeDisabled();
  expect(checkbox).not.toBeChecked();
  expect(screen.getByLabelText(month)).toHaveValue("3");
  expect(screen.getByLabelText(sixMonths)).toHaveValue("12");
  expect(api.updateFarmTracker).toHaveBeenCalledExactlyOnceWith(farmId, {
    version: 4,
    is_visible: false,
  });
  expect(api.disableFarmTracker).not.toHaveBeenCalled();
  expect(api.saveFarm).not.toHaveBeenCalled();
  expect(api.getFarm).not.toHaveBeenCalled();
});

it("keeps a Tracker draft across locale and tab changes until undo", async () => {
  const content = (enabled: boolean) =>
    tree(
      <>
        <LanguageSwitcher />
        <Tracker enabled={enabled} farmActive={false} />
      </>,
    );
  const rendered = render(content(true));
  expect(await screen.findByText(/Trang trại đã tắt hoạt động/)).toBeVisible();
  changeCount(sixMonths, "29");
  rendered.rerender(content(false));
  rendered.rerender(content(true));
  fireEvent.click(screen.getByRole("radio", { name: "EN" }));
  expect(screen.getByLabelText("6-month signup count")).toHaveValue("29");
  expect(screen.getByText(/This farm is inactive/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
  expect(screen.getByLabelText("6-month signup count")).toHaveValue("12");
  expect(save()).toBeDisabled();
  expect(api.getFarmTracker).toHaveBeenCalledTimes(1);
});

it("warns when an inactive Farm's previously hidden Tracker is set to be visible", async () => {
  api.getFarmTracker.mockResolvedValue({ ...profile, is_visible: false });
  render(tree(<Tracker farmActive={false} />));
  const checkbox = await screen.findByRole("checkbox", { name: visibility });
  expect(screen.queryByText(/Trang trại đã tắt hoạt động/)).not.toBeInTheDocument();
  fireEvent.click(checkbox);
  expect(screen.getByText(/Trang trại đã tắt hoạt động/)).toBeVisible();
});

it.each(["abc", "12abc", "-1", "+1", "1.5", "1e2", "1 2"])(
  "keeps the previous signup count when either field receives %j",
  async (value) => {
    render(tree(<Tracker />));
    await screen.findByLabelText(month);
    for (const [label, previous] of [
      [month, "3"],
      [sixMonths, "12"],
    ]) {
      const input = screen.getByLabelText<HTMLInputElement>(label);
      changeCount(label, value);
      expect(input.value).toBe(previous);
      expect(save()).toBeDisabled();
    }
    expect(api.updateFarmTracker).not.toHaveBeenCalled();
  },
);

it.each(["", "4294967296"])(
  "rejects an invalid signup count (%j) in either field before sending a request",
  async (value) => {
    render(tree(<Tracker />));
    await screen.findByLabelText(month);
    for (const label of [month, sixMonths]) {
      changeCount(label, value);
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
        value
          ? "Số đăng ký phải là số nguyên từ 0 đến 4.294.967.295."
          : "Vui lòng nhập số đăng ký.",
      );
      expect(save()).toBeDisabled();
      fireEvent.submit(save().closest("form")!);
      expect(api.updateFarmTracker).not.toHaveBeenCalled();
      changeCount(label, "0");
      expect(screen.getByLabelText(label)).not.toHaveAttribute("aria-invalid", "true");
    }
  },
);

it("submits zero and the maximum supported signup count as numbers", async () => {
  api.updateFarmTracker.mockResolvedValue({
    ...profile,
    signup_count: 4_294_967_295,
    one_month_signup_count: 0,
    version: 5,
  });
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(sixMonths, "4294967295");
  changeCount(month, "0");
  fireEvent.click(save());
  await waitFor(() => expect(save()).toBeDisabled());
  expect(api.updateFarmTracker).toHaveBeenCalledExactlyOnceWith(farmId, {
    signup_count: 4_294_967_295,
    one_month_signup_count: 0,
    version: 4,
  });
});

it("accepts the Farm write's exact Tracker increment while keeping a pending Tracker edit", async () => {
  const bumped = { ...profile, version: 5 };
  api.getFarmTracker.mockResolvedValueOnce(profile).mockResolvedValueOnce(bumped);
  api.updateFarmTracker.mockResolvedValue({ ...bumped, one_month_signup_count: 7, version: 6 });
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(check());
  await waitFor(() => expect(save()).toBeEnabled());
  expect(screen.getByLabelText(month)).toHaveValue("7");
  fireEvent.click(save());
  await waitFor(() => expect(save()).toBeDisabled());
  expect(api.updateFarmTracker).toHaveBeenCalledExactlyOnceWith(farmId, {
    version: 5,
    one_month_signup_count: 7,
  });
  expect(api.getFarmTracker).toHaveBeenCalledTimes(2);
});

it("accepts only the identical Tracker revision after an external Farm rebase", async () => {
  api.getFarmTracker
    .mockResolvedValueOnce(profile)
    .mockResolvedValueOnce(profile)
    .mockResolvedValueOnce({ ...profile, version: 5 });
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(checkExternal());
  await waitFor(() => expect(save()).toBeEnabled());
  fireEvent.click(checkExternal());
  expect(
    await screen.findByRole("button", { name: "Dùng dữ liệu mới và giữ chỉnh sửa" }),
  ).toBeVisible();
  expect(save()).toBeDisabled();
  expect(screen.getByLabelText(month)).toHaveValue("7");
  expect(api.updateFarmTracker).not.toHaveBeenCalled();
});

it.each([
  { ...profile, version: 6 },
  { ...profile, version: 5, signup_count: 24 },
  { ...profile, version: 4 },
])("requires explicit review before using a divergent Tracker snapshot (%j)", async (latest) => {
  api.getFarmTracker.mockResolvedValueOnce(profile).mockResolvedValueOnce(latest);
  api.updateFarmTracker.mockResolvedValue({
    ...latest,
    one_month_signup_count: 7,
    version: latest.version + 1,
  });
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(check());
  const review = await screen.findByRole("button", { name: "Dùng dữ liệu mới và giữ chỉnh sửa" });
  expect(save()).toBeDisabled();
  expect(screen.getByLabelText(month)).toHaveValue("7");
  expect(screen.getByLabelText(sixMonths)).toHaveValue("12");
  expect(api.updateFarmTracker).not.toHaveBeenCalled();
  fireEvent.click(review);
  expect(screen.getByLabelText(month)).toHaveValue("7");
  expect(screen.getByLabelText(sixMonths)).toHaveValue(String(latest.signup_count));
  fireEvent.click(save());
  await waitFor(() => expect(save()).toBeDisabled());
  expect(api.updateFarmTracker).toHaveBeenCalledExactlyOnceWith(farmId, {
    version: latest.version,
    one_month_signup_count: 7,
  });
});

it("preserves the Tracker draft after a conflict and checks current data before explicit review", async () => {
  const fresh = { ...profile, signup_count: 24, version: 5 };
  api.getFarmTracker.mockResolvedValueOnce(profile).mockResolvedValueOnce(fresh);
  api.updateFarmTracker
    .mockRejectedValueOnce(error("version_conflict", 409))
    .mockResolvedValueOnce({ ...fresh, one_month_signup_count: 7, version: 6 });
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(save());
  await screen.findByRole("alert");
  expect(save()).toBeDisabled();
  expect(screen.getByLabelText(month)).toHaveValue("7");
  expect(api.getFarmTracker).toHaveBeenCalledTimes(1);
  retry();
  fireEvent.click(await screen.findByRole("button", { name: "Dùng dữ liệu mới và giữ chỉnh sửa" }));
  expect(screen.getByLabelText(month)).toHaveValue("7");
  expect(screen.getByLabelText(sixMonths)).toHaveValue("24");
  fireEvent.click(save());
  await waitFor(() =>
    expect(api.updateFarmTracker).toHaveBeenLastCalledWith(farmId, {
      version: 5,
      one_month_signup_count: 7,
    }),
  );
});

it.each([new Error("network_error"), error("request_timeout", 408)])(
  "checks the exact intent of an interrupted PATCH without retrying it (%s)",
  async (cause) => {
    api.getFarmTracker.mockResolvedValueOnce(profile).mockResolvedValueOnce({
      ...profile,
      one_month_signup_count: 7,
      version: 5,
    });
    api.updateFarmTracker.mockRejectedValueOnce(cause);
    render(tree(<Tracker />));
    await screen.findByLabelText(month);
    changeCount(month, "7");
    fireEvent.click(save());
    await screen.findByRole("alert");
    expect(save()).toBeDisabled();
    retry();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(save()).toBeDisabled();
    expect(screen.getByLabelText(month)).toHaveValue("7");
    expect(api.updateFarmTracker).toHaveBeenCalledTimes(1);
  },
);

it.each(["conflict", "uncertain"])(
  "requires review of other signup values found after an interrupted create (%s)",
  async (kind) => {
    api.getFarmTracker.mockRejectedValueOnce(notFound()).mockResolvedValueOnce(profile);
    api.enableFarmTracker.mockRejectedValueOnce(
      kind === "conflict"
        ? error("growth_tracker_already_enabled", 409)
        : new Error("network_error"),
    );
    render(tree(<Tracker />));
    await screen.findByLabelText(month);
    changeCount(month, "7");
    fireEvent.click(save());
    await screen.findByRole("alert");
    retry();
    const review = await screen.findByRole("button", { name: "Dùng dữ liệu mới và giữ chỉnh sửa" });
    expect(save()).toBeDisabled();
    expect(screen.getByLabelText(month)).toHaveValue("7");
    expect(screen.getByLabelText(sixMonths)).toHaveValue("0");
    fireEvent.click(review);
    expect(screen.getByLabelText(sixMonths)).toHaveValue("12");
    expect(screen.getByLabelText(month)).toHaveValue("7");
    expect(api.enableFarmTracker).toHaveBeenCalledTimes(1);
  },
);

it("can confirm an interrupted create from a verified matching profile", async () => {
  api.getFarmTracker.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({
    ...profile,
    signup_count: 0,
    one_month_signup_count: 7,
    is_visible: false,
  });
  api.enableFarmTracker.mockRejectedValueOnce(new Error("network_error"));
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(save());
  await screen.findByRole("alert");
  retry();
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(save()).toBeDisabled();
  expect(screen.getByLabelText(month)).toHaveValue("7");
  expect(api.enableFarmTracker).toHaveBeenCalledTimes(1);
});

it.each(["POST", "PATCH"])(
  "keeps an interrupted %s blocked while verification still sees the old state",
  async (method) => {
    const creating = method === "POST";
    const write = creating ? api.enableFarmTracker : api.updateFarmTracker;
    const latest = creating
      ? { ...profile, signup_count: 0, one_month_signup_count: 7, is_visible: false }
      : { ...profile, one_month_signup_count: 7, version: 5 };
    if (creating)
      api.getFarmTracker.mockRejectedValueOnce(notFound()).mockRejectedValueOnce(notFound());
    else api.getFarmTracker.mockResolvedValueOnce(profile).mockResolvedValueOnce(profile);
    api.getFarmTracker.mockResolvedValueOnce(latest);
    write.mockRejectedValueOnce(new Error("network_error"));
    render(tree(<Tracker />));
    await screen.findByLabelText(month);
    changeCount(month, "7");
    fireEvent.click(save());
    await screen.findByRole("alert");
    retry();
    expect(await screen.findByText(/vẫn ở trạng thái trước khi lưu/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Dùng dữ liệu mới và giữ chỉnh sửa" }),
    ).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(screen.getByLabelText(month)).toHaveValue("7");
    retry();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(save()).toBeDisabled();
    expect(write).toHaveBeenCalledOnce();
    expect(api.getFarmTracker).toHaveBeenCalledTimes(3);
  },
);

it.each([
  new Error("network_error"),
  { ...profile, id: "other-farm", version: 5 },
  { ...profile, one_month_signup_count: undefined, version: 5 },
])("locks pending Tracker edits when the follow-up read is unverified (%j)", async (result) => {
  api.getFarmTracker.mockResolvedValueOnce(profile);
  if (result instanceof Error) api.getFarmTracker.mockRejectedValueOnce(result);
  else api.getFarmTracker.mockResolvedValueOnce(result);
  api.getFarmTracker.mockResolvedValueOnce({ ...profile, version: 5 });
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(check());
  await screen.findByRole("alert");
  expect(save()).toBeDisabled();
  expect(screen.getByLabelText(month)).toHaveValue("7");
  retry();
  await waitFor(() => expect(save()).toBeEnabled());
  expect(screen.getByLabelText(month)).toHaveValue("7");
  expect(api.updateFarmTracker).not.toHaveBeenCalled();
  expect(api.getFarmTracker).toHaveBeenCalledTimes(3);
});

it("treats a malformed mutation response as uncertain and requires confirmation", async () => {
  api.getFarmTracker.mockResolvedValueOnce(profile).mockResolvedValueOnce({
    ...profile,
    one_month_signup_count: 7,
    version: 5,
  });
  api.updateFarmTracker.mockResolvedValueOnce({ ...profile, version: 5 });
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(save());
  await screen.findByRole("alert");
  expect(save()).toBeDisabled();
  expect(screen.getByLabelText(month)).toHaveValue("7");
  retry();
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(save()).toBeDisabled();
  expect(api.updateFarmTracker).toHaveBeenCalledTimes(1);
});

it.each([
  ["unauthenticated", 401],
  ["forbidden", 403],
  ["session_changed", 409],
])("retires profile data when a write returns %s", async (message, status) => {
  const onAccessLost = vi.fn();
  const rejection = error(message, status);
  api.updateFarmTracker.mockRejectedValueOnce(rejection);
  render(tree(<Tracker onAccessLost={onAccessLost} />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(save());
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByLabelText(sixMonths)).not.toBeInTheDocument();
  expect(onAccessLost).toHaveBeenCalledExactlyOnceWith(rejection);
});

it("preserves the Tracker draft after a CSRF rejection", async () => {
  const onAccessLost = vi.fn();
  api.updateFarmTracker.mockRejectedValueOnce(error("csrf_rejected", 403));
  render(tree(<Tracker onAccessLost={onAccessLost} />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  fireEvent.click(save());
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByLabelText(month)).toHaveValue("7");
  expect(save()).toBeEnabled();
  expect(onAccessLost).not.toHaveBeenCalled();
});

it("shows read retry without treating an initial network error as profile absence", async () => {
  api.getFarmTracker
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(profile);
  render(tree(<Tracker />));
  await screen.findByRole("alert");
  expect(screen.queryByLabelText(sixMonths)).not.toBeInTheDocument();
  expect(save()).toBeDisabled();
  retry("Thử lại");
  expect(await screen.findByLabelText(sixMonths)).toHaveValue("12");
  expect(api.getFarmTracker).toHaveBeenCalledTimes(2);
  expect(api.enableFarmTracker).not.toHaveBeenCalled();
});

it("blocks duplicate submits while a profile write is pending", async () => {
  let finish!: (value: typeof profile) => void;
  api.updateFarmTracker.mockReturnValueOnce(
    new Promise<typeof profile>((resolve) => (finish = resolve)),
  );
  render(tree(<Tracker />));
  await screen.findByLabelText(month);
  changeCount(month, "7");
  const form = save().closest("form")!;
  await act(async () => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  expect(api.updateFarmTracker).toHaveBeenCalledTimes(1);
  expect(save()).toBeDisabled();
  await act(async () => finish({ ...profile, one_month_signup_count: 7, version: 5 }));
  expect(save()).toBeDisabled();
  expect(screen.getByLabelText(month)).toBeEnabled();
});

it.each([
  { source: "mutation", newSession: false },
  { source: "mutation", newSession: true },
  { source: "Farm verification", newSession: false },
  { source: "Farm verification", newSession: true },
])(
  "guards late Tracker denial from $source against session change ($newSession)",
  async ({ source, newSession }) => {
    let reject!: (cause: unknown) => void;
    const pending = new Promise<void>((_resolve, fail) => (reject = fail));
    if (source === "mutation") api.updateFarmTracker.mockReturnValueOnce(pending);
    else {
      api.getFarmTracker.mockRejectedValueOnce(notFound());
      api.getFarm.mockReturnValueOnce(pending);
    }
    const onAccessLost = vi.fn();
    let client!: ReturnType<typeof useQueryClient>;
    function CaptureClient() {
      client = useQueryClient();
      return null;
    }
    const rendered = render(
      tree(
        <>
          <CaptureClient />
          <Tracker onAccessLost={onAccessLost} />
        </>,
      ),
    );
    if (source === "mutation") {
      await screen.findByLabelText(month);
      changeCount(month, "7");
      fireEvent.click(save());
    } else {
      await waitFor(() => expect(api.getFarm).toHaveBeenCalledTimes(1));
    }
    rendered.rerender(tree(<CaptureClient />, newSession ? "new" : "original"));
    client.setQueryData(farmDetailKey(farmId), { id: farmId });
    const cause = error("forbidden", 403);
    await act(async () => reject(cause));
    expect(farmAccess(client).error).toBe(newSession ? null : cause);
    expect(client.getQueryData(farmDetailKey(farmId))).toEqual(
      newSession ? { id: farmId } : undefined,
    );
    expect(onAccessLost).not.toHaveBeenCalled();
  },
);
