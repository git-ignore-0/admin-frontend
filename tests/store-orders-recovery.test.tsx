import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { StoreOrderDetail } from "@/components/store-order-detail";
import { ToastProvider } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { storeOrderFixture } from "@/tests/store-orders-fixture";
import type { StoreOrder } from "@/lib/types";
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
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
const renderOrder = () =>
  render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <StoreOrderDetail orderId="id" />
      </ToastProvider>
    </AdminI18nProvider>,
  );

it("a late expiry GET must not roll back a successful delivery", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
  const initial = storeOrderFixture({
    status: "pending_delivery",
    payment_status: "received",
    server_time: "2026-11-02T00:00:00Z",
    expires_at: "2026-11-02T00:01:00Z",
  });
  let resolveMutation!: (value: StoreOrder) => void;
  let resolveGet!: (value: StoreOrder) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(initial)
    .mockImplementationOnce(
      () =>
        new Promise<StoreOrder>((resolve) => {
          resolveMutation = resolve;
        }) as never,
    )
    .mockImplementationOnce(
      () =>
        new Promise<StoreOrder>((resolve) => {
          resolveGet = resolve;
        }) as never,
    );
  renderOrder();
  fireEvent.click(await screen.findByRole("button", { name: "Xác nhận đã giao" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận đã giao" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(api).toHaveBeenCalledTimes(3);
  await act(async () => {
    resolveMutation({ ...initial, status: "delivered" });
  });
  expect(screen.getByText("Đã giao", { selector: ".status" })).toBeVisible();
  await act(async () => {
    resolveGet(initial);
  });
  expect(screen.getByText("Đã giao", { selector: ".status" })).toBeVisible();
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
        id: "allocation",
        line_id: storeOrderFixture().lines[0].id,
        batch_id: "batch",
        quantity: 3,
        product_id: "product",
        farm_id: "farm",
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
    const reconciled = {
      ...initial,
      allocations: [
        {
          ...initial.allocations![0],
          restocked_quantity: completed,
          restock_remaining_quantity: 3 - completed,
          restock_eligible: true,
          restock_unavailable_reason: null,
        },
      ],
    };
    vi.mocked(api)
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(reconciled)
      .mockResolvedValueOnce(reconciled);
    renderOrder();
    fireEvent.click(await screen.findByRole("button", { name: "Hoàn tồn" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton"), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hoàn tồn" }));
    await within(dialog).findByRole("alert");
    const first = JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body));
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    fireEvent.click(screen.getByRole("button", { name: "Tải lại đơn và nguồn" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tải lại đơn và nguồn" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tồn" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton"), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hoàn tồn" }));
    const second = JSON.parse(String(vi.mocked(api).mock.calls[3][1]?.body));
    expect(second.allocations).toEqual(first.allocations);
    expect(second.idempotency_key === first.idempotency_key).toBe(completed === 0);
  },
);

it("keeps the same restock intent key when a background GET updates the ledger inside its dialog", async () => {
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
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(reconciled)
    .mockResolvedValueOnce(reconciled);
  renderOrder();
  fireEvent.click(await screen.findByRole("button", { name: "Hoàn tồn" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("spinbutton"), { target: { value: "1" } });
  const confirm = within(dialog).getByRole("button", { name: "Hoàn tồn" });
  fireEvent.click(confirm);
  await within(dialog).findByRole("alert");
  const first = JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(api).toHaveBeenCalledTimes(3);
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  const second = JSON.parse(String(vi.mocked(api).mock.calls[3][1]?.body));
  expect(second.idempotency_key).toBe(first.idempotency_key);
});
