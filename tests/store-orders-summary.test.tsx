import { cleanup, render, screen } from "@testing-library/react";
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
