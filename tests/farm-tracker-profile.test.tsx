import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { FarmTrackerProfileEditor } from "@/components/farm-tracker-profile-editor";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ToastProvider } from "@/components/toast-provider";

const mocks = vi.hoisted(() => ({
  farms: vi.fn(),
  farm: vi.fn(),
  profile: vi.fn(),
  enable: vi.fn(),
  update: vi.fn(),
  disable: vi.fn(),
  saveFarm: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/farms-api", () => ({
  listFarms: mocks.farms,
  getFarm: mocks.farm,
  getFarmTracker: mocks.profile,
  enableFarmTracker: mocks.enable,
  updateFarmTracker: mocks.update,
  disableFarmTracker: mocks.disable,
  saveFarm: mocks.saveFarm,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

const farm = {
  id: "farm-1",
  name_vi: "Nông trại Xanh",
  name_en: "Green Farm",
  location_vi: "Đà Lạt",
  location_en: "Da Lat",
  description_vi: "",
  description_en: "",
  image: null,
  photos: [],
  is_active: true,
  in_stock_product_count: 0,
  out_of_stock_product_count: 0,
  version: 1,
  created_at: "",
  updated_at: "",
};
const profile = {
  ...farm,
  signup_count: 12,
  one_month_signup_count: 3,
  is_visible: true,
  sort_order: 0,
  version: 4,
};
function view(node: React.ReactNode) {
  return render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>{node}</ToastProvider>
    </AdminI18nProvider>,
  );
}
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.farms.mockResolvedValue({ data: [farm], meta: { page: 1, page_size: 20, total: 1 } });
  mocks.farm.mockResolvedValue(farm);
  mocks.disable.mockResolvedValue(undefined);
});
afterEach(cleanup);

it("enables Growth Tracker for the current Farm and stays on its tab", async () => {
  mocks.profile.mockRejectedValue(Object.assign(new Error("not_found"), { status: 404 }));
  mocks.enable.mockResolvedValue(profile);
  view(<FarmTrackerProfileEditor farm={farm} />);

  const count = await screen.findByLabelText("Số người đăng ký 6 tháng");
  expect(screen.getByText("Chưa bật Growth Tracker")).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  fireEvent.change(count, { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Bật Growth Tracker" }));

  expect(await screen.findByRole("button", { name: "Lưu Growth Tracker" })).toBeVisible();
  expect(screen.getByLabelText("Số người đăng ký 1 tháng")).toHaveValue(3);
  expect(mocks.enable).toHaveBeenCalledWith("farm-1", {
    signup_count: 12,
    one_month_signup_count: 0,
    is_visible: true,
  });
  expect(mocks.profile).toHaveBeenCalledWith("farm-1", expect.any(AbortSignal));
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(mocks.farm).not.toHaveBeenCalled();
  expect(mocks.farms).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("edits counts and visibility with the current optimistic version and hydrates the response", async () => {
  mocks.profile.mockResolvedValue(profile);
  const updated = { ...profile, signup_count: 23, is_visible: false, version: 5 };
  mocks.update.mockResolvedValue(updated);
  view(<FarmTrackerProfileEditor farm={farm} />);
  const month = await screen.findByLabelText("Số người đăng ký 1 tháng");
  expect(screen.getByText("Đã bật Growth Tracker")).toBeVisible();
  expect(screen.getByText("Bắt đầu phát triển")).toBeVisible();
  expect(screen.getByText("Cho phép hiển thị")).toBeVisible();
  fireEvent.change(month, { target: { value: "4" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Hiển thị trên Growth Tracker công khai" }));
  const save = screen.getByRole("button", { name: "Lưu Growth Tracker" });
  fireEvent.click(save);
  expect(await screen.findByDisplayValue("23")).toBeVisible();
  expect(screen.getByText("Chăm lo cho gia đình")).toBeVisible();
  expect(screen.getByText("Đã ẩn")).toBeVisible();
  expect(mocks.update).toHaveBeenCalledWith("farm-1", {
    version: 4,
    signup_count: 12,
    one_month_signup_count: 4,
    is_visible: false,
  });
  fireEvent.click(save);
  await waitFor(() =>
    expect(mocks.update).toHaveBeenLastCalledWith("farm-1", {
      version: 5,
      signup_count: 23,
      one_month_signup_count: 3,
      is_visible: false,
    }),
  );
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("keeps the draft and distinguishes inactive Farm from Tracker visibility when the locale changes", async () => {
  mocks.profile.mockResolvedValue(profile);
  view(
    <>
      <LanguageSwitcher />
      <FarmTrackerProfileEditor farm={{ ...farm, is_active: false }} />
    </>,
  );
  expect(await screen.findByText(/Trang trại đã tắt hoạt động/)).toBeVisible();
  expect(screen.getByText("Cho phép hiển thị")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Số người đăng ký 6 tháng"), {
    target: { value: "29" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "EN" }));
  expect(screen.getByLabelText("6-month signup count")).toHaveValue(29);
  expect(screen.getByLabelText("1-month signup count")).toHaveValue(3);
  expect(screen.getByText(/This farm is inactive/)).toBeVisible();
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(mocks.farm).not.toHaveBeenCalled();
});

it("warns about an inactive farm when a hidden profile is set to become public", async () => {
  mocks.profile.mockResolvedValue({ ...profile, is_visible: false });
  view(<FarmTrackerProfileEditor farm={{ ...farm, is_active: false }} />);

  const visibility = await screen.findByRole("checkbox", {
    name: "Hiển thị trên Growth Tracker công khai",
  });
  expect(visibility).not.toBeChecked();
  expect(screen.queryByText(/Trang trại đã tắt hoạt động/)).not.toBeInTheDocument();
  fireEvent.click(visibility);
  expect(screen.getByText(/Trang trại đã tắt hoạt động/)).toBeVisible();
});

it("hides the disable dialog outside Tracker and keeps the draft when returning", async () => {
  mocks.profile.mockResolvedValue(profile);
  const content = (isTabActive: boolean) => (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <FarmTrackerProfileEditor farm={farm} isTabActive={isTabActive} />
      </ToastProvider>
    </AdminI18nProvider>
  );
  const rendered = render(content(true));

  fireEvent.change(await screen.findByLabelText("Số người đăng ký 6 tháng"), {
    target: { value: "29" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tắt Growth Tracker" }));
  expect(screen.getByRole("dialog")).toBeVisible();

  rendered.rerender(content(false));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  rendered.rerender(content(true));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  expect(screen.getByLabelText("Số người đăng ký 6 tháng")).toHaveValue(29);
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(mocks.farm).not.toHaveBeenCalled();
  expect(mocks.disable).not.toHaveBeenCalled();
});

it("disables the profile only after confirmation and allows enabling again in place", async () => {
  mocks.profile.mockResolvedValue(profile);
  view(<FarmTrackerProfileEditor farm={farm} />);
  const disable = await screen.findByRole("button", { name: "Tắt Growth Tracker" });
  fireEvent.click(disable);
  const dialog = screen.getByRole("dialog", { name: "Tắt Growth Tracker" });
  expect(
    within(dialog).getByText(/Thông tin trang trại và sản phẩm vẫn được giữ lại/),
  ).toBeVisible();
  expect(mocks.disable).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(disable);
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Tắt Growth Tracker" }),
  );
  expect(await screen.findByRole("button", { name: "Bật Growth Tracker" })).toBeVisible();
  expect(screen.getByLabelText("Số người đăng ký 6 tháng")).toHaveValue(0);
  expect(mocks.disable).toHaveBeenCalledWith("farm-1");
  expect(mocks.disable).toHaveBeenCalledTimes(1);
  expect(mocks.saveFarm).not.toHaveBeenCalled();
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("requires a profile reload and a new confirmation after an interrupted disable", async () => {
  mocks.profile.mockResolvedValue(profile);
  mocks.disable.mockRejectedValueOnce(new Error("network_error"));
  view(<FarmTrackerProfileEditor farm={farm} />);

  const label = "Tắt Growth Tracker";
  fireEvent.click(await screen.findByRole("button", { name: label }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: label })).getByRole("button", { name: label }),
  );

  const recovery = await screen.findByRole("alert");
  expect(screen.getByText("Đã bật Growth Tracker")).toBeVisible();
  expect(screen.getByRole("button", { name: label })).toBeDisabled();
  expect(mocks.disable).toHaveBeenCalledExactlyOnceWith("farm-1");

  fireEvent.click(within(recovery).getByRole("button", { name: "Tải lại dữ liệu" }));
  const disable = await screen.findByRole("button", { name: label });
  expect(disable).toBeEnabled();
  expect(mocks.disable).toHaveBeenCalledTimes(1);
  fireEvent.click(disable);
  expect(mocks.disable).toHaveBeenCalledTimes(1);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: label })).getByRole("button", { name: label }),
  );

  expect(await screen.findByRole("button", { name: "Bật Growth Tracker" })).toBeVisible();
  expect(mocks.disable.mock.calls).toEqual([["farm-1"], ["farm-1"]]);
  expect(mocks.profile).toHaveBeenCalledTimes(2);
  expect(mocks.farm).not.toHaveBeenCalled();
  expect(mocks.saveFarm).not.toHaveBeenCalled();
});

it.each(["", "-1", "1.5", "1e2", "4294967296"])(
  "rejects an invalid signup count (%j) in either field before sending a request",
  async (value) => {
    mocks.profile.mockResolvedValue(profile);
    view(<FarmTrackerProfileEditor farm={farm} />);
    const sixMonths = await screen.findByLabelText("Số người đăng ký 6 tháng");
    const month = screen.getByLabelText("Số người đăng ký 1 tháng");
    const save = screen.getByRole("button", { name: "Lưu Growth Tracker" });

    for (const field of [sixMonths, month]) {
      fireEvent.change(field, { target: { value } });
      fireEvent.click(save);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(
        value
          ? "Số đăng ký phải là số nguyên từ 0 đến 4.294.967.295."
          : "Vui lòng nhập số đăng ký.",
      );
      expect(mocks.update).not.toHaveBeenCalled();
      fireEvent.change(field, { target: { value: "0" } });
      expect(field).not.toHaveAttribute("aria-invalid", "true");
    }
  },
);

it("submits zero and the maximum supported signup count as numbers", async () => {
  mocks.profile.mockResolvedValue(profile);
  mocks.update.mockResolvedValue({ ...profile, version: 5 });
  view(<FarmTrackerProfileEditor farm={farm} />);
  fireEvent.change(await screen.findByLabelText("Số người đăng ký 6 tháng"), {
    target: { value: "4294967295" },
  });
  fireEvent.change(screen.getByLabelText("Số người đăng ký 1 tháng"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu Growth Tracker" }));

  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith("farm-1", {
      signup_count: 4_294_967_295,
      one_month_signup_count: 0,
      version: 4,
      is_visible: true,
    }),
  );
});

it("preserves the profile draft after a version conflict until the user reloads it", async () => {
  const fresh = { ...profile, signup_count: 24, one_month_signup_count: 8, version: 5 };
  mocks.profile.mockResolvedValueOnce(profile).mockResolvedValueOnce(fresh);
  mocks.update
    .mockRejectedValueOnce(Object.assign(new Error("version_conflict"), { status: 409 }))
    .mockResolvedValueOnce({ ...fresh, version: 6 });
  view(<FarmTrackerProfileEditor farm={farm} />);
  const sixMonths = await screen.findByLabelText("Số người đăng ký 6 tháng");
  const month = screen.getByLabelText("Số người đăng ký 1 tháng");
  const save = screen.getByRole("button", { name: "Lưu Growth Tracker" });
  fireEvent.change(sixMonths, { target: { value: "19" } });
  fireEvent.change(month, { target: { value: "7" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Hiển thị trên Growth Tracker công khai" }));
  fireEvent.click(save);

  const warning = await screen.findByRole("alert");
  expect(warning).toHaveTextContent("Hồ sơ Growth Tracker đã thay đổi");
  expect(sixMonths).toHaveValue(19);
  expect(month).toHaveValue(7);
  expect(
    screen.getByRole("checkbox", { name: "Hiển thị trên Growth Tracker công khai" }),
  ).not.toBeChecked();
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(save).toBeDisabled();
  fireEvent.click(save);
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.replace).not.toHaveBeenCalled();

  fireEvent.click(within(warning).getByRole("button", { name: "Tải lại dữ liệu" }));
  expect(await screen.findByDisplayValue("24")).toBeVisible();
  expect(screen.getByLabelText("Số người đăng ký 1 tháng")).toHaveValue(8);
  fireEvent.click(screen.getByRole("button", { name: "Lưu Growth Tracker" }));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenLastCalledWith("farm-1", {
      signup_count: 24,
      one_month_signup_count: 8,
      version: 5,
      is_visible: true,
    }),
  );
});

it("queries the profile after an enable conflict and switches from enable to edit without another POST", async () => {
  mocks.profile
    .mockRejectedValueOnce(Object.assign(new Error("not_found"), { status: 404 }))
    .mockResolvedValueOnce(profile);
  mocks.enable.mockRejectedValueOnce(
    Object.assign(new Error("growth_tracker_already_enabled"), { status: 409 }),
  );
  view(<FarmTrackerProfileEditor farm={farm} />);
  fireEvent.click(await screen.findByRole("button", { name: "Bật Growth Tracker" }));
  const warning = await screen.findByRole("alert");
  fireEvent.click(within(warning).getByRole("button", { name: "Tải lại dữ liệu" }));
  expect(await screen.findByRole("button", { name: "Lưu Growth Tracker" })).toBeEnabled();
  expect(mocks.enable).toHaveBeenCalledTimes(1);
  expect(mocks.profile).toHaveBeenCalledTimes(2);
});

it.each([new Error("network_error"), Object.assign(new Error("request_timeout"), { status: 408 })])(
  "locks writes until a read verifies the result of an interrupted save (%s)",
  async (cause) => {
    mocks.profile.mockResolvedValueOnce(profile).mockResolvedValueOnce({ ...profile, version: 5 });
    mocks.update.mockRejectedValueOnce(cause);
    view(<FarmTrackerProfileEditor farm={farm} />);
    const save = await screen.findByRole("button", { name: "Lưu Growth Tracker" });
    fireEvent.click(save);
    const error = await screen.findByRole("alert");
    expect(save).toBeDisabled();
    fireEvent.click(save);
    fireEvent.click(within(error).getByRole("button", { name: "Tải lại dữ liệu" }));
    expect(await screen.findByRole("button", { name: "Lưu Growth Tracker" })).toBeEnabled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.profile).toHaveBeenCalledTimes(2);
  },
);

it.each([
  ["unauthenticated", 401],
  ["forbidden", 403],
  ["session_changed", 409],
])("retires profile data when a write returns %s", async (message, status) => {
  mocks.profile.mockResolvedValue(profile);
  mocks.update.mockRejectedValueOnce(Object.assign(new Error(message), { status }));
  view(<FarmTrackerProfileEditor farm={farm} />);
  fireEvent.click(await screen.findByRole("button", { name: "Lưu Growth Tracker" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByLabelText("Số người đăng ký 6 tháng")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tắt Growth Tracker" })).not.toBeInTheDocument();
  expect(mocks.profile).toHaveBeenCalledTimes(1);
});

it("shows a read retry when loading fails without starting an enable mutation", async () => {
  mocks.profile.mockRejectedValueOnce(new Error("network_error")).mockResolvedValueOnce(profile);
  view(<FarmTrackerProfileEditor farm={farm} />);
  const error = await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Bật Growth Tracker" })).not.toBeInTheDocument();
  fireEvent.click(within(error).getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByDisplayValue("12")).toBeVisible();
  expect(mocks.profile).toHaveBeenCalledTimes(2);
  expect(mocks.enable).not.toHaveBeenCalled();
});

it("blocks duplicate submits while the first profile write is pending", async () => {
  mocks.profile.mockResolvedValue(profile);
  let finish!: (value: typeof profile) => void;
  mocks.update.mockReturnValueOnce(new Promise<typeof profile>((resolve) => (finish = resolve)));
  view(<FarmTrackerProfileEditor farm={farm} />);
  const save = await screen.findByRole("button", { name: "Lưu Growth Tracker" });
  const form = save.closest("form")!;
  await act(async () => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(save).toBeDisabled();
  await act(async () => finish(profile));
  expect(save).toBeEnabled();
});
