import { selectOption } from "./select-option";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/farms-api", () => ({
  listFarms: mocks.farms,
  getFarm: mocks.farm,
  getFarmTracker: mocks.profile,
  enableFarmTracker: mocks.enable,
  updateFarmTracker: mocks.update,
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
});
afterEach(cleanup);

it("enables Growth Tracker for an existing Farm without resubmitting shared fields", async () => {
  mocks.profile.mockRejectedValue(Object.assign(new Error("not_found"), { status: 404 }));
  mocks.enable.mockResolvedValue(profile);
  view(<FarmTrackerProfileEditor />);
  const farmSelect = await screen.findByRole("combobox", { name: "Chọn trang trại" });
  await waitFor(() => expect(farmSelect).toBeEnabled());
  fireEvent.click(farmSelect);
  expect(await screen.findByRole("option", { name: "Nông trại Xanh" })).toBeVisible();
  fireEvent.keyDown(farmSelect, { key: "Escape" });
  expect(screen.getByRole("combobox", { name: "Chọn trang trại" })).toHaveValue("Chọn trang trại");
  expect(screen.queryByLabelText("Số người đăng ký 6 tháng")).not.toBeInTheDocument();
  selectOption(screen.getByRole("combobox", { name: "Chọn trang trại" }), "farm-1");
  fireEvent.change(await screen.findByLabelText("Số người đăng ký 6 tháng"), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Bật Growth Tracker" }));
  await waitFor(() =>
    expect(mocks.enable).toHaveBeenCalledWith("farm-1", {
      signup_count: 12,
      one_month_signup_count: 0,
      is_visible: true,
    }),
  );
  expect(mocks.replace).toHaveBeenCalledWith("/tracker-farms");
});

it("edits only profile counts and visibility with optimistic version", async () => {
  mocks.profile.mockResolvedValue(profile);
  mocks.update.mockResolvedValue({ ...profile, version: 5 });
  view(<FarmTrackerProfileEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("12")).toBeVisible();
  expect(screen.getByRole("link", { name: "Sửa thông tin trang trại" })).toHaveAttribute(
    "href",
    "/farms/farm-1/edit",
  );
  fireEvent.change(screen.getByLabelText("Số người đăng ký 1 tháng"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu Growth Tracker" }));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith("farm-1", {
      version: 4,
      signup_count: 12,
      one_month_signup_count: 4,
      is_visible: true,
    }),
  );
});

it("keeps unsaved Growth Tracker counts when the Admin language changes", async () => {
  mocks.profile.mockResolvedValue(profile);
  view(
    <>
      <LanguageSwitcher />
      <FarmTrackerProfileEditor farmId="farm-1" />
    </>,
  );
  fireEvent.change(await screen.findByLabelText("Số người đăng ký 6 tháng"), {
    target: { value: "29" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "EN" }));
  expect(screen.getByLabelText("6-month signup count")).toHaveValue(29);
  expect(screen.getByLabelText("1-month signup count")).toHaveValue(3);
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(mocks.farm).toHaveBeenCalledTimes(1);
});

it("keeps an unsaved profile draft when the Farm search and page change", async () => {
  mocks.profile.mockRejectedValue(Object.assign(new Error("not_found"), { status: 404 }));
  const lastPage = { data: [], meta: { page: 3, page_size: 20, total: 41 } };
  let finishPage!: (page: typeof lastPage) => void;
  const pendingPage = new Promise<typeof lastPage>((resolve) => {
    finishPage = resolve;
  });
  mocks.farms.mockImplementation(({ page, search }) =>
    page === 3
      ? pendingPage
      : Promise.resolve({
          data: page === 1 && !search ? [farm] : [],
          meta: { page, page_size: 20, total: search ? 21 : 41 },
        }),
  );
  view(<FarmTrackerProfileEditor />);
  selectOption(await screen.findByRole("combobox", { name: "Chọn trang trại" }), "farm-1");
  const count = await screen.findByLabelText("Số người đăng ký 6 tháng");
  fireEvent.change(count, { target: { value: "19" } });
  fireEvent.change(screen.getByLabelText("Số người đăng ký 1 tháng"), {
    target: { value: "7" },
  });
  const pages = screen.getByRole("navigation", { name: "Trang 1/3" });
  expect(within(pages).getByRole("button", { name: "Trước" })).toBeDisabled();
  fireEvent.click(within(pages).getByRole("button", { name: "3" }));
  await waitFor(() => expect(mocks.farms).toHaveBeenCalledWith({ page: 3, search: "" }));
  const pendingPagination = screen.getByRole("navigation", { name: "Trang 3/3" });
  expect(pendingPagination).toHaveAttribute("aria-busy", "true");
  expect(within(pendingPagination).getByRole("button", { name: "Trước" })).toBeDisabled();
  finishPage(lastPage);
  await waitFor(() => expect(pendingPagination).toHaveAttribute("aria-busy", "false"));
  expect(
    within(screen.getByRole("navigation", { name: "Trang 3/3" })).getByRole("button", {
      name: "Sau",
    }),
  ).toBeDisabled();
  expect(screen.getByLabelText("Số người đăng ký 6 tháng")).toHaveValue(19);
  expect(screen.getByRole("combobox", { name: "Chọn trang trại" })).toHaveValue("Nông trại Xanh");
  fireEvent.change(screen.getByRole("searchbox", { name: "Tìm Farm" }), {
    target: { value: "khác" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  await waitFor(() => expect(mocks.farms).toHaveBeenCalledWith({ page: 1, search: "khác" }));
  const searchPages = await screen.findByRole("navigation", { name: "Trang 1/2" });
  fireEvent.click(within(searchPages).getByRole("button", { name: "Sau" }));
  await waitFor(() => expect(mocks.farms).toHaveBeenCalledWith({ page: 2, search: "khác" }));
  expect(screen.getByLabelText("Số người đăng ký 6 tháng")).toHaveValue(19);
  expect(screen.getByLabelText("Số người đăng ký 1 tháng")).toHaveValue(7);
  expect(screen.getByRole("combobox", { name: "Chọn trang trại" })).toHaveValue("Nông trại Xanh");
  expect(mocks.profile).toHaveBeenCalledTimes(1);
});

it.each(["", "-1", "1.5", "1e2", "4294967296"])(
  "rejects an invalid signup count (%j) in either field before sending a request",
  async (value) => {
    mocks.profile.mockResolvedValue(profile);
    view(<FarmTrackerProfileEditor farmId="farm-1" />);
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
  view(<FarmTrackerProfileEditor farmId="farm-1" />);
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
  view(<FarmTrackerProfileEditor farmId="farm-1" />);
  const sixMonths = await screen.findByLabelText("Số người đăng ký 6 tháng");
  const month = screen.getByLabelText("Số người đăng ký 1 tháng");
  const save = screen.getByRole("button", { name: "Lưu Growth Tracker" });
  fireEvent.change(sixMonths, { target: { value: "19" } });
  fireEvent.change(month, { target: { value: "7" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Hiển thị trên Growth Tracker công khai" }));
  fireEvent.click(save);

  const warning = await screen.findByRole("alert");
  expect(warning).toHaveTextContent("Profile đã được sửa ở nơi khác");
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
