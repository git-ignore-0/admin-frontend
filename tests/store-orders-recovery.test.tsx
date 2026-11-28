import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { StoreOrderDetail } from "@/components/store-order-detail";
import { ToastProvider } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { sourceLineFixture, storeOrderFixture } from "@/tests/store-orders-fixture";
import type { StoreOrder } from "@/lib/types";

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
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.mocked(api).mockReset();
});
const orderTree = (id: string) => (
  <AdminI18nProvider initialLocale="vi">
    <ToastProvider>
      <AdminQueryProvider>
        <StoreOrderDetail orderId={id} />
      </AdminQueryProvider>
    </ToastProvider>
  </AdminI18nProvider>
);
const renderOrder = (id = storeOrderFixture().id) => render(orderTree(id));

it.each([false, true])(
  "replays legacy approval bytes without using the current Farm suggestion (conflict=%s)",
  async (conflict) => {
    const item = storeOrderFixture({ expires_at: null });
    const line = item.lines[0];
    const firstBatch = "00000000-0000-4000-8000-0000000000a1";
    const secondBatch = "00000000-0000-4000-8000-0000000000a2";
    const payload = {
      idempotency_key: "00000000-0000-4000-8000-000000000045",
      allocations: [
        { line_id: line.id, batch_id: secondBatch, quantity: 1 },
        { line_id: line.id, batch_id: firstBatch, quantity: 2 },
      ],
    };
    const suggestedFarm = {
      farm_id: "00000000-0000-4000-8000-0000000000b1",
      farm_name: "Current suggestion",
      available_quantity: 4,
      eligible: true,
    };
    const snapshot = {
      ...item,
      source_inventory: item.source_inventory && {
        ...item.source_inventory,
        lines: [sourceLineFixture(line, [suggestedFarm], suggestedFarm.farm_id)],
      },
    };
    function RecoverLegacy() {
      const client = useQueryClient();
      const [ready, setReady] = useState(false);
      useLayoutEffect(() => {
        client.setQueryData(["admin-mutation-intent", "store-order", item.id], {
          phase: "unknown",
          payload: {
            orderId: item.id,
            action: "approve",
            payload,
            confirmation: { action: "approve" },
          },
        });
        setReady(true);
      }, [client]);
      return ready ? <StoreOrderDetail orderId={item.id} /> : null;
    }
    vi.mocked(api).mockResolvedValueOnce(snapshot);
    if (conflict) {
      vi.mocked(api)
        .mockRejectedValueOnce(
          Object.assign(new Error("store_allocation_mixed_farm"), { status: 409 }),
        )
        .mockResolvedValueOnce(snapshot);
    } else {
      vi.mocked(api).mockResolvedValueOnce({
        ...snapshot,
        status: "pending_delivery",
        approved_at: "2026-10-31T10:01:00Z",
        allocations: payload.allocations.map((allocation, index) => ({
          ...allocation,
          id: index === 0 ? firstBatch : secondBatch,
          product_id: line.product_id,
          farm_id: index === 0 ? line.id : line.product_id,
          farm_name: index === 0 ? "Historic Farm A" : "Historic Farm B",
          start_date: "2026-10-29",
          end_date: "2026-11-03",
          restocked_quantity: 0,
          restock_remaining_quantity: allocation.quantity,
          restock_eligible: false,
          restock_unavailable_reason: "order_not_cancelled",
        })),
      });
    }
    render(
      <AdminI18nProvider initialLocale="vi">
        <ToastProvider>
          <AdminQueryProvider>
            <RecoverLegacy />
          </AdminQueryProvider>
        </ToastProvider>
      </AdminI18nProvider>,
    );
    await screen.findByRole("heading", { name: item.reference_code });
    const products = within(screen.getByRole("region", { name: "Sản phẩm" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(products.queryByRole("group", { name: "Trang trại cung cấp" })).not.toBeInTheDocument();
    expect(screen.queryByText(suggestedFarm.farm_name)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Thử lại yêu cầu trước" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại yêu cầu trước" }));
    const dialog = screen.getByRole("dialog", { name: "Thử lại yêu cầu trước" });
    const confirm = within(dialog).getByRole("button", { name: "Thử lại yêu cầu trước" });
    fireEvent.click(confirm);
    if (conflict) {
      const reload = await within(dialog).findByRole("button", { name: "Tải trạng thái mới" });
      expect(reload).toBeEnabled();
      expect(within(dialog).getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
      expect(api).toHaveBeenCalledTimes(2);
      fireEvent.click(reload);
      const selection = await screen.findByRole("combobox", { name: /Trang trại cung cấp/ });
      expect(within(products.getByRole("listitem")).getByRole("combobox")).toBe(selection);
      expect(selection).toBeEnabled();
      expect(selection).toHaveDisplayValue(/Current suggestion/);
      expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeEnabled();
    } else {
      expect(await screen.findByText("Historic Farm A")).toBeVisible();
      const item = within(products.getByRole("listitem"));
      const source = within(item.getByRole("group", { name: "Trang trại cung cấp" }));
      expect(source.getByText("Historic Farm A")).toBeVisible();
      expect(source.getByText("Historic Farm B")).toBeVisible();
    }
    expect(api).toHaveBeenCalledTimes(conflict ? 3 : 2);
    expect(vi.mocked(api).mock.calls[1]?.[0]).toBe(`admin/store-orders/${item.id}/approve`);
    expect(vi.mocked(api).mock.calls[1]?.[1]?.body).toBe(JSON.stringify(payload));
  },
);

it("pending delivery never polls an inactive expiry and blocks refresh during delivery", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const initial = storeOrderFixture({
    status: "pending_delivery",
    payment_status: "received",
    server_time: "2026-11-02T00:00:00Z",
    expires_at: "2026-11-02T00:01:00Z",
  });
  let resolveMutation!: (value: StoreOrder) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(initial)
    .mockImplementationOnce(
      () =>
        new Promise<StoreOrder>((resolve) => {
          resolveMutation = resolve;
        }) as never,
    );
  renderOrder();
  fireEvent.click(await screen.findByRole("button", { name: "Xác nhận đã giao" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận đã giao" }));
  expect(screen.getByRole("button", { name: "Làm mới" })).toBeDisabled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(api).toHaveBeenCalledTimes(2);
  await act(async () =>
    resolveMutation({
      ...initial,
      status: "delivered",
      delivered_at: "2026-11-02T00:01:00Z",
    }),
  );
  expect(screen.getByText("Đã giao", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(api).toHaveBeenCalledTimes(2);
});

it("409 must disable the modal confirm button until reload", async () => {
  const initial = storeOrderFixture({ status: "pending_delivery", expires_at: null });
  vi.mocked(api)
    .mockResolvedValueOnce(initial)
    .mockRejectedValueOnce(Object.assign(new Error("version_conflict"), { status: 409 }));
  renderOrder();
  fireEvent.click(await screen.findByRole("button", { name: "Hủy đơn" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Lý do hủy"), { target: { value: "Hết hàng" } });
  const confirm = within(dialog).getByRole("button", { name: "Hủy đơn" });
  fireEvent.click(confirm);
  await within(dialog).findByRole("alert");
  expect(confirm).toBeDisabled();
});

function restockOrder() {
  return storeOrderFixture({
    status: "cancelled",
    expires_at: null,
    approved_at: "2026-11-01T00:00:00Z",
    allocations: [
      {
        id: "00000000-0000-4000-8000-0000000000c1",
        line_id: storeOrderFixture().lines[0].id,
        batch_id: "00000000-0000-4000-8000-0000000000a1",
        quantity: 3,
        product_id: storeOrderFixture().lines[0].product_id,
        farm_id: "00000000-0000-4000-8000-0000000000b1",
        farm_name: "Farm",
        start_date: "2026-11-01",
        end_date: "2026-11-05",
        restocked_quantity: 0,
        restock_remaining_quantity: 3,
        restock_eligible: true,
        restock_unavailable_reason: null,
      },
    ],
  });
}

it.each([0, 1])(
  "reopening restock after reconciliation respects the confirmed ledger (%i)",
  async (completed) => {
    const initial = restockOrder();
    const withRestock = (restocked_quantity: number) => ({
      ...initial,
      allocations: [
        {
          ...initial.allocations![0],
          restocked_quantity,
          restock_remaining_quantity: 3 - restocked_quantity,
        },
      ],
    });
    vi.mocked(api)
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(withRestock(completed))
      .mockResolvedValueOnce(withRestock(1));
    renderOrder();
    fireEvent.click(await screen.findByRole("button", { name: "Hoàn tồn kho" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Số lượng hoàn/u }), {
      target: { value: "1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hoàn tồn kho" }));
    await within(dialog).findByRole("alert");
    const first = JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body));
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Làm mới" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tồn kho" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Số lượng hoàn/u }), {
      target: { value: "1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hoàn tồn kho" }));
    const second = JSON.parse(String(vi.mocked(api).mock.calls[3][1]?.body));
    expect(second.allocations).toEqual(first.allocations);
    expect(second.idempotency_key).toBe(first.idempotency_key);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    vi.mocked(api).mockResolvedValueOnce(withRestock(2));
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tồn kho" }));
    const deliberate = screen.getByRole("dialog");
    fireEvent.change(within(deliberate).getByRole("textbox", { name: /^Số lượng hoàn/u }), {
      target: { value: "1" },
    });
    fireEvent.click(within(deliberate).getByRole("button", { name: "Hoàn tồn kho" }));
    const third = JSON.parse(String(vi.mocked(api).mock.calls[4][1]?.body));
    expect(third.idempotency_key).not.toBe(first.idempotency_key);
  },
);

it.each([
  ["a connectivity failure", () => Promise.reject(new Error("network_error"))],
  [
    "an invalid HTTP 200 response",
    () => Promise.reject(Object.assign(new Error("invalid_response"), { status: 200 })),
  ],
])("keeps the unresolved restock intent after %s and a ledger refresh", async (_label, fail) => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
  const initial = {
    ...restockOrder(),
    server_time: "2026-11-02T00:00:00Z",
    expires_at: "2026-11-02T00:01:00Z",
  };
  const reconciled = {
    ...initial,
    allocations: [
      { ...initial.allocations![0], restocked_quantity: 1, restock_remaining_quantity: 2 },
    ],
  };
  vi.mocked(api)
    .mockResolvedValueOnce(initial)
    .mockImplementationOnce(fail)
    .mockResolvedValueOnce(reconciled)
    .mockResolvedValueOnce(reconciled);
  renderOrder();
  fireEvent.click(await screen.findByRole("button", { name: "Hoàn tồn kho" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: /^Số lượng hoàn/u }), {
    target: { value: "1" },
  });
  const confirm = within(dialog).getByRole("button", { name: "Hoàn tồn kho" });
  fireEvent.click(confirm);
  await within(dialog).findByRole("alert");
  const first = JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body));
  fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Làm mới" })).toBeEnabled());
  expect(api).toHaveBeenCalledTimes(3);
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  const second = JSON.parse(String(vi.mocked(api).mock.calls[3][1]?.body));
  expect(second.idempotency_key).toBe(first.idempotency_key);
});

const otherOrder = storeOrderFixture({
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  reference_code: "OTHER-ORDER",
  shipping_address: { ...storeOrderFixture().shipping_address, recipient_name: "Other recipient" },
  expires_at: null,
});

function cancelOrder() {
  fireEvent.click(screen.getByRole("button", { name: "Hủy đơn" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Lý do hủy"), { target: { value: "Hết hàng" } });
  return within(dialog).getByRole("button", { name: "Hủy đơn" });
}

it.each([otherOrder, { ...storeOrderFixture(), lines: [null] }])(
  "rejects an untrusted initial detail response before rendering controls",
  async (response) => {
    vi.mocked(api).mockResolvedValueOnce(response);
    renderOrder(storeOrderFixture().id);
    await screen.findByRole("alert");
    expect(screen.queryByText("Other recipient")).not.toBeInTheDocument();
    expect(screen.queryByText("Nguyễn An")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  },
);

it.each([
  ["403", Object.assign(new Error("forbidden"), { status: 403 })],
  ["401", Object.assign(new Error("session_expired"), { status: 401 })],
  ["404", Object.assign(new Error("not_found"), { status: 404 })],
  ["bad identity", otherOrder],
])(
  "hides the previous order after a refresh returns %s and reads again explicitly",
  async (_, result) => {
    const item = storeOrderFixture({ expires_at: null });
    vi.mocked(api).mockResolvedValueOnce(item);
    if (result instanceof Error) vi.mocked(api).mockRejectedValueOnce(result);
    else vi.mocked(api).mockResolvedValueOnce(result);
    vi.mocked(api).mockResolvedValueOnce(item);
    renderOrder(item.id);
    await screen.findByText("Nguyễn An");
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Nguyễn An")).not.toBeInTheDocument();
    expect(screen.queryByText("Other recipient")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Nguyễn An")).toBeVisible();
    expect(api).toHaveBeenCalledTimes(3);
  },
);

it.each([
  ["forbidden", 403],
  ["session_changed", 409],
])("retires protected data after %s while cancelling", async (message, status) => {
  const item = storeOrderFixture({ expires_at: null });
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockRejectedValueOnce(Object.assign(new Error(message), { status }));
  renderOrder(item.id);
  await screen.findByText("Nguyễn An");
  fireEvent.click(cancelOrder());
  await screen.findByRole("alert");
  expect(screen.queryByText("Nguyễn An")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Lý do hủy")).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(2);
});

it("does not retire readable order details when a write fails the CSRF check", async () => {
  const item = storeOrderFixture({ expires_at: null });
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockRejectedValueOnce(Object.assign(new Error("csrf_rejected"), { status: 403 }));
  renderOrder(item.id);
  await screen.findByText("Nguyễn An");
  fireEvent.click(cancelOrder());
  expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeVisible();
  expect(screen.getByText("Nguyễn An")).toBeInTheDocument();
});

it.each([
  ["HTTP 408", Object.assign(new Error("request_failed"), { status: 408 })],
  ["HTTP 502", Object.assign(new Error("unavailable"), { status: 502 })],
  ["invalid envelope", new Error("invalid_response")],
])("keeps a single cancel intent for an explicit replay after %s", async (_, outcome) => {
  const item = storeOrderFixture({ expires_at: null });
  vi.mocked(api).mockResolvedValueOnce(item);
  if (outcome instanceof Error) vi.mocked(api).mockRejectedValueOnce(outcome);
  else vi.mocked(api).mockResolvedValueOnce(outcome);
  vi.mocked(api).mockResolvedValueOnce({
    ...item,
    status: "cancelled",
    cancelled_at: "2026-10-31T10:01:00Z",
  });
  renderOrder(item.id);
  await screen.findByText("Nguyễn An");
  const confirm = cancelOrder();
  fireEvent.click(confirm);
  const dialog = screen.getByRole("dialog");
  await within(dialog).findByRole("alert");
  expect(within(dialog).getByLabelText("Lý do hủy")).toBeDisabled();
  expect(screen.queryByText("Other recipient")).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(2);
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const [first, second] = vi.mocked(api).mock.calls.slice(1);
  expect(first[0]).toBe(`admin/store-orders/${item.id}/cancel`);
  expect(second[0]).toBe(first[0]);
  expect(second[1]?.body).toBe(first[1]?.body);
});

it("replays the submitted bytes after leaving the route before a lost response", async () => {
  const item = storeOrderFixture({ expires_at: null });
  let rejectMutation!: (error: Error) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectMutation = reject;
        }),
    )
    .mockResolvedValueOnce(otherOrder)
    .mockResolvedValueOnce(item)
    .mockResolvedValueOnce({ ...item, status: "cancelled", cancelled_at: "2026-10-31T10:01:00Z" });
  const view = renderOrder(item.id);
  await screen.findByText("Nguyễn An");
  fireEvent.click(cancelOrder());
  view.rerender(orderTree(otherOrder.id));
  await screen.findByText("Other recipient");
  await act(async () => rejectMutation(new Error("request_timeout")));
  view.rerender(orderTree(item.id));
  fireEvent.click(await screen.findByRole("button", { name: "Hủy đơn" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Lý do hủy")).toHaveValue("Hết hàng");
  fireEvent.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const writes = vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "POST");
  expect(writes).toHaveLength(2);
  expect(writes[1][1]?.body).toBe(writes[0][1]?.body);
});

it("keeps a stale readable snapshot after a network read error but blocks actions", async () => {
  const item = storeOrderFixture({ expires_at: null });
  vi.mocked(api).mockResolvedValueOnce(item).mockRejectedValueOnce(new Error("network_error"));
  renderOrder(item.id);
  await screen.findByText("Nguyễn An");
  fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Nguyễn An")).toBeVisible();
  expect(screen.getByRole("button", { name: "Hủy đơn" })).toBeDisabled();
});

it.each([401, 403])("shows an initial HTTP %i without protected details", async (status) => {
  vi.mocked(api).mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status }));
  renderOrder();
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByText("Nguyễn An")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
});

it("ignores an obsolete GET after switching order routes", async () => {
  const item = storeOrderFixture({ expires_at: null });
  let complete!: (order: StoreOrder) => void;
  vi.mocked(api)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValueOnce(otherOrder);
  const view = renderOrder(item.id);
  await waitFor(() => expect(complete).toBeTypeOf("function"));
  const options = vi.mocked(api).mock.calls[0][2];
  view.rerender(orderTree(otherOrder.id));
  await screen.findByText("Other recipient");
  expect(options?.shouldRedirectToLogin?.()).toBe(false);
  await act(async () => complete(item));
  expect(screen.getByText("Other recipient")).toBeVisible();
  expect(screen.queryByText("Nguyễn An")).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(2);
});

it("only lets a newer verified read restore the same route after access loss", async () => {
  const item = storeOrderFixture({ expires_at: null });
  const response = { ...item, reference_code: "VERIFIED-ORDER" };
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockRejectedValueOnce(Object.assign(new Error("session_changed"), { status: 409 }))
    .mockResolvedValueOnce(response);
  renderOrder(item.id);
  await screen.findByText("Nguyễn An");
  fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("Nguyễn An")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("heading", { name: "VERIFIED-ORDER" })).toBeVisible();
});

it("preserves only the exact submitted intent across a bad read and CSRF rejection of its replay", async () => {
  const item = storeOrderFixture({ expires_at: null });
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockRejectedValueOnce(Object.assign(new Error("request_failed"), { status: 408 }))
    .mockResolvedValueOnce(otherOrder)
    .mockResolvedValueOnce(item)
    .mockRejectedValueOnce(Object.assign(new Error("csrf_rejected"), { status: 403 }))
    .mockResolvedValueOnce({
      ...item,
      status: "cancelled",
      cancelled_at: "2026-10-31T10:01:00Z",
    });
  renderOrder(item.id);
  await screen.findByText("Nguyễn An");
  fireEvent.click(cancelOrder());
  await within(screen.getByRole("dialog")).findByRole("alert");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("Nguyễn An")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  fireEvent.click(await screen.findByRole("button", { name: "Hủy đơn" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Lý do hủy")).toHaveValue("Hết hàng");
  const replay = within(dialog).getByRole("button", { name: "Hủy đơn" });
  fireEvent.click(replay);
  await within(dialog).findByRole("alert");
  expect(within(dialog).getByLabelText("Lý do hủy")).toBeDisabled();
  fireEvent.click(replay);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const attempts = vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "POST");
  expect(attempts).toHaveLength(3);
  expect(new Set(attempts.map(([, init]) => init?.body)).size).toBe(1);
});
