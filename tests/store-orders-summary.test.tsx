import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { StoreOrderTotals, StoreRecipientSummary } from "@/components/store-order-summary";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";
import { storeOrderFixture } from "@/tests/store-orders-fixture";

vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSummary(locale: "vi" | "en", reason: string | null = null) {
  const order = storeOrderFixture({ shipping_discount_reason: reason });
  render(
    <AdminI18nProvider initialLocale={locale}>
      <StoreRecipientSummary order={order} />
      <StoreOrderTotals order={order} />
    </AdminI18nProvider>,
  );
}

describe("Store order localized summaries", () => {
  it("uses localized administrative names and requests them in the active locale", () => {
    vi.mocked(useAdministrativeUnitNames).mockReturnValue({
      provinceName: "Thành phố Hồ Chí Minh",
      wardName: "Phường Bến Nghé",
    });
    renderSummary("vi");

    expect(useAdministrativeUnitNames).toHaveBeenCalledWith("79", "26734", "vi");
    expect(
      screen.getByText("1 Đường Vườn · Phường Bến Nghé · Thành phố Hồ Chí Minh"),
    ).toBeVisible();
  });

  it("falls back to codes when administrative names cannot be resolved", () => {
    vi.mocked(useAdministrativeUnitNames).mockReturnValue({
      provinceName: null,
      wardName: null,
    });
    renderSummary("en");

    expect(useAdministrativeUnitNames).toHaveBeenCalledWith("79", "26734", "en");
    expect(screen.getByText("1 Đường Vườn · 26734 · 79")).toBeVisible();
  });

  it("shows goods, shipping and a negative CSA deduction without duplicate cash subtotals", () => {
    const base = storeOrderFixture();
    const order = {
      ...base,
      lines: [{ ...base.lines[0], quota_quantity: 2 }],
      subtotal_vnd: "30000",
      total_vnd: "45000",
    };
    render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderTotals order={order} />
      </AdminI18nProvider>,
    );
    expect(screen.getByText("Tiền hàng")).toBeVisible();
    expect(screen.getByText("Điểm CSA")).toBeVisible();
    expect(screen.getByText(/−60.000/)).toBeVisible();
    expect(screen.queryByText("Tạm tính tiền mặt")).not.toBeInTheDocument();
    expect(screen.getByText(/45.000/)).toBeVisible();
  });

  it("omits CSA deductions when no points are used", () => {
    render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderTotals order={storeOrderFixture()} />
      </AdminI18nProvider>,
    );
    expect(screen.queryByText("Điểm CSA")).not.toBeInTheDocument();
  });
});

describe("Store voucher snapshot totals", () => {
  function renderTotals(order: ReturnType<typeof storeOrderFixture>, locale: "vi" | "en" = "vi") {
    render(
      <AdminI18nProvider initialLocale={locale}>
        <StoreOrderTotals order={order} />
      </AdminI18nProvider>,
    );
  }

  function row(label: string) {
    return within(screen.getByText(label).parentElement!);
  }

  it("shows the saved voucher and cash subtotal before discount alongside quota-inclusive goods", () => {
    const base = storeOrderFixture();
    renderTotals({
      ...base,
      lines: [
        { ...base.lines[0], quota_quantity: 2, cash_quantity: 1, cash_subtotal_vnd: "30000" },
      ],
      subtotal_vnd: "30000",
      coupon: { code: "SAVED20" },
      discount_amount_vnd: "20000",
      total_vnd: "25000",
    });

    expect(row("Tiền hàng").getByText(/90.000/)).toBeVisible();
    expect(row("Điểm CSA").getByText(/−60.000/)).toBeVisible();
    expect(row("Tiền mặt trước giảm giá").getByText(/30.000/)).toBeVisible();
    expect(row("Mã voucher").getByText("SAVED20")).toBeVisible();
    expect(row("Giảm giá voucher").getByText(/−20.000/)).toBeVisible();
    expect(row("Phí giao hàng").getByText(/15.000/)).toBeVisible();
    expect(row("Tổng phải trả").getByText(/25.000/)).toBeVisible();
  });

  it("uses exact API amounts and English labels for a fully discounted zero-total order", () => {
    const base = storeOrderFixture();
    renderTotals(
      {
        ...base,
        subtotal_vnd: "9007199254740993",
        coupon: { code: "OLD-FULL" },
        discount_amount_vnd: "9007199254740993",
        shipping_fee_vnd: "0",
        total_vnd: "0",
      },
      "en",
    );

    expect(row("Cash subtotal before discount").getByText(/9,007,199,254,740,993/)).toBeVisible();
    expect(row("Voucher code").getByText("OLD-FULL")).toBeVisible();
    expect(row("Voucher discount").getByText(/−.*9,007,199,254,740,993/)).toBeVisible();
    expect(row("Amount due").getByText(/₫0/)).toBeVisible();
  });

  it.each([undefined, null, {}])("omits voucher rows for a no-voucher snapshot %s", (coupon) => {
    renderTotals({ ...storeOrderFixture(), coupon, discount_amount_vnd: "0" });
    expect(screen.queryByText("Mã voucher")).not.toBeInTheDocument();
    expect(screen.queryByText("Giảm giá voucher")).not.toBeInTheDocument();
    expect(row("Tổng phải trả").getByText(/105.000/)).toBeVisible();
  });
});
