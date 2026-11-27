import { useQueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmDetail } from "@/components/farm-detail";
import { ToastProvider } from "@/components/toast-provider";
import { farmDetailKey } from "@/lib/farm-query";
import type { Farm, TrackerFarm } from "@/lib/types";

const api = vi.hoisted(() => ({
  getFarm: vi.fn(),
  getFarmTracker: vi.fn(),
  enableFarmTracker: vi.fn(),
  updateFarmTracker: vi.fn(),
  saveFarm: vi.fn(),
  deleteFarm: vi.fn(),
}));
// Keep these Farm editor assertions independent of the separate link request.
vi.mock("@/lib/farm-supply-request-api", () => ({
  farmerLink: vi.fn(async (farmId: string) => ({
    farm_id: farmId,
    url: `/farmer#token=${"A".repeat(43)}`,
  })),
}));

vi.mock("@/lib/farms-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/farms-api")>()),
  ...api,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
}));

const search = new URLSearchParams("tab=information");
const farm: Farm = {
  id: "farm-1",
  name_vi: "Nông trại Xanh",
  name_en: "Green Farm",
  location_vi: "Đà Lạt",
  location_en: "Da Lat",
  contact_phone: "",
  description_vi: "Rau sạch",
  description_en: "Organic greens",
  image: null,
  photos: [],
  is_active: true,
  capabilities: { delete: { allowed: true, reasons: [] } },
  in_stock_product_count: 8,
  out_of_stock_product_count: 4,
  version: 2,
  created_at: "2026-01-01",
  updated_at: "2026-10-15",
};
const profile: TrackerFarm = {
  ...farm,
  signup_count: 24,
  one_month_signup_count: 8,
  is_visible: true,
  sort_order: 0,
  version: 7,
};
const header = () =>
  within(screen.getByRole("banner")).getByRole("button", { name: "Tùy chọn khác" });
const errorResponse = (message: string, status: number) =>
  Object.assign(new Error(message), { status });
const checkTracker = () => screen.findByRole("button", { name: "Kiểm tra lại dữ liệu" });

beforeEach(() => {
  vi.resetAllMocks();
  api.getFarm.mockResolvedValue(farm);
  api.getFarmTracker.mockResolvedValue(profile);
});
afterEach(cleanup);

function renderInformation(extra?: ReactNode) {
  render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider>
          {extra}
          <FarmDetail farmId={farm.id} />
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

async function openInformation() {
  renderInformation();
  return screen.findByLabelText("Số người đăng ký 6 tháng");
}

async function saveInformation() {
  const save = screen.getByRole("button", { name: "Lưu thay đổi" });
  expect(save).toBeEnabled();
  await act(async () => fireEvent.click(save));
}

async function deactivateFarm() {
  expect(header()).toBeEnabled();
  fireEvent.click(header());
  fireEvent.click(await screen.findByRole("menuitem", { name: "Ngừng hoạt động" }));
  const dialog = screen.getByRole("dialog", { name: "Ngừng hoạt động" });
  await act(async () =>
    fireEvent.click(within(dialog).getByRole("button", { name: "Ngừng hoạt động" })),
  );
}

it("blocks Farm mutations after a Tracker PATCH timeout until a new revision confirms the save", async () => {
  api.updateFarmTracker.mockRejectedValue(errorResponse("timeout", 408));
  const count = await openInformation();
  fireEvent.change(count, { target: { value: "25" } });
  await saveInformation();

  const check = await checkTracker();
  expect(header()).toBeDisabled();
  expect(api.updateFarmTracker).toHaveBeenCalledExactlyOnceWith("farm-1", {
    version: 7,
    signup_count: 25,
  });
  fireEvent.click(header());
  expect(screen.queryByRole("menuitem", { name: "Xóa trang trại" })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Ngừng hoạt động" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.saveFarm).not.toHaveBeenCalled();
  expect(api.deleteFarm).not.toHaveBeenCalled();

  await act(async () => fireEvent.click(check));
  expect(header()).toBeDisabled();
  api.getFarmTracker.mockResolvedValue({ ...profile, version: 8, signup_count: 25 });
  await act(async () => fireEvent.click(check));
  await waitFor(() => expect(header()).toBeEnabled());
  expect(count).toHaveValue("25");
  expect(api.updateFarmTracker).toHaveBeenCalledTimes(1);
});

it("blocks Farm mutations after a Tracker POST timeout until the created profile is verified", async () => {
  api.getFarmTracker.mockRejectedValue(errorResponse("not_found", 404));
  api.enableFarmTracker.mockRejectedValue(errorResponse("timeout", 408));
  const count = await openInformation();
  expect(count).toHaveValue("0");
  expect(api.enableFarmTracker).not.toHaveBeenCalled();
  fireEvent.change(count, { target: { value: "5" } });
  await saveInformation();

  const check = await checkTracker();
  expect(header()).toBeDisabled();
  expect(api.enableFarmTracker).toHaveBeenCalledExactlyOnceWith("farm-1", {
    signup_count: 5,
    one_month_signup_count: 0,
    is_visible: false,
  });

  await act(async () => fireEvent.click(check));
  expect(header()).toBeDisabled();
  api.getFarmTracker.mockResolvedValue({
    ...profile,
    version: 1,
    signup_count: 5,
    one_month_signup_count: 0,
    is_visible: false,
  });
  await act(async () => fireEvent.click(check));
  expect(header()).toBeEnabled();
  expect(count).toHaveValue("5");
  expect(api.enableFarmTracker).toHaveBeenCalledTimes(1);
  expect(api.saveFarm).not.toHaveBeenCalled();
  expect(api.deleteFarm).not.toHaveBeenCalled();
});

it.each(["Ngừng hoạt động", "Xóa trang trại"])(
  "serializes the Farm confirmation (%s) with Tracker save and blocks it after a malformed response",
  async (action) => {
    api.updateFarmTracker.mockResolvedValue({ ...profile, signup_count: 25 });
    const count = await openInformation();
    fireEvent.change(count, { target: { value: "25" } });
    const save = screen.getByRole("button", { name: "Lưu thay đổi" });
    expect(save).toBeEnabled();
    fireEvent.click(header());
    fireEvent.click(await screen.findByRole("menuitem", { name: action }));
    const dialog = await screen.findByRole("dialog", { name: action });
    expect(save).toBeDisabled();
    await act(async () => fireEvent.submit(save.closest("form")!));
    expect(api.updateFarmTracker).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));

    await saveInformation();
    await checkTracker();
    expect(api.updateFarmTracker).toHaveBeenCalledTimes(1);
    expect(header()).toBeDisabled();
    fireEvent.click(header());
    expect(screen.queryByRole("menuitem", { name: action })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.saveFarm).not.toHaveBeenCalled();
    expect(api.deleteFarm).not.toHaveBeenCalled();
  },
);

it("keeps Farm mutations locked through Tracker conflict review until the latest revision is adopted", async () => {
  api.updateFarmTracker.mockRejectedValue(errorResponse("version_conflict", 409));
  const count = await openInformation();
  fireEvent.change(count, { target: { value: "25" } });
  await saveInformation();
  const check = await checkTracker();
  expect(header()).toBeDisabled();

  api.getFarmTracker.mockResolvedValue({ ...profile, version: 8, one_month_signup_count: 9 });
  await act(async () => fireEvent.click(check));
  const adopt = await screen.findByRole("button", { name: "Dùng dữ liệu mới và giữ chỉnh sửa" });
  expect(header()).toBeDisabled();
  expect(adopt).toBeEnabled();
  fireEvent.click(adopt);

  expect(header()).toBeEnabled();
  expect(count).toHaveValue("25");
  expect(screen.getByLabelText("Số người đăng ký 1 tháng")).toHaveValue("9");
  expect(api.updateFarmTracker).toHaveBeenCalledTimes(1);
});

it("allows Farm deactivation with dirty Tracker and Farm drafts and preserves both drafts", async () => {
  const count = await openInformation();
  const name = screen.getByDisplayValue("Nông trại Xanh");
  fireEvent.change(count, { target: { value: "25" } });
  fireEvent.change(name, { target: { value: "Nông trại mới" } });
  api.saveFarm.mockResolvedValue({ ...farm, is_active: false, version: 3 });
  api.getFarmTracker.mockResolvedValue({ ...profile, version: 8 });
  await deactivateFarm();

  expect(await screen.findByText("Ngừng hoạt động")).toBeVisible();
  expect(api.saveFarm).toHaveBeenCalledExactlyOnceWith("farm-1", {
    version: 2,
    is_active: false,
  });
  expect(count).toHaveValue("25");
  expect(name).toHaveValue("Nông trại mới");
  expect(api.updateFarmTracker).not.toHaveBeenCalled();
  expect(header()).toBeEnabled();
});

it.each([
  ["validation_error", 400],
  ["csrf_rejected", 403],
])("allows Farm mutations after a definite Tracker %s rejection", async (message, status) => {
  api.updateFarmTracker.mockRejectedValue(errorResponse(message, status));
  const count = await openInformation();
  fireEvent.change(count, { target: { value: "25" } });
  await saveInformation();

  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Nông trại Xanh" })).toBeVisible();
  expect(count).toBeEnabled();
  expect(count).toHaveValue("25");
  expect(header()).toBeEnabled();
});

it("allows Farm deactivation after an initial Tracker read error", async () => {
  api.getFarmTracker.mockRejectedValue(errorResponse("server_error", 503));
  api.saveFarm.mockResolvedValue({ ...farm, is_active: false, version: 3 });
  renderInformation();

  expect(await screen.findByRole("button", { name: "Thử lại" })).toBeEnabled();
  await deactivateFarm();
  expect(await screen.findByText("Ngừng hoạt động")).toBeVisible();
  expect(api.getFarmTracker).toHaveBeenCalledTimes(1);
});

it("allows Tracker verification after recovering a Farm header write", async () => {
  const count = await openInformation();
  fireEvent.change(count, { target: { value: "25" } });
  api.saveFarm.mockRejectedValue(errorResponse("timeout", 408));
  await deactivateFarm();

  const checkFarm = await screen.findByRole("button", { name: "Kiểm tra dữ liệu mới nhất" });
  expect(header()).toBeDisabled();
  expect(checkFarm).toBeEnabled();
  api.getFarm.mockResolvedValue({ ...farm, is_active: false, version: 3 });
  api.getFarmTracker.mockRejectedValue(errorResponse("server_error", 503));
  await act(async () => fireEvent.click(checkFarm));

  const check = await checkTracker();
  expect(header()).toBeDisabled();
  expect(check).toBeEnabled();
  api.getFarmTracker.mockResolvedValue({ ...profile, version: 8 });
  await act(async () => fireEvent.click(check));

  expect(header()).toBeEnabled();
  expect(count).toHaveValue("25");
  expect(api.saveFarm).toHaveBeenCalledTimes(1);
  expect(api.updateFarmTracker).not.toHaveBeenCalled();
});

it("resolves a Farm conflict and a pending Tracker write when their recovery states overlap", async () => {
  let refreshFarm!: () => Promise<void>;
  function RefreshFarm() {
    const client = useQueryClient();
    refreshFarm = () => client.refetchQueries({ queryKey: farmDetailKey(farm.id) });
    return null;
  }
  api.updateFarmTracker.mockRejectedValue(errorResponse("timeout", 408));
  renderInformation(<RefreshFarm />);
  const count = await screen.findByLabelText("Số người đăng ký 6 tháng");
  fireEvent.change(count, { target: { value: "25" } });
  await saveInformation();

  api.getFarm.mockResolvedValue({ ...farm, version: 3, location_vi: "Huế" });
  await act(async () => refreshFarm());
  const adoptFarm = await screen.findByRole("button", { name: "Dùng phiên bản mới nhất" });
  expect(header()).toBeDisabled();
  expect(adoptFarm).toBeEnabled();
  await act(async () => fireEvent.click(adoptFarm));

  api.getFarmTracker.mockResolvedValue({ ...profile, version: 9, signup_count: 25 });
  const check = await checkTracker();
  expect(header()).toBeDisabled();
  expect(check).toBeEnabled();
  await act(async () => fireEvent.click(check));
  const adoptTracker = await screen.findByRole("button", {
    name: "Dùng dữ liệu mới và giữ chỉnh sửa",
  });
  expect(header()).toBeDisabled();
  fireEvent.click(adoptTracker);

  expect(header()).toBeEnabled();
  expect(count).toHaveValue("25");
  expect(screen.getByDisplayValue("Huế")).toBeVisible();
  expect(api.updateFarmTracker).toHaveBeenCalledTimes(1);
  expect(api.saveFarm).not.toHaveBeenCalled();
});

it("blocks header mutations until an Information save and its Tracker verification settle", async () => {
  const updated = { ...farm, name_vi: "Nông trại mới", version: 3 };
  let confirmSave!: (value: Farm) => void;
  api.saveFarm.mockImplementationOnce(
    () =>
      new Promise<Farm>((resolve) => {
        confirmSave = resolve;
      }),
  );
  await openInformation();
  fireEvent.change(screen.getByDisplayValue("Nông trại Xanh"), {
    target: { value: "Nông trại mới" },
  });
  await saveInformation();

  expect(header()).toBeDisabled();
  expect(api.saveFarm).toHaveBeenCalledExactlyOnceWith("farm-1", {
    version: 2,
    name_vi: "Nông trại mới",
  });
  api.getFarmTracker.mockRejectedValue(errorResponse("server_error", 503));
  await act(async () => confirmSave(updated));

  const check = await checkTracker();
  expect(header()).toBeDisabled();
  expect(check).toBeEnabled();
  api.getFarmTracker.mockResolvedValue({ ...profile, version: 8 });
  await act(async () => fireEvent.click(check));
  expect(header()).toBeEnabled();
  expect(api.saveFarm).toHaveBeenCalledTimes(1);
  expect(api.deleteFarm).not.toHaveBeenCalled();
});
