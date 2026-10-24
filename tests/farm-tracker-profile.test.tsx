import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  expect(await screen.findByRole("option", { name: "Nông trại Xanh" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Chọn trang trại" })).toHaveValue("");
  expect(screen.queryByLabelText("Số người đăng ký 6 tháng")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Chọn trang trại" }), {
    target: { value: "farm-1" },
  });
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
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByLabelText("6-month signup count")).toHaveValue(29);
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(mocks.farm).toHaveBeenCalledTimes(1);
});

it("keeps an unsaved profile draft when the Farm search and page change", async () => {
  mocks.profile.mockRejectedValue(Object.assign(new Error("not_found"), { status: 404 }));
  mocks.farms.mockImplementation(({ page, search }) =>
    Promise.resolve({
      data: page === 1 && !search ? [farm] : [],
      meta: { page, page_size: 20, total: search ? 0 : 21 },
    }),
  );
  view(<FarmTrackerProfileEditor />);
  fireEvent.change(await screen.findByRole("combobox", { name: "Chọn trang trại" }), {
    target: { value: "farm-1" },
  });
  const count = await screen.findByLabelText("Số người đăng ký 6 tháng");
  fireEvent.change(count, { target: { value: "19" } });
  fireEvent.click(screen.getByRole("button", { name: "Sau" }));
  await waitFor(() => expect(mocks.farms).toHaveBeenCalledWith({ page: 2, search: "" }));
  expect(screen.getByLabelText("Số người đăng ký 6 tháng")).toHaveValue(19);
  expect(screen.getByRole("combobox", { name: "Chọn trang trại" })).toHaveValue("farm-1");
  fireEvent.change(screen.getByRole("searchbox", { name: "Tìm Farm" }), {
    target: { value: "khác" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
  await waitFor(() => expect(mocks.farms).toHaveBeenCalledWith({ page: 1, search: "khác" }));
  expect(screen.getByLabelText("Số người đăng ký 6 tháng")).toHaveValue(19);
  expect(screen.getByRole("combobox", { name: "Chọn trang trại" })).toHaveValue("farm-1");
  expect(mocks.profile).toHaveBeenCalledTimes(1);
});
