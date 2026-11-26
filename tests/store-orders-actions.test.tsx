import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { StoreOrderDetail } from "@/components/store-order-detail";
import { ToastProvider } from "@/components/toast-provider";
import type { AdminLocale } from "@/lib/admin-i18n";
import { api } from "@/lib/client-api";
import type { StoreOrder } from "@/lib/types";
import { storeOrderFixture } from "@/tests/store-orders-fixture";

vi.mock("@/lib/client-api", async () => {
  const { createStoreOrderApiMock } = await import("@/tests/store-orders-fixture");
  return createStoreOrderApiMock();
});
vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: () => ({ provinceName: null, wardName: null }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/store-orders/id",
}));

const batchA = "00000000-0000-4000-8000-0000000000a1";
const batchB = "00000000-0000-4000-8000-0000000000a2";
const farmA = "00000000-0000-4000-8000-0000000000b1";
const allocationA = "00000000-0000-4000-8000-0000000000c1";
const allocationB = "00000000-0000-4000-8000-0000000000c2";
const lineB = "00000000-0000-4000-8000-0000000000d1";
const productB = "00000000-0000-4000-8000-0000000000e1";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  vi.mocked(api).mockReset();
  let n = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
});

function pending() {
  const row = storeOrderFixture();
  return {
    ...row,
    allocation_suggestion: [{ line_id: row.lines[0].id, batch_id: batchA, quantity: 3 }],
    source_inventory: {
      refresh_required_before_approve: true,
      product_reservations: [],
      candidates: [
        {
          line_id: row.lines[0].id,
          product_id: row.lines[0].product_id,
          farm_id: farmA,
          farm_name: "Vườn A",
          batch_id: batchA,
          start_date: "2026-10-30",
          end_date: "2026-11-02",
          available_quantity: 3,
        },
      ],
    },
  };
}

function view(item: StoreOrder = pending(), locale: AdminLocale = "vi") {
  vi.mocked(api).mockResolvedValueOnce(item);
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>
        <StoreOrderDetail orderId={item.id} />
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

async function open(name: string) {
  fireEvent.click(await screen.findByRole("button", { name }));
  return screen.getByRole("dialog");
}

describe("Store order actions", () => {
  it("legacy paid review approves with combined receipt without a separate payment prerequisite", async () => {
    const item = pending();
    view(item);
    expect(await screen.findByRole("button", { name: "Duyệt đơn" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ghi nhận đã nhận tiền" })).toBeEnabled();
    vi.mocked(api).mockResolvedValueOnce({
      ...item,
      status: "pending_delivery",
      approved_at: "2026-10-31T10:00:00Z",
      payment_status: "received",
      payment_received_at: "2026-10-31T10:00:00Z",
      expires_at: null,
    });
    const approval = await open("Duyệt đơn");
    expect(within(approval).queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(within(approval).getByRole("button", { name: "Duyệt đơn" }));
    expect(await screen.findByRole("button", { name: "Xác nhận đã giao" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Ghi nhận đã nhận tiền" })).not.toBeInTheDocument();
  });

  it("allows a zero-total order to be approved without recording payment", async () => {
    view({ ...pending(), total_vnd: "0", payment_status: "not_required" });
    const dialog = await open("Duyệt đơn");
    expect(within(dialog).getByRole("button", { name: "Duyệt đơn" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Ghi nhận đã nhận tiền" })).not.toBeInTheDocument();
  });

  it("approves a paid order with allocations and one synchronous submit", async () => {
    const item = { ...pending(), payment_status: "received" as const };
    let resolve!: (value: unknown) => void;
    view(item);
    vi.mocked(api).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }) as never,
    );
    const dialog = await open("Duyệt đơn");
    const confirm = within(dialog).getByRole("button", { name: "Duyệt đơn" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const [, init] = vi.mocked(api).mock.calls[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      idempotency_key: "00000000-0000-4000-8000-000000000001",
      allocations: item.allocation_suggestion,
    });
    resolve({
      ...item,
      status: "pending_delivery",
      approved_at: "2026-10-31T10:00:00Z",
      payment_status: "received",
    });
  });

  it("requires a cancel reason and preserves the reason after a network failure with the same retry key", async () => {
    const item = pending();
    view(item);
    vi.mocked(api).mockRejectedValue(new Error("network_error"));
    const dialog = await open("Hủy đơn");
    expect(within(dialog).getByRole("button", { name: "Hủy đơn" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Lý do hủy"), { target: { value: "Hết hàng" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));
    expect(await within(dialog).findByText(/Không thể kết nối/)).toBeVisible();
    expect(within(dialog).getByLabelText("Lý do hủy")).toHaveValue("Hết hàng");
    const firstPayload = JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body));
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    const secondPayload = JSON.parse(String(vi.mocked(api).mock.calls[2][1]?.body));
    expect(secondPayload.idempotency_key).toBe(firstPayload.idempotency_key);
  });

  it("records late payment on a cancelled order without presenting delivery or approval", async () => {
    const item = {
      ...pending(),
      status: "cancelled" as const,
      payment_status: "unconfirmed" as const,
      cancelled_at: "2026-10-31T10:00:00Z",
    };
    view(item);
    vi.mocked(api).mockResolvedValueOnce({
      ...item,
      payment_status: "refund_required",
      refund_status: "pending",
      payment_received_at: "2026-10-31T10:00:00Z",
    });
    const dialog = await open("Ghi nhận đã nhận tiền");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ghi nhận đã nhận tiền" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Chờ hoàn", { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Duyệt đơn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xác nhận đã giao" })).not.toBeInTheDocument();
  });

  it("anchors the countdown to the receipt time of a mutation response", async () => {
    const clientStart = Date.parse("2026-10-31T10:00:00Z");
    const clock = vi.spyOn(performance, "now").mockReturnValue(clientStart);
    const item = pending();
    view(item);
    expect(await screen.findByText("Còn 8 phút")).toBeVisible();

    clock.mockReturnValue(clientStart + 120_000);
    vi.mocked(api).mockResolvedValueOnce({
      ...item,
      payment_status: "received",
      payment_received_at: "2026-10-31T10:02:00Z",
      server_time: "2026-10-31T10:02:00Z",
    });
    const dialog = await open("Ghi nhận đã nhận tiền");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ghi nhận đã nhận tiền" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Còn 6 phút")).toBeVisible();
    clock.mockRestore();
  });

  it("keeps a 400 validation failure distinct from a 409 reload conflict", async () => {
    view();
    vi.mocked(api).mockRejectedValueOnce(
      Object.assign(new Error("validation_error"), { status: 400, field: "allocations" }),
    );
    const dialog = await open("Hủy đơn");
    fireEvent.change(within(dialog).getByLabelText("Lý do hủy"), {
      target: { value: "Hết hàng" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));

    expect(await within(dialog).findByText(/allocations/)).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Tải trạng thái mới" })).toBeNull();
    expect(within(dialog).getByLabelText("Lý do hủy")).toHaveValue("Hết hàng");
  });

  it("refunds only the snapshot total with a required note and explicit external confirmation", async () => {
    const item = {
      ...pending(),
      status: "cancelled" as const,
      payment_status: "refund_required" as const,
      refund_status: "pending" as const,
      payment_received_at: "2026-10-31T10:00:00Z",
      cancelled_at: "x",
    };
    view(item);
    const dialog = await open("Xác nhận hoàn tiền");
    expect(within(dialog).getByText(/105\.000/)).toBeVisible();
    expect(within(dialog).getByText(item.reference_code)).toBeVisible();
    expect(
      within(dialog).getByText("Hoàn tiền thủ công cho khách trước khi xác nhận tại đây."),
    ).toBeVisible();
    expect(screen.getByText("Chờ hoàn", { selector: ".mantine-Badge-label" })).toBeVisible();
    const confirm = within(dialog).getByRole("button", { name: "Xác nhận hoàn tiền" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Ghi chú hoàn tiền"), {
      target: { value: "Đã chuyển khoản" },
    });
    fireEvent.click(
      within(dialog).getByLabelText("Tôi xác nhận đã chuyển trả tiền ngoài hệ thống."),
    );
    expect(confirm).toBeEnabled();
  });

  it("offers explicit restock quantities only for approved cancelled allocations", async () => {
    const item = {
      ...pending(),
      status: "cancelled" as const,
      payment_status: "refunded" as const,
      approved_at: "x",
      allocations: [
        {
          id: allocationA,
          line_id: pending().lines[0].id,
          product_id: pending().lines[0].product_id,
          batch_id: batchA,
          farm_id: farmA,
          farm_name: "Vườn A",
          start_date: "2026-10-30",
          end_date: "2026-11-02",
          quantity: 3,
          restocked_quantity: 1,
          restock_remaining_quantity: 2,
          restock_eligible: true,
          restock_unavailable_reason: null,
        },
      ],
    };
    view(item);
    const dialog = await open("Hoàn tồn");
    const quantity = within(dialog).getByLabelText(
      `Số lượng hoàn · Rau muống (RAU-01) · Vườn A · batch ${batchA}`,
    );
    const confirm = within(dialog).getByRole("button", { name: "Hoàn tồn" });
    expect(quantity).toHaveAttribute("max", "2");
    expect(quantity).toHaveValue(0);
    fireEvent.change(quantity, { target: { value: "3" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(quantity, { target: { value: "1.5" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(quantity, { target: { value: "1" } });
    expect(confirm).toBeEnabled();
  });

  it("identifies same-farm restock rows and submits only explicitly selected allocations", async () => {
    const base = pending();
    const secondLine = {
      ...base.lines[0],
      id: lineB,
      product_id: productB,
      sku: "CA-02",
      name: "Cà chua",
      unit_size: "1",
    };
    const allocations = [
      {
        id: allocationA,
        line_id: base.lines[0].id,
        product_id: base.lines[0].product_id,
        batch_id: batchA,
        farm_id: farmA,
        farm_name: "Vườn A",
        start_date: "2026-10-30",
        end_date: "2026-11-02",
        quantity: 3,
        restocked_quantity: 1,
        restock_remaining_quantity: 2,
        restock_eligible: true,
        restock_unavailable_reason: null,
      },
      {
        id: allocationB,
        line_id: secondLine.id,
        product_id: secondLine.product_id,
        batch_id: batchB,
        farm_id: farmA,
        farm_name: "Vườn A",
        start_date: "2026-10-31",
        end_date: "2026-11-03",
        quantity: 2,
        restocked_quantity: 0,
        restock_remaining_quantity: 2,
        restock_eligible: true,
        restock_unavailable_reason: null,
      },
    ];
    const item = {
      ...base,
      lines: [base.lines[0], secondLine],
      status: "cancelled" as const,
      payment_status: "refunded" as const,
      approved_at: "x",
      allocations,
    };
    view(item);
    vi.mocked(api).mockResolvedValueOnce({
      ...item,
      allocations: [
        { ...allocations[0], restocked_quantity: 2, restock_remaining_quantity: 1 },
        allocations[1],
      ],
    });

    const dialog = await open("Hoàn tồn");
    expect(within(dialog).getByText("Rau muống")).toBeVisible();
    expect(within(dialog).getByText("Cà chua")).toBeVisible();
    const first = within(dialog).getByLabelText(
      `Số lượng hoàn · Rau muống (RAU-01) · Vườn A · batch ${batchA}`,
    );
    const second = within(dialog).getByLabelText(
      `Số lượng hoàn · Cà chua (CA-02) · Vườn A · batch ${batchB}`,
    );
    fireEvent.change(first, { target: { value: "1" } });
    expect(second).toHaveValue(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Hoàn tồn" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const [, init] = vi.mocked(api).mock.calls[1];
    expect(JSON.parse(String(init?.body)).allocations).toEqual([
      { allocation_id: allocationA, quantity: 1 },
    ]);
  });

  it("keeps restock quantities in the dialog after a 409 conflict", async () => {
    const base = pending();
    const item = {
      ...base,
      status: "cancelled" as const,
      payment_status: "refunded" as const,
      approved_at: "x",
      allocations: [
        {
          id: allocationA,
          line_id: base.lines[0].id,
          product_id: base.lines[0].product_id,
          batch_id: batchA,
          farm_id: farmA,
          farm_name: "Vườn A",
          start_date: "2026-10-30",
          end_date: "2026-11-02",
          quantity: 3,
          restocked_quantity: 1,
          restock_remaining_quantity: 2,
          restock_eligible: true,
          restock_unavailable_reason: null,
        },
      ],
    };
    view(item);
    vi.mocked(api).mockRejectedValueOnce(
      Object.assign(new Error("store_order_state_conflict"), { status: 409 }),
    );
    const dialog = await open("Hoàn tồn");
    const quantity = within(dialog).getByRole("spinbutton");
    fireEvent.change(quantity, { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hoàn tồn" }));

    expect(await within(dialog).findByRole("button", { name: "Tải trạng thái mới" })).toBeVisible();
    expect(quantity).toHaveValue(1);
  });

  it("shows deliver only for pending delivery and reloads intentionally on a 409 conflict", async () => {
    const item = {
      ...pending(),
      status: "pending_delivery" as const,
      payment_status: "received" as const,
      approved_at: "x",
      expires_at: null,
    };
    view(item);
    vi.mocked(api)
      .mockRejectedValueOnce(
        Object.assign(new Error("store_order_state_conflict"), { status: 409 }),
      )
      .mockResolvedValueOnce({ ...item, status: "delivered" });
    const dialog = await open("Xác nhận đã giao");
    fireEvent.click(within(dialog).getByLabelText("Tôi xác nhận khách đã nhận hàng."));
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận đã giao" }));
    expect(await within(dialog).findByText(/đã thay đổi/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tải trạng thái mới" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  });

  it("refreshes approval after a stock coverage conflict without replaying the mutation", async () => {
    const item = pending();
    const [candidate] = item.source_inventory.candidates;
    view(item);
    vi.mocked(api)
      .mockRejectedValueOnce(
        Object.assign(new Error("store_allocation_stale"), {
          status: 409,
          payload: {
            errors: [
              {
                code: "store_allocation_stale",
                context: { product_id: candidate.product_id, available_quantity: 1 },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce({
        ...item,
        allocation_suggestion: [{ ...item.allocation_suggestion[0], quantity: 1 }],
        source_inventory: {
          ...item.source_inventory,
          candidates: [{ ...candidate, batch_id: batchB }],
        },
      });

    const dialog = await open("Duyệt đơn");
    const confirm = within(dialog).getByRole("button", { name: "Duyệt đơn" });
    fireEvent.click(confirm);
    const reload = await within(dialog).findByRole("button", { name: "Tải trạng thái mới" });
    expect(confirm).toBeDisabled();
    expect(api).toHaveBeenCalledTimes(2);

    fireEvent.click(reload);
    const editor = screen.getByRole("region", { name: "Phân bổ nguồn Farm / batch" });
    await waitFor(() =>
      expect(within(editor).getByRole("combobox")).toHaveAttribute("aria-invalid", "true"),
    );
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
    expect(
      vi.mocked(api).mock.calls.map(([path, init]) => [path, ...(init ? [init] : [])]),
    ).toEqual([
      [`admin/store-orders/${item.id}`],
      [`admin/store-orders/${item.id}/approve`, expect.objectContaining({ method: "POST" })],
      [`admin/store-orders/${item.id}`],
    ]);
  });

  it("shows a stale snapshot warning and locks mutations when conflict reload fails", async () => {
    const item = { ...pending(), payment_status: "received" as const };
    vi.mocked(api)
      .mockResolvedValueOnce(item)
      .mockRejectedValueOnce(
        Object.assign(new Error("store_order_state_conflict"), { status: 409 }),
      )
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({ ...item, updated_at: "2026-10-31T10:03:00Z" });
    render(
      <AdminI18nProvider initialLocale="vi">
        <ToastProvider>
          <StoreOrderDetail orderId={item.id} />
        </ToastProvider>
      </AdminI18nProvider>,
    );

    const dialog = await open("Hủy đơn");
    fireEvent.change(within(dialog).getByLabelText("Lý do hủy"), {
      target: { value: "Hết hàng" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Tải trạng thái mới" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/chưa được làm mới/i);
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
    fireEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeEnabled();
  });
});

function cancelledSources(): StoreOrder {
  const item = pending();
  const source = {
    id: allocationA,
    line_id: item.lines[0].id,
    product_id: item.lines[0].product_id,
    batch_id: batchA,
    farm_id: farmA,
    farm_name: "Vườn A",
    start_date: "2026-10-01",
    end_date: "2026-10-02",
    quantity: 3,
    restocked_quantity: 0,
    restock_remaining_quantity: 3,
    restock_eligible: false,
    restock_unavailable_reason: "batch_expired",
  };
  return {
    ...item,
    status: "cancelled" as const,
    payment_status: "refunded" as const,
    approved_at: "2026-10-01T10:00:00Z",
    allocations: [source],
  };
}

it("does not offer restock when every remaining source is ineligible and explains why", async () => {
  view(cancelledSources());
  expect(await screen.findByText("Nguồn đã hết hạn, không thể hoàn tồn.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Hoàn tồn" })).not.toBeInTheDocument();
});

it.each([
  [
    "vi",
    "batch_historical",
    "Đợt cung cấp thuộc lịch sử, không thể hoàn tồn vào nguồn hiện tại.",
    "Hoàn tồn",
  ],
  [
    "en",
    "batch_historical",
    "This is a historical batch and cannot be restocked into the current supply.",
    "Restock",
  ],
  ["vi", "offer_inactive", "Nguồn cung đã được gỡ khỏi trang trại.", "Hoàn tồn"],
  ["en", "offer_inactive", "This source was removed from the farm.", "Restock"],
] as const)(
  "shows the Backend restock reason in %s for %s without offering the action",
  async (locale, reason, message, action) => {
    const item = cancelledSources();
    item.allocations![0].restock_unavailable_reason = reason;
    view(item, locale);
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
  },
);

it("allows only eligible allocations in a mixed-source restock", async () => {
  const item = cancelledSources();
  item.allocations!.push({
    ...item.allocations![0],
    id: allocationB,
    batch_id: batchB,
    farm_name: "Vườn B",
    restock_eligible: true,
    restock_unavailable_reason: null,
  });
  view(item);
  const dialog = await open("Hoàn tồn");
  const inputs = within(dialog).getAllByRole("spinbutton");
  expect(inputs[0]).toHaveAttribute("max", "0");
  fireEvent.change(inputs[1], { target: { value: "1" } });
  fireEvent.change(inputs[0], { target: { value: "1" } });
  const confirm = within(dialog).getByRole("button", { name: "Hoàn tồn" });
  expect(confirm).toBeDisabled();
  fireEvent.change(inputs[0], { target: { value: "0" } });
  expect(confirm).toBeEnabled();
  vi.mocked(api).mockResolvedValueOnce({
    ...item,
    allocations: [
      item.allocations![0],
      { ...item.allocations![1], restocked_quantity: 1, restock_remaining_quantity: 2 },
    ],
  });
  fireEvent.click(confirm);
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body)).allocations).toEqual([
    { allocation_id: allocationB, quantity: 1 },
  ]);
});
