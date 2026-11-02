import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { StoreOrderDetail } from "@/components/store-order-detail";
import { ToastProvider } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { storeOrderFixture } from "@/tests/store-orders-fixture";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: () => ({ provinceName: null, wardName: null }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-orders/11111111-1111-4111-8111-111111111111",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-31T03:00:00Z"));
});

function detailOrder() {
  const item = storeOrderFixture({ payment_status: "received" });
  return {
    ...item,
    allocation_suggestion: [
      { line_id: item.lines[0].id, batch_id: "batch-a", quantity: 2 },
      { line_id: item.lines[0].id, batch_id: "batch-b", quantity: 1 },
    ],
    source_inventory: {
      refresh_required_before_approve: true,
      product_reservations: [
        {
          product_id: item.lines[0].product_id,
          reserved_quantity: 5,
          this_order_quantity: 3,
          other_orders_quantity: 2,
        },
      ],
      candidates: [
        {
          line_id: item.lines[0].id,
          product_id: item.lines[0].product_id,
          farm_id: "farm-a",
          farm_name: "Vườn A",
          batch_id: "batch-a",
          start_date: "2026-10-29",
          end_date: "2026-11-01",
          available_quantity: 2,
        },
        {
          line_id: item.lines[0].id,
          product_id: item.lines[0].product_id,
          farm_id: "farm-b",
          farm_name: "Vườn B",
          batch_id: "batch-b",
          start_date: "2026-10-30",
          end_date: "2026-11-02",
          available_quantity: 2,
        },
      ],
    },
  };
}

function view() {
  return render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <StoreOrderDetail orderId="11111111-1111-4111-8111-111111111111" />
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

describe("Store order detail", () => {
  it("shows an initial load failure with a clear retry path", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("network_error"));
    view();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Không kết nối được/);
    expect(within(alert).getByRole("button", { name: "Thử lại" })).toBeVisible();
  });

  it("renders recipient, product snapshots, paid totals, transfer data, reservations and timeline", async () => {
    vi.mocked(api).mockResolvedValue(detailOrder());
    view();

    expect(await screen.findByRole("heading", { name: "NFV-STORE-001" })).toBeVisible();
    expect(screen.getByText("Nguyễn An")).toBeVisible();
    expect(screen.getByText("RAU-01")).toBeVisible();
    expect(screen.queryByText("Quyền lợi CSA: 0 sản phẩm · 0 lượt")).not.toBeInTheDocument();
    expect(screen.getAllByText("Rau muống")).toHaveLength(1);
    expect(screen.getByText("Tiền hàng")).toBeVisible();
    expect(screen.getAllByText(/90\.000/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Thông tin chuyển khoản" })).toBeVisible();
    expect(screen.getByText("NFVSTORE001")).toBeVisible();
    expect(screen.getByText("Đơn này giữ 3 · đơn khác giữ 2")).toBeVisible();
    expect(screen.queryByText("Xem lịch sử")).not.toBeInTheDocument();
    expect(screen.getByText("Khách báo chuyển", { selector: "dt" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tải lại đơn và nguồn" })).toHaveClass("nfv-button");
    const editor = screen.getByRole("region", { name: "Phân bổ nguồn Farm / batch" });
    for (const control of [
      ...within(editor).getAllByRole("combobox"),
      ...within(editor).getAllByRole("spinbutton"),
    ]) {
      expect(control).toHaveClass("nfv-control");
    }
  });

  it("shows transfer details and history for delivered orders without disclosure controls", async () => {
    vi.mocked(api).mockResolvedValue({ ...detailOrder(), status: "delivered" });
    const { container } = view();
    expect(await screen.findByRole("heading", { name: "Thông tin chuyển khoản" })).toBeVisible();
    expect(screen.getByText("NFVSTORE001")).toBeVisible();
    expect(screen.getByText("Khách báo chuyển", { selector: "dt" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xem chi tiết" })).not.toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
  });

  it("puts delivery ahead of secondary actions for an approved order", async () => {
    vi.mocked(api).mockResolvedValue({
      ...detailOrder(),
      status: "pending_delivery",
      payment_status: "received",
    });
    const { container } = view();
    await screen.findByRole("heading", { name: "Sản phẩm & nguồn hàng" });
    const buttons = container.querySelectorAll(".store-order-actions button");
    expect(buttons[0]).toHaveTextContent("Xác nhận đã giao");
    expect(
      screen.queryByRole("region", { name: "Phân bổ nguồn Farm / batch" }),
    ).not.toBeInTheDocument();
  });

  it("shows zero-total CSA benefit wording without bank reconciliation fields", async () => {
    vi.mocked(api).mockResolvedValue(
      detailOrder() && {
        ...detailOrder(),
        subtotal_vnd: "0",
        shipping_fee_vnd: "0",
        total_vnd: "0",
        payment_status: "not_required",
        payment: null,
        lines: [
          {
            ...detailOrder().lines[0],
            quota_quantity: 3,
            quota_units: 6,
            cash_quantity: 0,
            cash_subtotal_vnd: "0",
          },
        ],
      },
    );
    view();

    expect(await screen.findByText("Chờ duyệt", { selector: ".store-order-status" })).toBeVisible();
    expect(document.querySelectorAll(".store-order-state-line .status")).toHaveLength(1);
    expect(screen.queryByText("Dùng điểm CSA")).not.toBeInTheDocument();
    expect(document.querySelector(".store-order-total-due dd")).toHaveTextContent(/^0\s*₫$/u);
    expect(
      screen.queryByRole("heading", { name: "Thông tin chuyển khoản" }),
    ).not.toBeInTheDocument();
  });

  it("uses server time for the pending-review deadline and keeps countdown out of live regions", async () => {
    vi.mocked(api).mockResolvedValue({
      ...detailOrder(),
      expires_at: "2026-10-31T18:00:00Z",
    });
    const { container } = view();

    expect(await screen.findByText("Hạn duyệt đơn")).toBeVisible();
    expect(screen.getByText("Còn 480 phút")).toBeVisible();
    expect(container.querySelector(".store-order-countdown")).not.toHaveAttribute("aria-live");
  });

  it("labels the five-minute payment window separately from the eight-hour review window", async () => {
    vi.mocked(api).mockResolvedValue({
      ...detailOrder(),
      status: "payment_pending",
      transfer_reported_at: null,
      expires_at: "2026-10-31T10:05:00Z",
    });
    view();

    expect(await screen.findByText("Hạn báo chuyển khoản")).toBeVisible();
    expect(screen.getByText("Chờ thanh toán", { selector: ".store-order-status" })).toBeVisible();
    expect(screen.getByText("Còn 5 phút")).toBeVisible();
  });

  it("shows allocated Farm batches and their restock ledger from the order snapshot", async () => {
    const item = detailOrder();
    vi.mocked(api).mockResolvedValue({
      ...item,
      status: "cancelled",
      payment_status: "refunded",
      approved_at: "2026-10-31T10:01:00Z",
      cancelled_at: "2026-10-31T10:02:00Z",
      allocations: [
        {
          id: "allocation-a",
          line_id: item.lines[0].id,
          product_id: item.lines[0].product_id,
          batch_id: "batch-a",
          farm_id: "farm-a",
          farm_name: "Vườn A",
          start_date: "2026-10-29",
          end_date: "2026-11-01",
          quantity: 3,
          restocked_quantity: 1,
          restock_remaining_quantity: 2,
          restock_eligible: true,
          restock_unavailable_reason: null,
        },
      ],
    });
    view();

    expect(await screen.findByRole("heading", { name: "Sản phẩm & nguồn hàng" })).toBeVisible();
    expect(screen.getByText("Vườn A")).toBeVisible();
    expect(screen.getByText("Đã hoàn 1 · Còn có thể hoàn 2")).toBeVisible();
    expect(screen.getByText("Còn hàng chưa hoàn tồn")).toBeVisible();
    expect(screen.queryByText("Cần hoàn tiền")).not.toBeInTheDocument();
  });

  it("translates known cancellation codes and preserves admin-entered reasons", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ...detailOrder(),
      status: "cancelled",
      cancellation_reason: "expired",
    });
    const first = view();
    expect(await screen.findByText("Đơn hết hạn trước khi được duyệt")).toBeVisible();
    first.unmount();

    vi.mocked(api).mockResolvedValueOnce({
      ...detailOrder(),
      status: "cancelled",
      cancellation_reason: "Admin nhập lý do riêng",
    });
    view();
    expect(await screen.findByText("Admin nhập lý do riêng")).toBeVisible();
  });

  it("prefills split FEFO once and does not overwrite a dirty allocation draft on refresh", async () => {
    const first = detailOrder();
    const refreshed = {
      ...detailOrder(),
      allocation_suggestion: [{ line_id: first.lines[0].id, batch_id: "batch-b", quantity: 3 }],
    };
    vi.mocked(api).mockResolvedValueOnce(first).mockResolvedValueOnce(refreshed);
    view();

    const editor = await screen.findByRole("region", { name: "Phân bổ nguồn Farm / batch" });
    expect(within(editor).getAllByRole("spinbutton")).toHaveLength(2);
    expect(within(editor).getByText("Đủ 3/3")).toBeVisible();
    fireEvent.change(within(editor).getByLabelText("Số lượng nguồn 1"), { target: { value: "1" } });
    expect(within(editor).getByText("Đã chọn 2/3 · Còn thiếu 1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Tải lại đơn và nguồn" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(within(editor).getByLabelText("Số lượng nguồn 1")).toHaveValue(1);
    expect(within(editor).getAllByRole("spinbutton")).toHaveLength(2);
  });

  it("keeps the snapshot and dirty draft visible when refresh fails, then clears the warning after retry", async () => {
    const first = detailOrder();
    vi.mocked(api)
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({ ...first, updated_at: "2026-10-31T10:03:00Z" });
    view();

    const editor = await screen.findByRole("region", { name: "Phân bổ nguồn Farm / batch" });
    fireEvent.change(within(editor).getByLabelText("Số lượng nguồn 1"), {
      target: { value: "1" },
    });
    fireEvent.change(within(editor).getByLabelText("Số lượng nguồn 2"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tải lại đơn và nguồn" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Không kết nối được/);
    expect(alert).toHaveTextContent(/chưa được làm mới/i);
    expect(within(editor).getByLabelText("Số lượng nguồn 1")).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();

    fireEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(within(editor).getByLabelText("Số lượng nguồn 1")).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeEnabled();
  });

  it("keeps a removed batch selected after refresh and explains why approval is blocked", async () => {
    const first = detailOrder();
    const refreshed = {
      ...first,
      source_inventory: {
        ...first.source_inventory,
        candidates: first.source_inventory.candidates.filter(
          (candidate) => candidate.batch_id !== "batch-a",
        ),
      },
    };
    vi.mocked(api).mockResolvedValueOnce(first).mockResolvedValueOnce(refreshed);
    view();

    const editor = await screen.findByRole("region", { name: "Phân bổ nguồn Farm / batch" });
    const source = within(editor).getAllByRole("combobox")[0];
    expect(source).toHaveValue("batch-a");
    fireEvent.click(screen.getByRole("button", { name: "Tải lại đơn và nguồn" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(source).toHaveValue("batch-a");
    expect(within(editor).getByText("Nguồn đã chọn không còn khả dụng.")).toBeVisible();
    expect(source).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
  });

  it("shows reduced availability inline without replacing the allocation draft", async () => {
    const first = detailOrder();
    const refreshed = {
      ...first,
      source_inventory: {
        ...first.source_inventory,
        candidates: first.source_inventory.candidates.map((candidate) =>
          candidate.batch_id === "batch-a" ? { ...candidate, available_quantity: 1 } : candidate,
        ),
      },
    };
    vi.mocked(api).mockResolvedValueOnce(first).mockResolvedValueOnce(refreshed);
    view();

    const editor = await screen.findByRole("region", { name: "Phân bổ nguồn Farm / batch" });
    fireEvent.click(screen.getByRole("button", { name: "Tải lại đơn và nguồn" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(within(editor).getByLabelText("Số lượng nguồn 1")).toHaveValue(2);
    expect(within(editor).getByText("Nguồn chỉ còn 1, thấp hơn số lượng đã chọn.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
  });

  it("explains empty, duplicate, and invalid allocation states inline", async () => {
    const noSources = detailOrder();
    vi.mocked(api).mockResolvedValueOnce({
      ...noSources,
      allocation_suggestion: [],
      source_inventory: { ...noSources.source_inventory, candidates: [] },
    });
    const first = view();
    expect(await screen.findByText("Hiện không có nguồn khả dụng cho sản phẩm này.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
    first.unmount();

    vi.mocked(api).mockResolvedValueOnce(detailOrder());
    view();
    const editor = await screen.findByRole("region", { name: "Phân bổ nguồn Farm / batch" });
    fireEvent.change(within(editor).getAllByRole("combobox")[0], {
      target: { value: "batch-b" },
    });
    expect(within(editor).getAllByText("Nguồn này đã được chọn cho sản phẩm.")).toHaveLength(2);
    fireEvent.change(within(editor).getByLabelText("Số lượng nguồn 1"), {
      target: { value: "0" },
    });
    expect(within(editor).getByText("Số lượng nguồn phải là số nguyên dương.")).toBeVisible();
  });
});
