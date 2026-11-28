import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "@/tests/deferred";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { CSAOrderPanel } from "@/components/csa-order-panel";
import { StoreOrderDetail } from "@/components/store-order-detail";
import { ToastProvider } from "@/components/toast-provider";
import { StoreOrderSummary } from "@/components/store-order-summary";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";
import { api } from "@/lib/client-api";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";
import { storeShippingDiscountReason } from "@/lib/store-orders-copy";
import type { StoreOrder } from "@/lib/types";
import { storeOrderFixture } from "@/tests/store-orders-fixture";

vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: vi.fn(() => ({ provinceName: null, wardName: null })),
}));
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
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
      <StoreOrderSummary order={order} />
    </AdminI18nProvider>,
  );
}

function field(label: string) {
  return within(screen.getByText(label, { selector: "dt" }).parentElement!);
}

const csaDeadline = "2026-11-19T22:00:00+07:00";
const csaRoundId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const csaSelectionId = "2aa5ab34-2dce-4cac-8fc4-91e55f03e95f";
const csaMembershipId = "38703641-2dce-4cac-8fc4-91e55f03e95f";

function csaSummaryOrder(revision = 2): StoreOrder {
  const serverTime = "2026-11-19T18:00:00+07:00";
  return storeOrderFixture({
    delivery_date: null,
    shipping_benefit: null,
    shipping_discount_reason: "csa_round",
    shipping_fee_vnd: "0",
    subtotal_vnd: "0",
    total_vnd: "0",
    payment_status: "not_required",
    payment: null,
    expires_at: null,
    server_time: serverTime,
    csa: {
      round: {
        id: csaRoundId,
        sequence: 1,
        name: "Garden CSA",
        status: "closed",
        opens_at: "2026-11-18T08:00:00+07:00",
        closes_at: serverTime,
        delivery_date: "2026-11-20",
        server_time: serverTime,
      },
      selection: {
        id: csaSelectionId,
        round_id: csaRoundId,
        membership_id: csaMembershipId,
        state: "reselecting",
        revision,
        order_id: storeOrderFixture().id,
        reopen_until: csaDeadline,
        lines: [],
        server_time: serverTime,
      },
    },
  });
}

describe("Store order localized summaries", () => {
  it("groups payment, recipient and bank details in one sidebar and preserves identifiers", () => {
    const base = storeOrderFixture();
    const address = "Đường Vườn ".repeat(20).trim();
    const transferContent = `000${"ORDER".repeat(20)}`;
    const order = storeOrderFixture({
      shipping_address: { ...base.shipping_address, address },
      delivery_date: "2026-11-20",
      payment: {
        ...base.payment!,
        bank_bin: "000436",
        account_number: "000123456789",
        transfer_content: transferContent,
      },
    });
    render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderSummary order={order} />
      </AdminI18nProvider>,
    );

    const sidebar = screen.getByRole("complementary", { name: "Thanh toán" });
    expect(sidebar).toHaveClass("mantine-Paper-root");
    expect(sidebar.querySelector(".mantine-Paper-root")).toBeNull();
    expect(
      within(sidebar)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual(["Thanh toán", "Người nhận và giao nhận", "Thông tin chuyển khoản"]);
    expect(field("Họ tên người nhận").getByText("Nguyễn An")).toBeVisible();
    expect(field("Địa chỉ").getByText(address)).toBeVisible();
    expect(field("Ngày giao").getByText("20/11/2026")).toHaveAttribute("datetime", "2026-11-20");
    expect(field("Ngân hàng").getByText("Vietcombank")).toBeVisible();
    expect(screen.queryByText("Mã BIN ngân hàng")).not.toBeInTheDocument();
    expect(screen.queryByText("000436")).not.toBeInTheDocument();
    expect(field("Số tài khoản").getByText("000123456789")).toBeVisible();
    expect(field("Chủ tài khoản").getByText("NFV")).toBeVisible();
    expect(field("Nội dung chuyển khoản").getByText(transferContent)).toBeVisible();
  });

  it("shows the order's payment status when a v2 snapshot has no bank details yet", () => {
    render(
      <AdminI18nProvider initialLocale="en">
        <StoreOrderSummary order={storeOrderFixture({ workflow_version: 2, payment: null })} />
      </AdminI18nProvider>,
    );

    expect(field("Payment status").getByText("Payment not confirmed")).toHaveClass(
      "mantine-Badge-label",
    );
    expect(
      screen.queryByRole("heading", { name: "Bank transfer details" }),
    ).not.toBeInTheDocument();
  });

  it("uses localized administrative names and requests them in the active locale", () => {
    vi.mocked(useAdministrativeUnitNames).mockReturnValue({
      provinceName: "Thành phố Hồ Chí Minh",
      wardName: "Phường Bến Nghé",
    });
    renderSummary("vi");

    expect(screen.getByRole("link", { name: "0901234567" })).toHaveAttribute(
      "href",
      "tel:+84901234567",
    );
    expect(useAdministrativeUnitNames).toHaveBeenCalledWith("79", "26734", "vi");
    expect(field("Địa chỉ").getByText("1 Đường Vườn")).toBeVisible();
    expect(field("Phường/xã").getByText("Phường Bến Nghé")).toBeVisible();
    expect(field("Tỉnh/thành phố").getByText("Thành phố Hồ Chí Minh")).toBeVisible();
  });

  it("falls back to codes when administrative names cannot be resolved", () => {
    vi.mocked(useAdministrativeUnitNames).mockReturnValue({
      provinceName: null,
      wardName: null,
    });
    renderSummary("en");

    expect(useAdministrativeUnitNames).toHaveBeenCalledWith("79", "26734", "en");
    expect(field("Address").getByText("1 Đường Vườn")).toBeVisible();
    expect(field("Ward/commune").getByText("26734")).toBeVisible();
    expect(field("Province/city").getByText("79")).toBeVisible();
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
        <StoreOrderSummary order={order} />
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
        <StoreOrderSummary order={storeOrderFixture()} />
      </AdminI18nProvider>,
    );
    expect(screen.queryByText("Điểm CSA")).not.toBeInTheDocument();
  });
});

describe("Store voucher snapshot totals", () => {
  function renderTotals(order: ReturnType<typeof storeOrderFixture>, locale: "vi" | "en" = "vi") {
    render(
      <AdminI18nProvider initialLocale={locale}>
        <StoreOrderSummary order={order} />
      </AdminI18nProvider>,
    );
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

    expect(field("Tiền hàng").getByText(/90.000/)).toBeVisible();
    expect(field("Điểm CSA").getByText(/−60.000/)).toBeVisible();
    expect(field("Tiền mặt trước giảm giá").getByText(/30.000/)).toBeVisible();
    expect(field("Mã voucher").getByText("SAVED20")).toBeVisible();
    expect(field("Giảm giá voucher").getByText(/−20.000/)).toBeVisible();
    expect(field("Phí giao hàng").getByText(/15.000/)).toBeVisible();
    expect(field("Tổng phải trả").getByText(/25.000/)).toBeVisible();
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

    expect(field("Cash subtotal before discount").getByText(/9,007,199,254,740,993/)).toBeVisible();
    expect(field("Voucher code").getByText("OLD-FULL")).toBeVisible();
    expect(field("Voucher discount").getByText(/−.*9,007,199,254,740,993/)).toBeVisible();
    expect(field("Amount due").getByText(/₫0/)).toBeVisible();
  });

  it.each([undefined, null, {}])("omits voucher rows for a no-voucher snapshot %s", (coupon) => {
    renderTotals({ ...storeOrderFixture(), coupon, discount_amount_vnd: "0" });
    expect(screen.queryByText("Mã voucher")).not.toBeInTheDocument();
    expect(screen.queryByText("Giảm giá voucher")).not.toBeInTheDocument();
    expect(field("Tổng phải trả").getByText(/105.000/)).toBeVisible();
  });
});

describe("saved delivery snapshot", () => {
  it("shows retail date and companion reason with source links from the saved snapshot", () => {
    render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderSummary
          order={storeOrderFixture({
            delivery_date: "2026-11-20",
            shipping_discount_reason: "csa_companion_delivery",
            shipping_benefit: {
              reason: "csa_companion_delivery",
              round_id: "saved-round",
              selection_id: "selection",
              csa_order_id: "saved-order",
              delivery_date: "2026-11-20",
              decided_at: "2026-11-19T08:00:00+07:00",
            },
          })}
        />
      </AdminI18nProvider>,
    );
    expect(screen.getByText("20/11/2026")).toBeVisible();
    expect(screen.getByText("Miễn phí giao kèm CSA")).toBeVisible();
    expect(screen.getByRole("link", { name: "Đợt CSA" })).toHaveAttribute(
      "href",
      "/csa-rounds/saved-round",
    );
    expect(screen.getByRole("link", { name: "Đơn CSA" })).toHaveAttribute(
      "href",
      "/store-orders/saved-order",
    );
    expect(screen.getByText(/105.000/)).toBeVisible(); // Never reprice the stored order.
  });
  it("shows a blank date for legacy retail and retains the legacy shipping reason", () => {
    render(
      <AdminI18nProvider initialLocale="en">
        <StoreOrderSummary
          order={storeOrderFixture({
            delivery_date: null,
            shipping_benefit: null,
            shipping_discount_reason: "active_csa_with_csa_product",
          })}
        />
      </AdminI18nProvider>,
    );
    expect(within(screen.getByText("Delivery date").parentElement!).getByText("—")).toBeVisible();
    expect(screen.getByText("CSA member purchasing a CSA product")).toBeVisible();
  });
  it.each([
    ["vi", "Giao hàng trong gói CSA", "Ngày giao"],
    ["en", "Delivery included in CSA", "Delivery date"],
  ] as const)(
    "localizes original CSA delivery in %s without a missing retail date",
    (locale, label, dateLabel) => {
      const csaCopy = csaRoundsCopy(locale);
      const order = csaSummaryOrder();
      render(
        <AdminI18nProvider initialLocale={locale}>
          <CSAOrderPanel order={order} disabled onReload={vi.fn()} onAccessDenied={vi.fn()} />
          <StoreOrderSummary order={order} />
        </AdminI18nProvider>,
      );
      const panel = within(screen.getByRole("region", { name: csaCopy.title }));
      expect(panel.getByText("Garden CSA")).toBeVisible();
      expect(panel.getByText(csaCopy.states.reselecting)).toHaveClass("mantine-Badge-label");
      expect(panel.getByText("20/11/2026")).toHaveAttribute("datetime", "2026-11-20");
      expect(field(csaCopy.deadline).getByText("19/11/2026 22:00")).toHaveAttribute(
        "datetime",
        csaDeadline,
      );
      expect(panel.getByRole("link", { name: csaCopy.view })).toHaveAttribute(
        "href",
        `/csa-rounds/${csaRoundId}`,
      );
      expect(panel.getByRole("link", { name: csaCopy.membership })).toHaveAttribute(
        "href",
        `/memberships/${csaMembershipId}`,
      );
      expect(panel.getByRole("button", { name: csaCopy.reopen })).toBeDisabled();
      expect(screen.getAllByText("20/11/2026")).toHaveLength(1);
      expect(screen.getByText(label)).toBeVisible();
      expect(screen.queryByText("csa_round")).not.toBeInTheDocument();
      expect(screen.queryByText(dateLabel)).not.toBeInTheDocument();
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      expect(screen.queryByText("Miễn phí giao kèm CSA")).not.toBeInTheDocument();
      expect(screen.queryByText("Free delivery with CSA")).not.toBeInTheDocument();
    },
  );
});

it("reloads the verified CSA revision after a conflict before extending the selection", async () => {
  const order = csaSummaryOrder();
  const onReload = vi.fn();
  const onAccessDenied = vi.fn();
  vi.mocked(api)
    .mockResolvedValueOnce(order)
    .mockRejectedValueOnce(Object.assign(new Error("csa_selection_stale"), { status: 409 }))
    .mockResolvedValueOnce(csaSummaryOrder(3))
    .mockResolvedValueOnce({});
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>
        <CSAOrderPanel
          order={order}
          disabled={false}
          onReload={onReload}
          onAccessDenied={onAccessDenied}
        />
      </AdminQueryProvider>
    </AdminI18nProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Reopen selection" }));
  const dialog = within(screen.getByRole("dialog"));
  const deadline = await dialog.findByLabelText("Selection deadline");
  expect(deadline).toHaveValue("2026-11-19T22:00");
  fireEvent.change(deadline, { target: { value: "2026-11-19T23:00" } });
  fireEvent.click(dialog.getByRole("button", { name: "Confirm" }));

  const refresh = await dialog.findByRole("button", { name: "Refresh" });
  expect(dialog.getByRole("button", { name: "Confirm" })).toBeDisabled();
  expect(api).toHaveBeenCalledTimes(2);
  expect(onReload).not.toHaveBeenCalled();
  fireEvent.click(refresh);
  const refreshedDeadline = await dialog.findByLabelText("Selection deadline");
  fireEvent.change(refreshedDeadline, { target: { value: "2026-11-19T23:00" } });
  fireEvent.click(dialog.getByRole("button", { name: "Confirm" }));

  await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
  expect(onAccessDenied).not.toHaveBeenCalled();
  const mutations = vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "POST");
  expect(mutations.map(([path, init]) => [path, JSON.parse(String(init?.body))])).toEqual(
    [2, 3].map((expected_revision) => [
      `admin/csa-selections/${csaSelectionId}/reopen`,
      { deadline: "2026-11-19T23:00:00+07:00", expected_revision },
    ]),
  );
});

it.each(["vi", "en"] as const)("retains unknown shipping reason fallback in %s", (locale) => {
  expect(storeShippingDiscountReason("other_reason", locale)).toBe("other_reason");
});

it.each([
  [{ delivery_date: "2027-01-01" }, "01/01/2027"],
  [{ delivery_at: "2026-12-31T17:30:00Z" }, "01/01/2027"],
] as const)("reads the saved companion source date without changing totals: %o", (date, label) => {
  render(
    <AdminI18nProvider initialLocale="vi">
      <StoreOrderSummary
        order={storeOrderFixture({
          delivery_date: "2027-01-01",
          shipping_discount_reason: "csa_companion_delivery",
          shipping_benefit: {
            reason: "csa_companion_delivery",
            round_id: "round",
            selection_id: "selection",
            csa_order_id: "csa-order",
            decided_at: "2026-12-30T08:00:00+07:00",
            ...date,
          },
        })}
      />
    </AdminI18nProvider>,
  );
  expect(screen.getByRole("link", { name: "Đợt CSA" })).toHaveAttribute("title", label);
  expect(
    within(screen.getByText("Tổng phải trả").parentElement!).getByText(/105.000/),
  ).toBeVisible();
});

it("reloads after CSA reopen even when an older expiry read is still in flight", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let elapsed = 0;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  try {
    const order = { ...csaSummaryOrder(), expires_at: "2026-11-19T18:01:00+07:00" };
    const next = csaSummaryOrder(3);
    next.csa!.selection.reopen_until = "2026-11-19T23:00:00+07:00";
    const old = deferred<StoreOrder>();
    const post = deferred<object>();
    vi.mocked(api)
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(post.promise)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(next);

    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <AdminQueryProvider>
            <StoreOrderDetail orderId={order.id} />
          </AdminQueryProvider>
        </ToastProvider>
      </AdminI18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Reopen selection" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(await dialog.findByLabelText("Selection deadline"), {
      target: { value: "2026-11-19T23:00" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Confirm" }));
    await act(async () => {
      elapsed = 60_000;
      vi.advanceTimersByTime(60_000);
    });
    expect(api).toHaveBeenCalledTimes(4);
    const oldSignal = vi.mocked(api).mock.calls[3][1]?.signal;
    expect(oldSignal?.aborted).toBe(false);

    await act(async () => post.resolve({}));
    expect(api).toHaveBeenCalledTimes(5);
    expect(oldSignal?.aborted).toBe(true);
    expect(await screen.findByText("19/11/2026 23:00")).toBeVisible();
    await act(async () => old.resolve(order));
    expect(screen.queryByText("19/11/2026 22:00")).not.toBeInTheDocument();
    expect(screen.getByText("19/11/2026 23:00")).toBeVisible();
  } finally {
    clock.mockRestore();
    vi.useRealTimers();
  }
});
