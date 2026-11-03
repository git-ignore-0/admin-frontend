import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSACouponEditor } from "@/components/csa-coupon-editor";
import { CSACouponList } from "@/components/csa-coupon-list";
import { api, apiEnvelope } from "@/lib/client-api";
import { adminDictionaries } from "@/lib/admin-i18n";
import { couponErrorMessage } from "@/lib/csa-coupons";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const saved = {
  id: "voucher",
  code: "WELCOME",
  application_scope: "both",
  discount_type: "fixed",
  discount_value: "30000.00",
  maximum_discount_amount: null,
  minimum_amount: null,
  usage_limit: 10,
  used_count: 0,
  starts_at: "2026-11-01T00:00:00+07:00",
  expires_at: "2026-12-01T00:00:00+07:00",
  is_active: true,
  status: "active",
  package_ids: ["package"],
  price_option_ids: ["option"],
  payment_types: ["installment"],
  installment_counts: [2],
  scope: {
    packages: [{ id: "package", name: "Vegetable CSA" }],
    price_options: [],
    payment_types: ["installment"],
    installment_counts: [2],
  },
  created_at: "",
  updated_at: "",
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function editor(id?: string, item = saved) {
  vi.mocked(api).mockResolvedValue(item);
  render(
    <AdminI18nProvider initialLocale="en">
      <CSACouponEditor couponId={id} />
    </AdminI18nProvider>,
  );
}
function fill() {
  fireEvent.change(screen.getByLabelText("Coupon code *"), { target: { value: "NEW30" } });
  fireEvent.change(screen.getByLabelText("Discount value *"), { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText("Starts on *"), { target: { value: "2026-11-03T00:00" } });
  fireEvent.change(screen.getByLabelText("Ends on *"), { target: { value: "2026-12-01T00:00" } });
}
it.each(["csa", "store", "both"])(
  "creates %s scope with basic fields and unrestricted CSA conditions",
  async (scope) => {
    editor();
    await screen.findByLabelText("Application scope *");
    fill();
    fireEvent.change(screen.getByLabelText("Application scope *"), { target: { value: scope } });
    expect(screen.queryByText("CSA conditions")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Voucher preview" })).toBeNull();
    expect(api).not.toHaveBeenCalledWith("admin/vouchers/options");
    fireEvent.click(screen.getByRole("button", { name: "Save coupon" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/vouchers",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === "admin/vouchers" && init?.method === "POST");
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.application_scope).toBe(scope);
    if (scope === "store") {
      for (const field of [
        "package_ids",
        "price_option_ids",
        "payment_types",
        "installment_counts",
      ])
        expect(body).not.toHaveProperty(field);
    } else
      expect(body).toMatchObject({
        package_ids: [],
        price_option_ids: [],
        payment_types: [],
        installment_counts: [],
      });
  },
);
it("does not infer editable economics from a zero current usage count", async () => {
  editor("voucher");
  await screen.findByDisplayValue("WELCOME");
  expect(screen.getByLabelText("Application scope *")).toBeDisabled();
  expect(screen.getByLabelText("Coupon code *")).toHaveAttribute("readonly");
  expect(screen.getByText(/does not expose whether this voucher has ever been used/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Maximum uses *"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "admin/vouchers/voucher",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ usage_limit: 12 }) }),
    ),
  );
});
it("renders all scopes, treats old responses as CSA and filters via backend", async () => {
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [
      saved,
      { ...saved, id: "store", code: "STORE", application_scope: "store" },
      { ...saved, id: "old", code: "OLD", application_scope: undefined },
    ],
    meta: { page: 1, page_size: 30, total: 3 },
  });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSACouponList />
    </AdminI18nProvider>,
  );
  await screen.findByText("WELCOME");
  expect(screen.getByRole("cell", { name: /Both/ })).toBeVisible();
  expect(screen.getByRole("cell", { name: "Store orders" })).toBeVisible();
  expect(screen.getByRole("cell", { name: /CSA packages/ })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Filter application scope"), {
    target: { value: "both" },
  });
  await waitFor(() =>
    expect(vi.mocked(apiEnvelope).mock.lastCall?.[0]).toContain("application_scope=both"),
  );
  expect(vi.mocked(apiEnvelope).mock.lastCall?.[0]).toMatch(/^admin\/vouchers\?/);
});

it("keeps creation simple when switching application scopes", async () => {
  editor();
  await screen.findByLabelText("Coupon code *");
  for (const scope of ["both", "store", "csa"]) {
    fireEvent.change(screen.getByLabelText("Application scope *"), { target: { value: scope } });
    expect(screen.queryByText("CSA conditions")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Voucher preview" })).toBeNull();
  }
  expect(api).not.toHaveBeenCalled();
});

it("activates through the shared API and keeps backend permission errors visible", async () => {
  editor("voucher", { ...saved, is_active: false, status: "inactive" });
  await screen.findByDisplayValue("WELCOME");
  vi.mocked(api).mockRejectedValueOnce(new Error("forbidden"));
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(adminDictionaries.en.common.forbidden);
  expect(api).toHaveBeenCalledWith(
    "admin/vouchers/voucher/activate",
    expect.objectContaining({ method: "POST", body: "{}" }),
  );
});

it.each(["vi", "en"] as const)(
  "localizes voucher, Store, permission and session errors in %s",
  (locale) => {
    const t = adminDictionaries[locale];
    for (const [code, message] of Object.entries(t.csaCoupons.errors)) {
      expect(couponErrorMessage(new Error(code), t)).toBe(message);
    }
    expect(couponErrorMessage(new Error("forbidden"), t)).toBe(t.common.forbidden);
    expect(couponErrorMessage(new Error("upstream_timeout"), t)).toBe(t.common.networkError);
    expect(couponErrorMessage(new Error("__proto__"), t)).toBe(t.common.requestFailed);
    expect(couponErrorMessage(new Error("Unknown stack trace or secret"), t)).toBe(
      t.common.requestFailed,
    );
  },
);

it.each(["csa", "store", "both"] as const)(
  "edits a saved %s voucher without CSA conditions or preview",
  async (application_scope) => {
    editor("voucher", { ...saved, application_scope });
    await screen.findByDisplayValue("WELCOME");
    expect(screen.queryByText("CSA conditions")).toBeNull();
    expect(screen.queryByLabelText("Vegetable CSA")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Voucher preview" })).toBeNull();
    expect(api).not.toHaveBeenCalledWith("admin/vouchers/options");
    fireEvent.change(screen.getByLabelText("Maximum uses *"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/vouchers/voucher",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ usage_limit: 12 }) }),
      ),
    );
  },
);
