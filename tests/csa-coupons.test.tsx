import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSACouponEditor } from "@/components/csa-coupon-editor";
import { CSACouponList } from "@/components/csa-coupon-list";
import { api, apiEnvelope } from "@/lib/client-api";
import {
  couponDateInput,
  couponDateTimeInput,
  couponDateTimeToApi,
  couponTimeInput,
  type AdminCoupon,
  type CouponOptions,
} from "@/lib/csa-coupons";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/csa-coupons",
}));

const options: CouponOptions = [
  {
    id: "24803641-2dce-4cac-8fc4-91e55f03e95f",
    name: "Vegetable CSA",
    price_options: [
      {
        id: "d0c0313a-85df-4c29-930a-f19a05f3d8c4",
        duration_months: 1,
        payment_plans: [
          {
            id: "e0c0313a-85df-4c29-930a-f19a05f3d8c4",
            name: "One month full",
            payment_type: "full",
            installment_count: 1,
          },
        ],
      },
      {
        id: "a0c0313a-85df-4c29-930a-f19a05f3d8c4",
        duration_months: 6,
        payment_plans: [
          {
            id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
            name: "Pay in full",
            payment_type: "full",
            installment_count: 1,
          },
          {
            id: "c0c0313a-85df-4c29-930a-f19a05f3d8c4",
            name: "Pay twice",
            payment_type: "installment",
            installment_count: 2,
          },
        ],
      },
    ],
  },
  {
    id: "f4803641-2dce-4cac-8fc4-91e55f03e95f",
    name: "Fruit CSA",
    price_options: [
      {
        id: "f0c0313a-85df-4c29-930a-f19a05f3d8c4",
        duration_months: 3,
        payment_plans: [
          {
            id: "f1c0313a-85df-4c29-930a-f19a05f3d8c4",
            name: "Pay three times",
            payment_type: "installment",
            installment_count: 3,
          },
        ],
      },
    ],
  },
];

const coupon: AdminCoupon = {
  id: "34803641-2dce-4cac-8fc4-91e55f03e95f",
  code: "TETTRUNGTHU2026",
  discount_type: "fixed",
  discount_value: "600000.00",
  maximum_discount_amount: null,
  usage_limit: 100,
  used_count: 0,
  starts_at: "2026-09-01T00:00:00+07:00",
  expires_at: "2026-10-01T00:00:00+07:00",
  is_active: true,
  status: "active",
  package_ids: [options[0].id],
  price_option_ids: [options[0].price_options[1].id],
  payment_types: ["installment"],
  installment_counts: [2],
  minimum_amount: null,
  scope: {
    packages: [{ id: options[0].id, name: options[0].name }],
    price_options: [
      { id: options[0].price_options[1].id, package_id: options[0].id, duration_months: 6 },
    ],
    payment_types: ["installment"],
    installment_counts: [2],
  },
  created_at: "2026-08-20T00:00:00+07:00",
  updated_at: "2026-08-20T00:00:00+07:00",
};

function showEditor(id?: string) {
  render(
    <AdminI18nProvider initialLocale="en">
      <CSACouponEditor couponId={id} />
    </AdminI18nProvider>,
  );
}

function mockEditorApi(item: AdminCoupon = coupon) {
  vi.mocked(api).mockResolvedValue(item);
}

function chooseCouponDateTime(label: string, value: string) {
  const input = screen.getByLabelText(label);
  expect(input).toHaveAttribute("type", "datetime-local");
  fireEvent.change(input, { target: { value } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CSA coupon administration", () => {
  it("keeps coupon list filters and compact editor styles", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [coupon],
      meta: { page: 1, page_size: 20, total: 1, pages: 1 },
    });
    render(
      <AdminI18nProvider initialLocale="en">
        <CSACouponList />
      </AdminI18nProvider>,
    );
    expect(await screen.findByText(coupon.code)).toBeVisible();
    expect(screen.getByText("01/09/2026 – 30/09/2026")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Filter status"), { target: { value: "inactive" } });
    await waitFor(() =>
      expect(vi.mocked(apiEnvelope).mock.lastCall?.[0]).toContain("status=inactive"),
    );
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toContain(".csa-coupon-editor");
    expect(css).toMatch(/\.csa-coupon-offer-rows\s*\{[^}]*display:\s*grid;[^}]*gap:\s*14px;/u);
    expect(css).toMatch(
      /\.csa-coupon-form-row\s*\{[^}]*grid-template-columns:\s*minmax\(220px, 260px\) minmax\(0, 1fr\);/u,
    );
    expect(css).not.toContain(".csa-coupon-section");
    expect(css).not.toContain(".csa-coupon-offer-fields");
    expect(css).not.toContain(".csa-coupon-preview");
    expect(css).not.toContain(".csa-coupon-summary");
    expect(css).not.toContain(".csa-coupon-specific-scope");
    expect(css).toContain('.csa-coupon-date-grid .input[type="datetime-local"]');
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.csa-coupon-date-grid/u);
  });

  it("renders a flat field form with a discount dropdown and no preview", async () => {
    mockEditorApi();
    showEditor();
    expect(await screen.findByRole("heading", { name: "Create CSA discount code" })).toBeVisible();
    expect(document.querySelectorAll(".csa-coupon-form-row")).toHaveLength(6);
    expect(document.querySelector("section.csa-coupon-section")).toBeNull();
    expect(screen.queryByText("Codes are saved in uppercase.")).toBeNull();
    expect(
      screen.queryByText("Changing the discount type clears this value to avoid mixing units."),
    ).toBeNull();
    expect(screen.queryByText("Coupons can be used once by default.")).toBeNull();
    const type = screen.getByRole("combobox", { name: "Discount type *" });
    expect(type).toHaveValue("percent");
    expect(screen.getByLabelText("Maximum discount")).toBeVisible();
    expect(screen.getByLabelText("Maximum uses *")).toHaveValue("1");
    expect(screen.getByLabelText("Starts on *")).toHaveAttribute("type", "datetime-local");
    expect(screen.getByLabelText("Ends on *")).toHaveAttribute("type", "datetime-local");
    expect(document.querySelectorAll('input[type="datetime-local"]')).toHaveLength(2);
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Save coupon" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Applies to" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByLabelText("Choose CSA packages *")).toBeNull();
    expect(screen.queryByText("Price preview")).toBeNull();
    expect(document.querySelectorAll("form.csa-coupon-form")).toHaveLength(1);
    expect(api).not.toHaveBeenCalledWith("admin/csa-coupons/options");
  });

  it("enables saving only for a complete valid date-time range", async () => {
    mockEditorApi();
    showEditor();
    await screen.findByLabelText("Coupon code *");
    fireEvent.change(screen.getByLabelText("Coupon code *"), { target: { value: "AUTUMN" } });
    fireEvent.change(screen.getByLabelText("Discount value *"), { target: { value: "10" } });
    chooseCouponDateTime("Starts on *", "2026-09-30T10:00");
    expect(screen.getByLabelText("Ends on *")).toHaveAttribute("min", "2026-09-30T10:00");
    chooseCouponDateTime("Ends on *", "2026-09-29T23:59");
    expect(screen.getByText("The end date cannot be before the start date.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save coupon" })).toBeDisabled();

    chooseCouponDateTime("Ends on *", "2026-09-30T11:00");
    expect(screen.queryByText("The end date cannot be before the start date.")).toBeNull();
    expect(screen.getByRole("button", { name: "Save coupon" })).toBeEnabled();
    chooseCouponDateTime("Ends on *", "2026-09-30T10:00");
    expect(screen.getByText("The end time must follow the start time.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save coupon" })).toBeDisabled();
    chooseCouponDateTime("Ends on *", "2026-09-30T10:01");
    expect(screen.getByRole("button", { name: "Save coupon" })).toBeEnabled();
  });

  it("shows and saves an optional maximum discount only for percentage coupons", async () => {
    mockEditorApi();
    showEditor();
    await screen.findByLabelText("Coupon code *");
    const cap = screen.getByLabelText("Maximum discount");
    fireEvent.focus(cap);
    fireEvent.change(cap, { target: { value: "250000" } });
    expect(cap).toHaveValue("250000");
    fireEvent.change(screen.getByLabelText("Coupon code *"), { target: { value: "SPRING" } });
    fireEvent.change(screen.getByLabelText("Discount value *"), { target: { value: "10" } });
    chooseCouponDateTime("Starts on *", "2026-09-01T00:00");
    chooseCouponDateTime("Ends on *", "2026-09-30T23:59");
    fireEvent.click(screen.getByRole("button", { name: "Save coupon" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("admin/csa-coupons", expect.anything()));
    const createCall = vi.mocked(api).mock.calls.find(([path]) => path === "admin/csa-coupons");
    expect(JSON.parse(String(createCall?.[1]?.body)).maximum_discount_amount).toBe("250000");
  });

  it("clears value on type change, formats money, and rejects letters or integer decimals", async () => {
    mockEditorApi();
    showEditor();
    const type = await screen.findByRole("combobox", { name: "Discount type *" });
    const value = screen.getByLabelText("Discount value *");
    const limit = screen.getByLabelText("Maximum uses *");
    const minimum = screen.getByLabelText("Minimum order amount");
    fireEvent.change(value, { target: { value: "12.5" } });
    expect(value).toHaveValue("12.5");
    const cap = screen.getByLabelText("Maximum discount");
    fireEvent.change(cap, { target: { value: "200000" } });
    fireEvent.change(type, { target: { value: "fixed" } });
    expect(value).toHaveValue("");
    expect(value.parentElement).toHaveTextContent("₫");
    expect(screen.queryByLabelText("Maximum discount")).toBeNull();
    fireEvent.focus(value);
    fireEvent.change(value, { target: { value: "1000000" } });
    expect(value).toHaveValue("1000000");
    fireEvent.change(value, { target: { value: "1000000e3" } });
    expect(value).toHaveValue("1000000");
    fireEvent.change(value, { target: { value: "1000000.5" } });
    expect(value).toHaveValue("1000000");
    fireEvent.blur(value);
    expect(value).toHaveValue("1,000,000");
    fireEvent.focus(value);
    expect(value).toHaveValue("1000000");
    fireEvent.change(limit, { target: { value: "2.5" } });
    expect(limit).toHaveValue("1");
    fireEvent.change(minimum, { target: { value: "25abc" } });
    expect(minimum).toHaveValue("");
    expect(fireEvent.keyDown(limit, { key: "e" })).toBe(false);
    expect(fireEvent.keyDown(value, { key: "-" })).toBe(false);
  });

  it("keeps the full percentage input visible, marks values above 100 invalid, and allows editing them", async () => {
    mockEditorApi();
    showEditor();
    const value = await screen.findByLabelText("Discount value *");

    fireEvent.change(value, { target: { value: "1223" } });
    expect(value).toHaveValue("1223");
    expect(value).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Invalid discount value.")).toBeVisible();
    expect(fireEvent.keyDown(value, { key: "a" })).toBe(false);
    fireEvent.change(value, { target: { value: "12a23" } });
    expect(value).toHaveValue("1223");
    fireEvent.change(value, { target: { value: "122" } });
    expect(value).toHaveValue("122");
    fireEvent.change(value, { target: { value: "12" } });
    expect(value).toHaveValue("12");
    expect(value).toHaveAttribute("aria-invalid", "false");

    fireEvent.change(value, { target: { value: "100" } });
    expect(value).toHaveValue("100");
    fireEvent.change(value, { target: { value: "100.01" } });
    expect(value).toHaveValue("100.01");
    expect(value).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(value, { target: { value: "99.99" } });
    expect(value).toHaveValue("99.99");
    expect(value).toHaveAttribute("aria-invalid", "false");
  });

  it("validates date and time and creates with the backend default scope", async () => {
    mockEditorApi();
    showEditor();
    await screen.findByLabelText("Coupon code *");
    fireEvent.change(screen.getByLabelText("Coupon code *"), { target: { value: "autumn" } });
    fireEvent.change(screen.getByLabelText("Discount value *"), { target: { value: "10" } });
    chooseCouponDateTime("Starts on *", "2026-09-30T10:00");
    chooseCouponDateTime("Ends on *", "2026-09-30T09:00");
    fireEvent.click(screen.getByRole("button", { name: "Save coupon" }));
    expect(screen.getByText("The end time must follow the start time.")).toBeVisible();
    chooseCouponDateTime("Ends on *", "2026-09-30T11:30");
    fireEvent.click(screen.getByRole("button", { name: "Save coupon" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/csa-coupons",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = vi.mocked(api).mock.calls.find(([path]) => path === "admin/csa-coupons");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      code: "AUTUMN",
      starts_at: "2026-09-30T10:00:00+07:00",
      expires_at: "2026-09-30T11:30:00+07:00",
    });
    expect(couponDateInput(coupon.expires_at, { end: true })).toBe("30/09/2026");
    expect(couponTimeInput(coupon.expires_at, { end: true })).toBe("23:59");
    expect(couponDateTimeInput(coupon.expires_at, { end: true })).toBe("2026-09-30T23:59");
    expect(couponDateTimeToApi("2026-09-01T09:30")).toBe("2026-09-01T09:30:00+07:00");
    expect(vi.mocked(api).mock.calls.some(([path]) => path === "admin/csa-coupons/preview")).toBe(
      false,
    );
  });

  it("keeps a restricted coupon scope when saving another field", async () => {
    mockEditorApi();
    showEditor(coupon.id);
    await screen.findByDisplayValue(coupon.code);
    expect(screen.queryByRole("heading", { name: "Applies to" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.change(screen.getByLabelText("Maximum uses *"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/csa-coupons/${coupon.id}`,
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const call = vi
      .mocked(api)
      .mock.calls.find(
        ([path, init]) => path === `admin/csa-coupons/${coupon.id}` && init?.method === "PATCH",
      );
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.usage_limit).toBe(101);
    for (const key of ["package_ids", "price_option_ids", "payment_types", "installment_counts"])
      expect(body).not.toHaveProperty(key);
    expect(screen.getByDisplayValue(coupon.code)).toBeVisible();
    expect(api).not.toHaveBeenCalledWith("admin/csa-coupons/options");
  });

  it("sends plain integer money values without overriding backend scope defaults", async () => {
    mockEditorApi();
    showEditor();
    await screen.findByLabelText("Coupon code *");
    fireEvent.change(screen.getByLabelText("Coupon code *"), { target: { value: "  autumn  " } });
    fireEvent.change(screen.getByLabelText("Discount type *"), { target: { value: "fixed" } });
    const value = screen.getByLabelText("Discount value *");
    fireEvent.change(value, { target: { value: "1000000" } });
    fireEvent.change(screen.getByLabelText("Minimum order amount"), {
      target: { value: "2500000" },
    });
    chooseCouponDateTime("Starts on *", "2026-09-01T00:00");
    chooseCouponDateTime("Ends on *", "2026-09-30T23:59");
    fireEvent.click(screen.getByRole("button", { name: "Save coupon" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("admin/csa-coupons", expect.anything()));
    const call = vi.mocked(api).mock.calls.find(([path]) => path === "admin/csa-coupons");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      code: "AUTUMN",
      discount_type: "fixed",
      discount_value: "1000000",
      minimum_amount: "2500000",
      usage_limit: 1,
    });
    const body = JSON.parse(String(call?.[1]?.body));
    for (const key of ["package_ids", "price_option_ids", "payment_types", "installment_counts"])
      expect(body).not.toHaveProperty(key);
  });

  it("rejects a percentage above 100 before sending a create request", async () => {
    mockEditorApi();
    showEditor();
    await screen.findByLabelText("Coupon code *");
    fireEvent.change(screen.getByLabelText("Coupon code *"), { target: { value: "AUTUMN" } });
    fireEvent.change(screen.getByLabelText("Discount value *"), { target: { value: "100.01" } });
    chooseCouponDateTime("Starts on *", "2026-09-01T00:00");
    chooseCouponDateTime("Ends on *", "2026-09-30T23:59");
    fireEvent.click(screen.getByRole("button", { name: "Save coupon" }));
    expect(screen.getByText("Invalid discount value.")).toBeVisible();
    expect(api).not.toHaveBeenCalledWith("admin/csa-coupons", expect.anything());
  });

  it("preserves existing timestamps when saving another field", async () => {
    mockEditorApi();
    showEditor(coupon.id);
    await screen.findByLabelText("Coupon code *");
    fireEvent.change(screen.getByLabelText("Maximum uses *"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/csa-coupons/${coupon.id}`,
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const call = vi
      .mocked(api)
      .mock.calls.find(
        ([path, init]) => path === `admin/csa-coupons/${coupon.id}` && init?.method === "PATCH",
      );
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      starts_at: coupon.starts_at,
      expires_at: coupon.expires_at,
    });
  });

  it("keeps used coupon history read only, updates only usage limit, and deactivates through a dialog", async () => {
    mockEditorApi({ ...coupon, used_count: 2 });
    showEditor(coupon.id);
    const code = await screen.findByLabelText("Coupon code *");
    expect(code).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Discount value *")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Maximum uses *"), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(
      screen.getByText("The usage limit cannot be lower than the number already used."),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Maximum uses *"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/csa-coupons/${coupon.id}`,
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ usage_limit: 3 }) }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/csa-coupons/${coupon.id}/deactivate`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("localizes conflicts and retries reload without a duplicate create", async () => {
    let detailCalls = 0;
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "admin/csa-coupons") return coupon;
      if (path === `admin/csa-coupons/${coupon.id}`) {
        detailCalls += 1;
        if (detailCalls === 1) throw new Error("network_error");
        return coupon;
      }
      throw new Error("coupon_duplicate_code");
    });
    showEditor();
    await screen.findByLabelText("Coupon code *");
    fireEvent.change(screen.getByLabelText("Coupon code *"), { target: { value: "autumn" } });
    fireEvent.change(screen.getByLabelText("Discount value *"), { target: { value: "10" } });
    chooseCouponDateTime("Starts on *", "2026-09-01T00:00");
    chooseCouponDateTime("Ends on *", "2026-09-30T23:59");
    fireEvent.click(screen.getByRole("button", { name: "Save coupon" }));
    expect(await screen.findByText(/Saved, but the latest data/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save coupon" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry reload" }));
    await waitFor(() => expect(detailCalls).toBe(2));
    expect(vi.mocked(api).mock.calls.filter(([path]) => path === "admin/csa-coupons")).toHaveLength(
      1,
    );
  });
});
