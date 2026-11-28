import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { StoreOrderDetail } from "@/components/store-order-detail";
import { ToastProvider } from "@/components/toast-provider";
import type { StoreOrder } from "@/lib/types";
import { sourceLineFixture, storeOrderFixture } from "@/tests/store-orders-fixture";

vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: () => ({ provinceName: null, wardName: null }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/store-orders",
}));

const stamp = "2026-11-03T12:00:00Z";
const otherUuid = "e2a05262-9d39-4b51-b729-4c355b8dd841";
const initial = storeOrderFixture({ expires_at: null });
const cancelled = { ...initial, status: "cancelled", cancelled_at: stamp } as const;

function orderTree(item: StoreOrder) {
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider>
          {" "}
          <StoreOrderDetail orderId={item.id} />{" "}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
}

function receipt(orderId: string, action: string, key: string) {
  return { order_id: orderId, action, idempotency_key: key };
}

function wire(item: StoreOrder, actionReceipt?: unknown) {
  return Response.json({
    data: item,
    ...(actionReceipt === undefined ? {} : { meta: { action_receipt: actionReceipt } }),
  });
}

function fetchOrders(
  read: (path: string) => StoreOrder | Response,
  write: (request: { path: string; body: string; key: string }) => Response | Promise<Response>,
) {
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = String(init.body);
      return write({ path, body, key: JSON.parse(body).idempotency_key });
    }
    const result = read(path);
    return result instanceof Response ? result : wire(result);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function openCancel() {
  fireEvent.click(await screen.findByRole("button", { name: "Hủy đơn" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Lý do hủy"), { target: { value: "Hết hàng" } });
  return { dialog, confirm: within(dialog).getByRole("button", { name: "Hủy đơn" }) };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps a stale 200 without a receipt uncertain and allows only exact replay", async () => {
  const sent: string[] = [];
  const fetch = fetchOrders(
    () => initial,
    ({ body, key }) => {
      sent.push(body);
      return sent.length === 1
        ? wire(initial)
        : wire(cancelled, receipt(initial.id, "cancel", key));
    },
  );
  render(orderTree(initial));
  const { dialog, confirm } = await openCancel();
  fireEvent.click(confirm);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(/chưa xác định/i);
  expect(within(dialog).getByLabelText("Lý do hủy")).toBeDisabled();
  expect(screen.queryByText("Đã cập nhật đơn hàng.")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(confirm);
  expect(await screen.findByText("Đã cập nhật đơn hàng.")).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("confirms a valid receipt with a stale snapshot and blocks further writes until a consistent GET", async () => {
  const write = vi.fn(({ key }: { key: string }) =>
    wire(initial, receipt(initial.id, "cancel", key)),
  );
  let reads = 0;
  const fetch = fetchOrders(() => (++reads === 3 ? cancelled : initial), write);
  render(orderTree(initial));
  const { confirm } = await openCancel();
  fireEvent.click(confirm);
  expect(await screen.findByRole("alert")).toHaveTextContent(/đã xác nhận/i);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hủy đơn" })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button"));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(screen.getByRole("button", { name: "Hủy đơn" })).toBeDisabled();
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button"));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
  expect(write).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "distinguishes a stale workflow v1 refund request from a later reopening (reopened: %s)",
  async (reopened) => {
    const request = { ...cancelled, refund_status: "pending", refund_requested_at: stamp } as const;
    const closed = {
      ...request,
      refund_status: null,
      refund_request_closed_at: "2026-11-03T13:00:00Z",
    } as const;
    const after = reopened ? { ...request, refund_requested_at: "2026-11-03T14:00:00Z" } : request;
    let reads = 0;
    const fetch = fetchOrders(
      () => (++reads === 1 ? request : closed),
      ({ key }) => wire(after, receipt(initial.id, "close_refund_request", key)),
    );
    render(orderTree(request));
    const label = "Xác nhận chưa nhận tiền";
    fireEvent.click(await screen.findByRole("button", { name: label }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Lý do xác nhận chưa nhận tiền"), {
      target: { value: "Không tìm thấy giao dịch" },
    });
    fireEvent.click(dialog.getByRole("button", { name: label }));
    if (reopened) {
      expect(await screen.findByText("Đã cập nhật đơn hàng.")).toBeVisible();
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
      expect(fetch).toHaveBeenCalledTimes(2);
    } else {
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/đã xác nhận/i);
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
      fireEvent.click(within(alert).getByRole("button"));
      await waitFor(() => expect(screen.queryByRole("button", { name: label })).toBeNull());
      expect(fetch).toHaveBeenCalledTimes(3);
    }
  },
);

it.each([
  ["another order", (key: string) => wire(cancelled, receipt(otherUuid, "cancel", key))],
  ["another action", (key: string) => wire(cancelled, receipt(initial.id, "deliver", key))],
  ["another key", () => wire(cancelled, receipt(initial.id, "cancel", otherUuid))],
])("holds the write intent after a 200 with %s", async (_, response) => {
  const fetch = fetchOrders(
    () => initial,
    ({ key }) => response(key),
  );
  render(orderTree(initial));
  const { dialog, confirm } = await openCancel();
  fireEvent.click(confirm);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(/chưa xác định/i);
  expect(within(dialog).getByLabelText("Lý do hủy")).toBeDisabled();
  expect(screen.queryByText("Đã cập nhật đơn hàng.")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("confirms the receipt with an invalid DTO and recovers through GET only", async () => {
  let reads = 0;
  const write = vi.fn(({ key }: { key: string }) =>
    wire(
      { ...cancelled, id: otherUuid, status: "unexpected" } as unknown as StoreOrder,
      receipt(initial.id, "cancel", key),
    ),
  );
  const fetch = fetchOrders(() => (++reads === 1 ? initial : cancelled), write);
  render(orderTree(initial));
  const { confirm } = await openCancel();
  fireEvent.click(confirm);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/đã xác nhận/i);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(within(alert).getByRole("button"));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(write).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(3);
});

const batchId = "0eb05ea3-2160-49f4-9e6f-d7099a1f6afa";
const farmId = "1a5940a9-71b7-464a-901c-6fca01a8b99b";
const allocationId = "9f958471-bb55-4acc-ad7c-dc65eb24b742";

it("accepts an approval receipt on explicit replay after the order was delivered", async () => {
  const line = initial.lines[0];
  const order = {
    ...initial,
    source_inventory: {
      refresh_required_before_approve: true,
      lines: [
        sourceLineFixture(
          line,
          [{ farm_id: farmId, farm_name: "A", available_quantity: line.quantity, eligible: true }],
          farmId,
        ),
      ],
      product_reservations: [],
      candidates: [
        {
          line_id: line.id,
          product_id: line.product_id,
          farm_id: farmId,
          farm_name: "A",
          batch_id: batchId,
          start_date: "2026-11-01",
          end_date: "2026-11-05",
          available_quantity: line.quantity,
        },
      ],
    },
    allocation_suggestion: [{ line_id: line.id, batch_id: batchId, quantity: line.quantity }],
  };
  const sent: string[] = [];
  let reads = 0;
  const fetch = fetchOrders(
    () =>
      ++reads === 1
        ? order
        : {
            ...order,
            source_inventory: {
              ...order.source_inventory,
              lines: [sourceLineFixture(line, [], null, farmId)],
            },
          },
    ({ body, key }) => {
      sent.push(body);
      if (sent.length === 1) return Response.json({ error: "upstream_timeout" }, { status: 504 });
      return wire(
        {
          ...order,
          status: "delivered",
          approved_at: stamp,
          delivered_at: "2026-11-04T12:00:00Z",
          payment_status: "received",
          payment_received_at: stamp,
        },
        receipt(order.id, "approve", key),
      );
    },
  );
  render(orderTree(order));
  fireEvent.click(await screen.findByRole("button", { name: "Duyệt đơn" }));
  const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Duyệt đơn" });
  fireEvent.click(confirm);
  await within(screen.getByRole("dialog")).findByRole("alert");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đóng" }));
  fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
  const select = await screen.findByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
  await waitFor(() =>
    expect(select).toHaveAccessibleDescription(
      "Trang trại đã chọn không còn khả dụng. Vui lòng chọn lại.",
    ),
  );
  expect(select).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Duyệt đơn" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Duyệt đơn" }));
  expect(await screen.findByText("Đã cập nhật đơn hàng.")).toBeVisible();
  expect(screen.getByText("Đã giao", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
  expect(JSON.parse(sent[0])).toEqual({
    idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    sources: [{ line_id: line.id, farm_id: farmId }],
  });
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("keeps a confirmed approval with missing inventory locked until a GET reflects it", async () => {
  const approved = { ...initial, status: "pending_delivery", approved_at: stamp } as const;
  const reads = [initial, initial, approved];
  const fetch = fetchOrders(
    () => reads.shift() ?? approved,
    ({ key }) =>
      wire({ ...approved, source_inventory: undefined }, receipt(initial.id, "approve", key)),
  );
  render(orderTree(initial));
  fireEvent.click(await screen.findByRole("button", { name: "Duyệt đơn" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Duyệt đơn" }));
  const notice = await screen.findByRole("alert");
  expect(notice).toHaveTextContent(/đã xác nhận/i);
  expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
  fireEvent.click(within(notice).getByRole("button"));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.getByRole("button", { name: "Làm mới" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
  expect(await screen.findByRole("button", { name: "Xác nhận đã giao" })).toBeEnabled();
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(4);
});

function historicalRestock(quantity: number): StoreOrder {
  const line = initial.lines[0];
  return {
    ...cancelled,
    approved_at: stamp,
    allocations: [
      {
        id: allocationId,
        line_id: line.id,
        product_id: line.product_id,
        farm_id: farmId,
        farm_name: "A",
        batch_id: batchId,
        start_date: "2026-11-01",
        end_date: "2026-11-05",
        quantity: 3,
        restocked_quantity: quantity,
        restock_remaining_quantity: 3 - quantity,
        restock_eligible: quantity < 3,
        restock_unavailable_reason: quantity < 3 ? null : "fully_restocked",
      },
    ],
  };
}

async function openRestock() {
  fireEvent.click(await screen.findByRole("button", { name: "Hoàn tồn kho" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: /^Số lượng hoàn/u }), {
    target: { value: "1" },
  });
  return { dialog, confirm: within(dialog).getByRole("button", { name: "Hoàn tồn kho" }) };
}

it("uses the original restock key and ledger threshold after a newer GET", async () => {
  const before = historicalRestock(1);
  const after = historicalRestock(2);
  const sent: string[] = [];
  let reads = 0;
  fetchOrders(
    () => (++reads === 1 ? before : after),
    ({ body, key }) => {
      sent.push(body);
      return sent.length === 1 ? wire(before) : wire(after, receipt(before.id, "restock", key));
    },
  );
  render(orderTree(before));
  const { dialog, confirm } = await openRestock();
  fireEvent.click(confirm);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(/chưa xác định/i);
  fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
  fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
  const open = screen.getByRole("button", { name: "Hoàn tồn kho" });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  const replay = screen.getByRole("dialog");
  expect(within(replay).getByRole("textbox", { name: /^Số lượng hoàn/u })).toBeDisabled();
  fireEvent.click(within(replay).getByRole("button", { name: "Hoàn tồn kho" }));
  expect(await screen.findByText("Đã cập nhật đơn hàng.")).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
});

it("blocks a new restock when its receipt confirms more movement than the response shows", async () => {
  const before = historicalRestock(1);
  const write = vi.fn(({ key }: { key: string }) =>
    wire(before, receipt(before.id, "restock", key)),
  );
  let reads = 0;
  fetchOrders(() => historicalRestock(++reads === 2 ? 3 : 1), write);
  render(orderTree(before));
  const { confirm } = await openRestock();
  fireEvent.click(confirm);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/đã xác nhận/i);
  expect(screen.getByRole("button", { name: "Hoàn tồn kho" })).toBeDisabled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(within(alert).getByRole("button"));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Hoàn tồn kho" })).not.toBeInTheDocument(),
  );
  expect(write).toHaveBeenCalledTimes(1);
});

it.each(["received", "refunded"] as const)(
  "accepts a record_payment receipt when the durable payment state is %s without a legacy timestamp",
  async (payment_status) => {
    const fetch = fetchOrders(
      () => initial,
      ({ path, key }) => {
        expect(path).toContain("/record-payment");
        return wire(
          {
            ...initial,
            payment_status,
            payment_received_at: null,
            ...(payment_status === "refunded"
              ? {
                  status: "cancelled",
                  cancelled_at: stamp,
                  refunded_at: stamp,
                  refund_status: "refunded",
                }
              : {}),
          },
          receipt(initial.id, "record_payment", key),
        );
      },
    );
    render(orderTree(initial));
    const label = "Xác nhận đã nhận tiền";
    fireEvent.click(await screen.findByRole("button", { name: label }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label }));
    expect(await screen.findByText("Đã cập nhật đơn hàng.")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
