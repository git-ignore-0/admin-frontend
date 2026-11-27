import { selectOption } from "@/tests/select-option";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { StoreOrderDetail } from "@/components/store-order-detail";
import { ToastProvider } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { isAllowedBackendRequest } from "@/lib/backend-target";
import type { StoreOrder } from "@/lib/types";
import { storeOrderFixture } from "@/tests/store-orders-fixture";
vi.mock("@/lib/client-api", async () => {
  const { createStoreOrderApiMock } = await import("@/tests/store-orders-fixture");
  return createStoreOrderApiMock();
});
vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: () => ({ provinceName: null, wardName: null }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => {
  vi.mocked(api).mockReset();
  let n = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function localeControl() {
  return <LocaleButton />;
}
function LocaleButton() {
  const { setLocale } = useAdminI18n();
  return <button onClick={() => setLocale("en")}>English</button>;
}
function tree(id: string) {
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        {localeControl()}
        <AdminQueryProvider>
          {" "}
          <StoreOrderDetail orderId={id} />{" "}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
}
function row(overrides: Partial<StoreOrder> = {}) {
  const base = storeOrderFixture();
  return {
    ...base,
    workflow_version: 2,
    refund_status: null,
    payment_received_at: null,
    refunded_at: null,
    refund_note: "",
    refund_request_closed_reason: "",
    ...overrides,
  } as StoreOrder;
}
function approved(overrides: Partial<StoreOrder> = {}) {
  return row({ status: "payment_pending", approved_at: "2026-10-31T09:50:00Z", ...overrides });
}

it.each([false, true])(
  "recovers a failed expiry GET inside the open receipt dialog, preserving draft and unknown intent=%s",
  async (unknown) => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    let finish!: (value: unknown) => void;
    const item = approved({ expires_at: "2026-10-31T10:01:00Z" });
    const next = { ...item, status: "cancelled", refund_status: "pending", expires_at: null };
    vi.mocked(api).mockResolvedValueOnce(item);
    if (unknown) vi.mocked(api).mockRejectedValueOnce(new Error("network_error"));
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...next,
        payment_status: "refund_required",
        payment_received_at: "2026-10-31T10:01:00Z",
      });
    render(tree(item.id));
    await act(async () => {});
    const modal = await dialog("Ghi nhận đã nhận tiền");
    fireEvent.change(within(modal).getByRole("textbox"), { target: { value: "receipt ref 123" } });
    if (unknown) {
      fireEvent.click(within(modal).getByRole("button", { name: "Ghi nhận đã nhận tiền" }));
      await act(async () => {});
    }
    await act(async () => {
      elapsed = 60_000;
      vi.advanceTimersByTime(60_000);
    });
    expect(within(modal).getByRole("button", { name: "Ghi nhận đã nhận tiền" })).toBeDisabled();
    expect(within(modal).getAllByRole("alert")[0]).toBeVisible();
    fireEvent.click(within(modal).getByRole("button", { name: "Thử lại" }));
    expect(within(modal).getByRole("status")).toBeVisible();
    expect(within(modal).getByRole("button", { name: "Ghi nhận đã nhận tiền" })).toBeDisabled();
    await act(async () => finish(next));
    expect(screen.getByRole("dialog")).toBe(modal);
    expect(within(modal).getByRole("textbox")).toHaveValue("receipt ref 123");
    const posts = () => vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts()).toHaveLength(unknown ? 1 : 0);
    if (unknown) {
      expect(within(modal).getByRole("textbox")).toBeDisabled();
      expect(within(modal).getByRole("alert")).toBeVisible();
    }
    expect(within(modal).getByRole("button", { name: "Xử lý đối soát" })).toBeEnabled();
    fireEvent.click(within(modal).getByRole("button", { name: "Xử lý đối soát" }));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    const calls = posts();
    expect(calls).toHaveLength(unknown ? 2 : 1);
    expect(JSON.parse(String(calls.at(-1)?.[1]?.body))).toMatchObject({ note: "receipt ref 123" });
    if (unknown) expect(calls[1]).toEqual(calls[0]);
  },
);
async function dialog(label: string) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
  return screen.getByRole("dialog");
}

it("buyer cancellation before v2 goods approval offers no receipt or refund actions", async () => {
  const item = row({ payment: null, approved_at: null });
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockResolvedValueOnce({
      ...item,
      status: "cancelled",
      refund_status: null,
      expires_at: null,
      cancellation_reason: "buyer_cancelled",
    });
  render(tree(item.id));
  await screen.findByRole("button", { name: "Xác nhận đủ hàng" });
  fireEvent.click(screen.getByRole("button", { name: "Tải lại đơn và nguồn" }));
  await screen.findByText("Đã hủy", { selector: ".mantine-Badge-label" });
  for (const name of ["Ghi nhận đã nhận tiền", "Xác nhận hoàn tiền", "Xác minh không có tiền"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByText("Chờ hoàn", { selector: ".mantine-Badge-label" })).toBeNull();
  expect(api).toHaveBeenCalledTimes(2);
});

it("BFF accepts only exact POST close-refund-request UUID path", () => {
  const path = [
    "admin",
    "store-orders",
    "24803641-2dce-4cac-8fc4-91e55f03e95f",
    "close-refund-request",
  ];
  expect(isAllowedBackendRequest("POST", path)).toBe(true);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"])
    expect(isAllowedBackendRequest(method, path)).toBe(false);
  expect(isAllowedBackendRequest("POST", [...path, "extra"])).toBe(false);
  expect(isAllowedBackendRequest("POST", [...path.slice(0, 2), "bad", path[3]])).toBe(false);
  for (const action of ["report-transfer", "request-refund"])
    expect(isAllowedBackendRequest("POST", [...path.slice(0, 3), action])).toBe(false);
});

it.each([null, "2026-10-31T09:59:00Z"])(
  "unverified refund claim closes with required reason regardless of buyer report %s",
  async (transfer_reported_at) => {
    const item = row({
      status: "cancelled",
      refund_status: "pending",
      transfer_reported_at,
      payment: null,
      refund_requested_at: "2026-10-31T10:01:00Z",
      expires_at: null,
    });
    vi.mocked(api)
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce({
        ...item,
        refund_status: null,
        refund_request_closed_at: "2026-10-31T10:02:00Z",
        refund_request_closed_reason: "Không có khoản nhận",
      });
    render(tree(item.id));
    expect(await screen.findByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xác nhận hoàn tiền" })).toBeNull();
    const modal = await dialog("Xử lý đối soát");
    selectOption(within(modal).getByRole("combobox"), "close-refund-request");
    const confirm = within(modal).getByRole("button", { name: "Xác nhận đối soát" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(modal).getByRole("textbox"), {
      target: { value: "Không có khoản nhận" },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(vi.mocked(api).mock.calls[1][0]).toBe(
      `admin/store-orders/${item.id}/close-refund-request`,
    );
    expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toEqual({
      idempotency_key: expect.any(String),
      reason: "Không có khoản nhận",
    });
    expect(screen.getByText("Không có khoản nhận")).toBeVisible();
    expect(screen.queryByText("Chờ hoàn", { selector: ".mantine-Badge-label" })).toBeNull();
  },
);

it("renders payment history from top-level fields even when payment is null", async () => {
  const item = row({
    status: "cancelled",
    payment: null,
    payment_status: "refunded",
    refund_status: "refunded",
    payment_received_at: "2026-10-31T10:01:00Z",
    refund_requested_at: "2026-10-31T10:02:00Z",
    refunded_at: "2026-10-31T10:03:00Z",
    refund_note: "Đã chuyển hoàn",
    expires_at: null,
  });
  vi.mocked(api).mockResolvedValueOnce(item);
  render(tree(item.id));
  expect(await screen.findByText("Admin ghi nhận tiền")).toBeVisible();
  expect(screen.getByText("Mở đối soát lúc")).toBeVisible();
  expect(screen.getByText("Hoàn tiền lúc")).toBeVisible();
  expect(screen.getByText("Đã chuyển hoàn")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Xác nhận hoàn tiền" })).toBeNull();
});

it("late receipt after elapsed payment deadline renders cancelled plus refund without delivery", async () => {
  const item = approved({
    server_time: "2026-10-31T10:00:00Z",
    expires_at: "2026-10-31T09:59:00Z",
  });
  const cancelled = {
    ...item,
    status: "cancelled",
    payment_status: "refund_required",
    refund_status: "pending",
    expires_at: null,
    payment_received_at: "2026-10-31T10:00:00Z",
  } as StoreOrder;
  vi.mocked(api).mockImplementation((_path, options) =>
    Promise.resolve(options?.method === "POST" ? cancelled : item),
  );
  render(tree(item.id));
  const modal = await dialog("Ghi nhận đã nhận tiền");
  const confirm = within(modal).getByRole("button", { name: "Ghi nhận đã nhận tiền" });
  // An already elapsed deadline also refreshes the snapshot in the background.
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  expect(await screen.findByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.getByText("Chờ hoàn", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Xác nhận đã giao" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Xác minh không có tiền" })).toBeNull();
});

it("unknown receipt keeps exact intent despite edit, locale and retry", async () => {
  const item = approved();
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce({
      ...item,
      status: "pending_delivery",
      payment_status: "received",
      payment_received_at: "2026-10-31T10:03:00Z",
      expires_at: null,
    });
  render(tree(item.id));
  const modal = await dialog("Ghi nhận đã nhận tiền");
  fireEvent.change(within(modal).getByRole("textbox"), { target: { value: "Bank checked" } });
  fireEvent.click(within(modal).getByRole("button", { name: "Ghi nhận đã nhận tiền" }));
  await within(modal).findByRole("alert");
  expect(within(modal).getByRole("textbox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  const next = screen.getByRole("dialog");
  fireEvent.click(within(next).getByRole("button", { name: /Record.*payment/i }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const writes = vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "POST");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(screen.getByText("Pending delivery", { selector: ".mantine-Badge-label" })).toBeVisible();
});

it("late mutation from previous order never overwrites the next order", async () => {
  const first = approved();
  const second = row({
    id: "44444444-4444-4444-8444-444444444444",
    reference_code: "NEXT-ORDER",
    payment: null,
    status: "pending_review",
  });
  let finish!: (value: StoreOrder) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(first)
    .mockImplementationOnce(
      () =>
        new Promise<StoreOrder>((resolve) => {
          finish = resolve;
        }) as never,
    )
    .mockResolvedValueOnce(second);
  const view = render(tree(first.id));
  const modal = await dialog("Ghi nhận đã nhận tiền");
  fireEvent.click(within(modal).getByRole("button", { name: "Ghi nhận đã nhận tiền" }));
  view.rerender(tree(second.id));
  await screen.findByRole("heading", { name: "NEXT-ORDER" });
  await act(async () =>
    finish({
      ...first,
      status: "pending_delivery",
      payment_status: "received",
      payment_received_at: "2026-10-31T10:01:00Z",
      expires_at: null,
    }),
  );
  expect(screen.getByRole("heading", { name: "NEXT-ORDER" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: first.reference_code })).toBeNull();
});

it("server deadline ignores a later jump of the device wall clock", async () => {
  const wall = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2040-01-01T00:00:00Z"));
  vi.spyOn(performance, "now").mockReturnValue(1000);
  const item = approved();
  vi.mocked(api).mockResolvedValue(item);
  render(tree(item.id));
  expect(await screen.findByText("Còn 8 phút")).toBeVisible();
  wall.mockReturnValue(Date.parse("2050-01-01T00:00:00Z"));
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByText("8 minutes remaining")).toBeVisible();
  expect(vi.mocked(api).mock.calls.filter(([, init]) => !init?.method)).toHaveLength(1);
});

it("rechecks expiry at confirm click before the next countdown tick", async () => {
  const elapsed = vi.spyOn(performance, "now").mockReturnValue(1000);
  const item = approved({ expires_at: "2026-10-31T10:01:00Z" });
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockResolvedValueOnce({ ...item, status: "cancelled", expires_at: null });
  render(tree(item.id));
  const modal = await dialog("Hủy đơn");
  fireEvent.change(within(modal).getByLabelText("Lý do hủy"), {
    target: { value: "Không đủ hàng" },
  });
  elapsed.mockReturnValue(61_000);
  fireEvent.click(within(modal).getByRole("button", { name: "Hủy đơn" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api).mock.calls[1][1]?.method).not.toBe("POST");
  expect(await screen.findByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
});

it("refund submits the complete snapshot once and retries the identical transfer confirmation", async () => {
  const item = row({
    status: "cancelled",
    payment_status: "refund_required",
    refund_status: "pending",
    payment_received_at: "2026-10-31T10:00:00Z",
    expires_at: null,
  });
  let finish!: (value: StoreOrder) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockImplementationOnce(
      () =>
        new Promise<StoreOrder>((resolve) => {
          finish = resolve;
        }) as never,
    );
  render(tree(item.id));
  const modal = await dialog("Xử lý hoàn tiền");
  const confirm = within(modal).getByRole("button", { name: "Xử lý hoàn tiền" });
  expect(confirm).toBeDisabled();
  fireEvent.change(within(modal).getByLabelText("Ghi chú hoàn tiền"), {
    target: { value: "Đã chuyển trả đủ" },
  });
  expect(confirm).toBeDisabled();
  fireEvent.click(within(modal).getByRole("checkbox"));
  fireEvent.click(confirm);
  await within(modal).findByRole("alert");
  const original = vi.mocked(api).mock.calls[1];
  expect(JSON.parse(String(original[1]?.body))).toEqual({
    idempotency_key: expect.any(String),
    amount_vnd: "105000",
    note: "Đã chuyển trả đủ",
  });
  expect(within(modal).getByRole("checkbox")).toBeDisabled();
  expect(within(modal).getByRole("textbox")).toBeDisabled();
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  expect(vi.mocked(api).mock.calls[2]).toEqual(original);
  await act(async () =>
    finish({
      ...item,
      payment_status: "refunded",
      refund_status: "refunded",
      refunded_at: "2026-10-31T10:10:00Z",
      refund_amount_vnd: "105000",
      refund_note: "Đã chuyển trả đủ",
    }),
  );
  expect(screen.getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.getByText("Đã hoàn", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Xác nhận hoàn tiền" })).toBeNull();
});

it("separates terminal recovery from order actions and replays the exact unresolved request", async () => {
  const item = row({ payment: null, approved_at: null, expires_at: null });
  const cancelled = { ...item, status: "cancelled", cancellation_reason: "buyer_cancelled" };
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(cancelled)
    .mockRejectedValueOnce(Object.assign(new Error("store_order_state_conflict"), { status: 409 }))
    .mockResolvedValueOnce(cancelled);
  const view = render(tree(item.id));
  const modal = await dialog("Hủy đơn");
  fireEvent.change(within(modal).getByLabelText("Lý do hủy"), {
    target: { value: "Không đủ hàng" },
  });
  fireEvent.click(within(modal).getByRole("button", { name: "Hủy đơn" }));
  await within(modal).findByRole("alert");
  fireEvent.click(within(modal).getByRole("button", { name: "Đóng" }));
  fireEvent.click(screen.getByRole("button", { name: "Tải lại đơn và nguồn" }));
  await screen.findByText("Đã hủy", { selector: ".mantine-Badge-label" });
  expect(view.container.querySelector(".store-order-actions")).toBeNull();
  expect(screen.queryByRole("button", { name: "Hủy đơn" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại yêu cầu trước" }));
  const retry = screen.getByRole("dialog");
  expect(within(retry).getByLabelText("Lý do hủy")).toHaveValue("Không đủ hàng");
  expect(within(retry).getByLabelText("Lý do hủy")).toBeDisabled();
  fireEvent.click(within(retry).getByRole("button", { name: "Thử lại yêu cầu trước" }));
  await within(retry).findByRole("alert");
  expect(vi.mocked(api).mock.calls[3]).toEqual(vi.mocked(api).mock.calls[1]);
  fireEvent.click(within(retry).getByRole("button", { name: "Tải trạng thái mới" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("button", { name: "Thử lại yêu cầu trước" })).toBeNull();
  expect(view.container.querySelector(".store-order-actions")).toBeNull();
});

it("keeps delivery actions when an inactive historical deadline has elapsed", async () => {
  const item = row({
    status: "pending_delivery",
    approved_at: "2026-10-31T09:00:00Z",
    payment_status: "received",
    expires_at: "2026-10-31T09:30:00Z",
    server_time: "2026-10-31T10:00:00Z",
  });
  vi.mocked(api).mockResolvedValue(item);
  render(tree(item.id));
  expect(await screen.findByRole("button", { name: "Xác nhận đã giao" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Hủy đơn" })).toBeEnabled();
});

it("orders admin history by timestamp across goods approval and money confirmation", async () => {
  const item = row({
    status: "pending_delivery",
    expires_at: null,
    created_at: "2026-10-31T08:00:00Z",
    approved_at: "2026-10-31T08:10:00Z",
    transfer_reported_at: "2026-10-31T08:20:00Z",
    payment_received_at: "2026-10-31T08:30:00Z",
  });
  vi.mocked(api).mockResolvedValue(item);
  const view = render(tree(item.id));
  await screen.findByText("Admin ghi nhận tiền");
  const times = [...view.container.querySelectorAll(".store-order-history dd")].map(
    (node) => node.textContent,
  );
  expect(times).toEqual([
    "31/10/2026 15:00",
    "31/10/2026 15:10",
    "31/10/2026 15:20",
    "31/10/2026 15:30",
  ]);
});

it.each([null, "2026-10-31T09:59:00Z"])(
  "reconciles a cancelled pending order through one receipt entry without requiring report %s",
  async (transfer_reported_at) => {
    const item = approved({
      status: "cancelled",
      refund_status: "pending",
      transfer_reported_at,
      expires_at: null,
    });
    const received = {
      ...item,
      payment_status: "refund_required" as const,
      payment_received_at: "2026-10-31T10:02:00Z",
    };
    vi.mocked(api).mockResolvedValueOnce(item).mockResolvedValueOnce(received);
    render(tree(item.id));
    const modal = await dialog("Xử lý đối soát");
    expect(screen.queryByRole("button", { name: "Ghi nhận đã nhận tiền" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xác minh không có tiền" })).toBeNull();
    expect(screen.getByText("Chờ đối soát", { selector: ".mantine-Badge-label" })).toBeVisible();
    const confirm = within(modal).getByRole("button", { name: "Xác nhận đối soát" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(api).toHaveBeenCalledTimes(1);
    selectOption(within(modal).getByRole("combobox"), "record-payment");
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(vi.mocked(api).mock.calls[1][0]).toBe(`admin/store-orders/${item.id}/record-payment`);
    expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toEqual({
      idempotency_key: expect.any(String),
      note: "",
    });
    expect(screen.getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(screen.getByText("Chờ hoàn", { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Xử lý hoàn tiền" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Xử lý đối soát" })).toBeNull();
  },
);

it("keeps closed no-money reconciliation final on approved v2 orders", async () => {
  const item = approved({
    status: "cancelled",
    refund_status: null,
    refund_request_closed_at: "2026-10-31T10:03:00Z",
    expires_at: null,
  });
  vi.mocked(api).mockResolvedValue(item);
  render(tree(item.id));
  await screen.findByText("Đã hủy", { selector: ".mantine-Badge-label" });
  for (const name of [
    "Xử lý đối soát",
    "Xử lý hoàn tiền",
    "Ghi nhận đã nhận tiền",
    "Xác minh không có tiền",
  ])
    expect(screen.queryByRole("button", { name })).toBeNull();
});

it.each(["record-payment", "close-refund-request"] as const)(
  "locks the reconciliation choice and retries exact %s after unknown result, reload and terminal recovery",
  async (choice) => {
    const item = approved({ status: "cancelled", refund_status: "pending", expires_at: null });
    const next = { ...item, refund_status: null, refund_request_closed_at: "2026-10-31T10:03:00Z" };
    vi.mocked(api)
      .mockResolvedValueOnce(item)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(next)
      .mockRejectedValueOnce(
        Object.assign(new Error("store_order_state_conflict"), { status: 409 }),
      )
      .mockResolvedValueOnce(next);
    const view = render(tree(item.id));
    let modal = await dialog("Xử lý đối soát");
    selectOption(within(modal).getByRole("combobox"), choice);
    fireEvent.change(within(modal).getByRole("textbox"), { target: { value: "Đã kiểm tra" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Xác nhận đối soát" }));
    await within(modal).findByRole("alert");
    expect(within(modal).getByRole("combobox")).toBeDisabled();
    expect(within(modal).getByRole("textbox")).toBeDisabled();
    const original = vi.mocked(api).mock.calls[1];
    expect(original[0]).toBe(`admin/store-orders/${item.id}/${choice}`);
    fireEvent.click(within(modal).getByRole("button", { name: "Đóng" }));
    fireEvent.click(screen.getByRole("button", { name: "Tải lại đơn và nguồn" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tải lại đơn và nguồn" })).toBeEnabled(),
    );
    expect(view.container.querySelector(".store-order-actions")).toBeNull();
    modal = await dialog("Thử lại yêu cầu trước");
    expect(within(modal).getByRole("combobox")).toHaveValue(
      choice === "record-payment" ? "Đã nhận tiền" : "Không nhận tiền",
    );
    expect(within(modal).getByRole("textbox")).toHaveValue("Đã kiểm tra");
    fireEvent.click(within(modal).getByRole("button", { name: "Thử lại yêu cầu trước" }));
    await within(modal).findByRole("alert");
    expect(vi.mocked(api).mock.calls[3]).toEqual(original);
    expect(within(modal).getByRole("button", { name: "Xác nhận đối soát" })).toBeDisabled();
    expect(within(modal).getByRole("combobox")).toBeDisabled();
    fireEvent.click(within(modal).getByRole("button", { name: "Tải trạng thái mới" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Thử lại yêu cầu trước" })).toBeNull();
    expect(view.container.querySelector(".store-order-actions")).toBeNull();
  },
);

it.each(["payment_pending", "payment_review"] as const)(
  "normal v2 %s accepts actual receipt without a buyer report and proceeds to delivery",
  async (status) => {
    const item = approved({ status, transfer_reported_at: null });
    vi.mocked(api)
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce({
        ...item,
        status: "pending_delivery",
        payment_status: "received",
        payment_received_at: "2026-10-31T10:03:00Z",
        expires_at: null,
      });
    render(tree(item.id));
    const modal = await dialog("Ghi nhận đã nhận tiền");
    fireEvent.click(within(modal).getByRole("button", { name: "Ghi nhận đã nhận tiền" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(vi.mocked(api).mock.calls[1][0]).toBe(`admin/store-orders/${item.id}/record-payment`);
    expect(screen.getByText("Chờ giao", { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Xác nhận đã giao" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Ghi nhận đã nhận tiền" })).toBeNull();
  },
);

it.each(["payment_pending", "payment_review"] as const)(
  "normal v2 %s cancellation opens reconciliation without a buyer report",
  async (status) => {
    const item = approved({ status, transfer_reported_at: null });
    vi.mocked(api)
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce({
        ...item,
        status: "cancelled",
        cancelled_at: "2026-10-31T10:03:00Z",
        refund_status: "pending",
        refund_requested_at: "2026-10-31T10:03:00Z",
        expires_at: null,
      });
    render(tree(item.id));
    const modal = await dialog("Hủy đơn");
    const confirm = within(modal).getByRole("button", { name: "Hủy đơn" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(modal).getByLabelText("Lý do hủy"), {
      target: { value: "Không đủ hàng" },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(vi.mocked(api).mock.calls[1][0]).toBe(`admin/store-orders/${item.id}/cancel`);
    expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toEqual({
      idempotency_key: expect.any(String),
      reason: "Không đủ hàng",
    });
    expect(screen.getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(screen.getByText("Chờ đối soát", { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(screen.getByText("Mở đối soát lúc")).toBeVisible();
    expect(screen.queryByText("Khách yêu cầu hoàn lúc")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(
      screen.getByText("Awaiting reconciliation", { selector: ".mantine-Badge-label" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Reconcile payment" })).toBeEnabled();
  },
);

it("cancels unapproved v2 goods with only a cancellation reason and no reconciliation note", async () => {
  const item = row({ payment: null, approved_at: null, expires_at: null });
  vi.mocked(api)
    .mockResolvedValueOnce(item)
    .mockResolvedValueOnce({
      ...item,
      status: "cancelled",
      cancelled_at: "2026-10-31T10:03:00Z",
      refund_status: null,
    });
  render(tree(item.id));
  const modal = await dialog("Hủy đơn");
  expect(within(modal).queryByLabelText("Ghi chú đối soát")).toBeNull();
  expect(within(modal).getAllByRole("textbox")).toHaveLength(1);
  fireEvent.change(within(modal).getByLabelText("Lý do hủy"), {
    target: { value: "Không có hàng" },
  });
  fireEvent.click(within(modal).getByRole("button", { name: "Hủy đơn" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toEqual({
    idempotency_key: expect.any(String),
    reason: "Không có hàng",
  });
});
