import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { ShippingAreaManager } from "@/components/shipping-area-manager";
import { ToastProvider } from "@/components/toast-provider";
import { getAdministrativeProvinces, getAdministrativeWards } from "@/lib/administrative-units";
import { api } from "@/lib/client-api";
import { parseNonNegativeBigInteger } from "@/lib/numeric-input";
import { getShippingSettings, saveShippingSettings } from "@/lib/shipping-areas";

vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));
vi.mock("@/lib/administrative-units", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/administrative-units")>()),
  getAdministrativeProvinces: vi.fn(),
  getAdministrativeWards: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const provinces = [
  { code: "79", name: "Hồ Chí Minh" },
  { code: "66", name: "Đắk Lắk" },
];
const wards = [
  { code: "22065", name: "Xã An Phú" },
  { code: "22045", name: "Phường Bình Minh" },
  { code: "22015", name: "Phường Tuy Hoà" },
];
const settings = {
  province_code: "66",
  province_name_vi: "Tỉnh Đắk Lắk",
  province_name_en: "Dak Lak Province",
  default_shipping_fee_vnd: "30000",
  is_active: true,
  overrides: [
    {
      id: "24803641-2dce-4cac-8fc4-91e55f03e95f",
      province_code: "66",
      province_name_vi: "Tỉnh Đắk Lắk",
      province_name_en: "Dak Lak Province",
      ward_code: "22015",
      ward_name_vi: "Phường Tuy Hoà",
      ward_name_en: "Tuy Hoa Ward",
      shipping_fee_vnd: "20000",
      is_active: true,
      created_at: "2026-10-28T00:00:00Z",
      updated_at: "2026-10-28T00:00:00Z",
    },
  ],
};

function show(locale: "vi" | "en" = "vi") {
  render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>
        <ShippingAreaManager />
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

function mockLoadedSettings(value = settings) {
  vi.mocked(getAdministrativeProvinces).mockResolvedValue(provinces);
  vi.mocked(getAdministrativeWards).mockResolvedValue(wards);
  vi.mocked(api).mockImplementation((path) =>
    path === "admin/shipping-settings/66" ? Promise.resolve(value) : Promise.resolve([]),
  );
}

describe("shipping settings contracts", () => {
  it("accepts zero delivery fee and rejects invalid values", () => {
    expect(parseNonNegativeBigInteger("0")).toEqual({ value: 0n });
    expect(parseNonNegativeBigInteger("30000")).toEqual({ value: 30000n });
    expect(parseNonNegativeBigInteger("-1")).toEqual({ error: "non_negative_integer" });
    expect(parseNonNegativeBigInteger("1.5")).toEqual({ error: "non_negative_integer" });
    expect(parseNonNegativeBigInteger("")).toEqual({ error: "required" });
  });

  it("uses the province shipping-settings endpoint", async () => {
    vi.mocked(api).mockResolvedValue(settings);
    await getShippingSettings("66");
    await saveShippingSettings("66", {
      default_shipping_fee_vnd: "30000",
      is_active: true,
      overrides: [{ ward_code: "22015", shipping_fee_vnd: null, is_active: false }],
    });

    expect(api).toHaveBeenNthCalledWith(1, "admin/shipping-settings/66");
    expect(api).toHaveBeenNthCalledWith(2, "admin/shipping-settings/66", {
      method: "PUT",
      body: JSON.stringify({
        default_shipping_fee_vnd: "30000",
        is_active: true,
        overrides: [{ ward_code: "22015", shipping_fee_vnd: null, is_active: false }],
      }),
    });
  });
});

describe("shipping area tree", () => {
  it("renders a compact A-Z province tree and lazy-loads one expanded node", async () => {
    mockLoadedSettings();
    show();

    const tree = await screen.findByRole("tree", { name: "Khu vực giao hàng" });
    const provinceButtons = within(tree).getAllByRole("button");
    expect(provinceButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Mở Đắk Lắk",
      "Mở Hồ Chí Minh",
    ]);
    expect(provinceButtons[0].querySelector("svg")).toHaveClass("shipping-tree-chevron");
    expect(getAdministrativeWards).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mở Đắk Lắk" }));

    const group = await screen.findByRole("group", { name: "Đắk Lắk" });
    expect(getAdministrativeWards).toHaveBeenCalledWith("66", "vi", expect.any(AbortSignal));
    expect(screen.getByRole("checkbox", { name: "Áp dụng mặc định toàn tỉnh" })).toBeVisible();
    expect(
      within(group)
        .getAllByRole("checkbox")
        .map((input) => input.getAttribute("aria-label")),
    ).toEqual(["Hỗ trợ Phường Bình Minh", "Hỗ trợ Phường Tuy Hoà", "Hỗ trợ Xã An Phú"]);
    expect(group.querySelector(".shipping-ward-tree > .shipping-ward-list")).not.toBeNull();
  });

  it("saves inherited, excluded, and custom ward fees", async () => {
    mockLoadedSettings();
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Mở Đắk Lắk" }));

    const inherited = await screen.findByRole("treeitem", { name: /Phường Bình Minh/ });
    expect(within(inherited).getByRole("checkbox")).toBeChecked();
    expect(within(inherited).getByRole("textbox")).toHaveValue("");
    expect(within(inherited).getByRole("textbox")).toHaveAttribute("placeholder", "30000");
    fireEvent.click(within(inherited).getByRole("checkbox"));

    const custom = screen.getByRole("treeitem", { name: /Phường Tuy Hoà/ });
    fireEvent.change(within(custom).getByRole("textbox"), { target: { value: "25000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cấu hình" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("admin/shipping-settings/66", {
        method: "PUT",
        body: JSON.stringify({
          default_shipping_fee_vnd: "30000",
          is_active: true,
          overrides: [
            { ward_code: "22045", shipping_fee_vnd: null, is_active: false },
            { ward_code: "22015", shipping_fee_vnd: "25000", is_active: true },
          ],
        }),
      }),
    );
  });

  it("disables fee inputs until their support checkbox is enabled", async () => {
    mockLoadedSettings({ ...settings, is_active: false, overrides: [] });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Mở Đắk Lắk" }));

    const group = await screen.findByRole("group", { name: "Đắk Lắk" });
    const defaultToggle = screen.getByRole("checkbox", {
      name: "Áp dụng mặc định toàn tỉnh",
    });
    const defaultFee = screen.getByRole("textbox", { name: "Giá mặc định" });
    expect(defaultFee).toHaveClass("nfv-control");
    expect(defaultFee).toBeDisabled();

    const ward = within(group).getByRole("treeitem", { name: /Phường Bình Minh/ });
    const wardFee = within(ward).getByRole("textbox");
    expect(wardFee).toBeDisabled();
    fireEvent.click(within(ward).getByRole("checkbox"));
    expect(wardFee).toBeEnabled();

    fireEvent.click(defaultToggle);
    expect(defaultFee).toBeEnabled();
    expect(screen.getByRole("button", { name: "Lưu cấu hình" })).toHaveClass(
      "nfv-button",
      "btn-small",
    );
  });

  it("does not apply a completed save to a different province opened while saving", async () => {
    let resolveSave: (value: typeof settings) => void = () => undefined;
    const pendingSave = new Promise<typeof settings>((resolve) => {
      resolveSave = resolve;
    });
    const hcmSettings = {
      ...settings,
      province_code: "79",
      province_name_vi: "Thành phố Hồ Chí Minh",
      province_name_en: "Ho Chi Minh City",
      default_shipping_fee_vnd: "45000",
      overrides: [],
    };
    vi.mocked(getAdministrativeProvinces).mockResolvedValue(provinces);
    vi.mocked(getAdministrativeWards).mockResolvedValue(wards);
    vi.mocked(api).mockImplementation((path, options) => {
      if (path === "admin/shipping-settings/66" && options?.method === "PUT") {
        return pendingSave;
      }
      if (path === "admin/shipping-settings/66") return Promise.resolve(settings);
      if (path === "admin/shipping-settings/79") return Promise.resolve(hcmSettings);
      return Promise.resolve([]);
    });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Mở Đắk Lắk" }));
    await screen.findByDisplayValue("30000");
    fireEvent.click(screen.getByRole("button", { name: "Lưu cấu hình" }));
    fireEvent.click(screen.getByRole("button", { name: "Mở Hồ Chí Minh" }));
    expect(await screen.findByDisplayValue("45000")).toBeVisible();

    await act(async () => resolveSave(settings));

    expect(screen.getByDisplayValue("45000")).toBeVisible();
    expect(screen.queryByDisplayValue("30000")).not.toBeInTheDocument();
  });
});
