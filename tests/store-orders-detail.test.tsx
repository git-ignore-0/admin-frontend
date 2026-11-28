import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { StoreOrderDetail } from "@/components/store-order-detail";
import { ToastProvider } from "@/components/toast-provider";
import { adminDictionaries, type AdminLocale } from "@/lib/admin-i18n";
import { adminNavigation, resolveAdminBreadcrumbs } from "@/lib/admin-navigation";
import { api } from "@/lib/client-api";
import layout from "@/components/store-order-detail.module.css";
import { sourceLineFixture, storeOrderFixture } from "@/tests/store-orders-fixture";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: () => ({ provinceName: null, wardName: null }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-orders/11111111-1111-4111-8111-111111111111",
}));

const batchA = "00000000-0000-4000-8000-0000000000a1";
const batchB = "00000000-0000-4000-8000-0000000000a2";
const farmA = "00000000-0000-4000-8000-0000000000b1";
const farmB = "00000000-0000-4000-8000-0000000000b2";
const farmC = "00000000-0000-4000-8000-0000000000b3";
const allocationA = "00000000-0000-4000-8000-0000000000c1";

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
      { line_id: item.lines[0].id, batch_id: batchA, quantity: 2 },
      { line_id: item.lines[0].id, batch_id: batchB, quantity: 1 },
    ],
    source_inventory: {
      refresh_required_before_approve: true,
      lines: [
        sourceLineFixture(
          item.lines[0],
          [
            { farm_id: farmA, farm_name: "Vườn A", available_quantity: 4, eligible: true },
            { farm_id: farmB, farm_name: "Vườn B", available_quantity: 6, eligible: true },
            { farm_id: farmC, farm_name: "Vườn C", available_quantity: 2, eligible: false },
          ],
          farmA,
          farmC,
        ),
      ],
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
          farm_id: farmA,
          farm_name: "Vườn A",
          batch_id: batchA,
          start_date: "2026-10-29",
          end_date: "2026-11-01",
          available_quantity: 2,
        },
        {
          line_id: item.lines[0].id,
          product_id: item.lines[0].product_id,
          farm_id: farmB,
          farm_name: "Vườn B",
          batch_id: batchB,
          start_date: "2026-10-30",
          end_date: "2026-11-02",
          available_quantity: 2,
        },
      ],
    },
  };
}

function view(locale: AdminLocale = "vi") {
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>
        <AdminQueryProvider>
          {" "}
          <StoreOrderDetail orderId="11111111-1111-4111-8111-111111111111" />{" "}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

describe("Store order detail", () => {
  it("shows an initial load failure with a clear retry path", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("network_error"));
    view();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Không thể kết nối/);
    expect(within(alert).getByRole("button", { name: "Thử lại" })).toBeVisible();
  });

  it("renders recipient, product snapshots, paid totals, transfer data, farm options and timeline", async () => {
    vi.mocked(api).mockResolvedValue(detailOrder());
    view();

    expect(await screen.findByRole("heading", { name: "NFV-STORE-001" })).toBeVisible();
    expect(screen.getByText("Nguyễn An")).toBeVisible();
    const productPanel = screen.getByRole("region", { name: "Sản phẩm" });
    expect(within(productPanel).getByText("RAU-01").parentElement).toHaveTextContent(
      "RAU-01 · 0.5 kg",
    );
    expect(screen.queryByText("Quyền lợi CSA: 0 sản phẩm · 0 lượt")).not.toBeInTheDocument();
    expect(screen.getAllByText("Rau muống")).toHaveLength(1);
    expect(screen.getByText("Tiền hàng")).toBeVisible();
    expect(screen.getAllByText(/90\.000/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Thông tin chuyển khoản" })).toBeVisible();
    expect(screen.getByText("NFVSTORE001")).toBeVisible();
    expect(screen.queryByText(/Đơn này giữ/)).not.toBeInTheDocument();
    expect(screen.queryByText("Xem lịch sử")).not.toBeInTheDocument();
    expect(screen.getByText("Khách báo đã chuyển khoản", { selector: "dt" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Làm mới" })).toHaveClass("mantine-ActionIcon-root");
    const editor = screen.getByRole("region", { name: "Sản phẩm" });
    const select = within(editor).getByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
    expect(select).toHaveValue("Vườn A · Còn 4");
    expect(within(editor).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(editor).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(select);
    const unavailable = screen.getByRole("option", { name: /Vườn C.*Còn 2/ });
    expect(unavailable).toHaveAttribute("data-combobox-disabled");
    expect(unavailable.closest("[role=listbox]")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Vườn A.*Còn 4/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows transfer details and history for delivered orders without disclosure controls", async () => {
    vi.mocked(api).mockResolvedValue({ ...detailOrder(), status: "delivered" });
    const { container } = view();
    expect(await screen.findByRole("heading", { name: "Thông tin chuyển khoản" })).toBeVisible();
    expect(screen.getByText("NFVSTORE001")).toBeVisible();
    expect(screen.getByText("Khách báo đã chuyển khoản", { selector: "dt" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xem chi tiết" })).not.toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
  });

  it("gives delivery primary emphasis in the header of an approved order", async () => {
    vi.mocked(api).mockResolvedValue({
      ...detailOrder(),
      status: "pending_delivery",
      payment_status: "received",
    });
    view();
    const heading = await screen.findByRole("heading", { name: "NFV-STORE-001", level: 1 });
    const header = within(heading.closest("header")!);
    const actions = header.getByRole("group", { name: "Thao tác đơn hàng" });
    const buttons = within(actions).getAllByRole("button");
    expect(buttons.at(-1)).toHaveTextContent("Xác nhận đã giao");
    expect(buttons.at(-1)).toHaveAttribute("data-variant", "filled");
    expect(header.getByRole("button", { name: "Làm mới" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: /Trang trại cung cấp/ })).not.toBeInTheDocument();
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

    expect(
      await screen.findByText("Chờ duyệt", {
        selector: ".store-order-status .mantine-Badge-label",
      }),
    ).toBeVisible();
    const header = screen.getByRole("heading", { name: "NFV-STORE-001" }).closest("header")!;
    expect(header.querySelectorAll(".mantine-Badge-root")).toHaveLength(1);
    expect(screen.queryByText("Dùng điểm CSA")).not.toBeInTheDocument();
    const total = within(screen.getByRole("complementary")).getByText("Tổng phải trả");
    expect(within(total.parentElement!).getByText(/^0\s*₫$/u)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Thông tin chuyển khoản" }),
    ).not.toBeInTheDocument();
  });

  it("uses server time for the pending-review deadline and keeps countdown out of live regions", async () => {
    vi.mocked(api).mockResolvedValue({
      ...detailOrder(),
      expires_at: "2026-10-31T18:00:00Z",
    });
    view();

    expect(await screen.findByText("Hạn duyệt đơn")).toBeVisible();
    const countdown = screen.getByText("Còn 8 giờ");
    expect(countdown).toBeVisible();
    expect(countdown.closest("[aria-live]")).toBeNull();
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
    expect(
      screen.getByText("Chờ thanh toán", { selector: ".store-order-status .mantine-Badge-label" }),
    ).toBeVisible();
    expect(screen.getByText("Còn 5 phút")).toBeVisible();
  });

  it("keeps allocated Farm batches in Products and restock progress in the action dialog", async () => {
    const item = detailOrder();
    vi.mocked(api).mockResolvedValue({
      ...item,
      status: "cancelled",
      payment_status: "refunded",
      approved_at: "2026-10-31T10:01:00Z",
      cancelled_at: "2026-10-31T10:02:00Z",
      allocations: [
        {
          id: allocationA,
          line_id: item.lines[0].id,
          product_id: item.lines[0].product_id,
          batch_id: batchA,
          farm_id: farmA,
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

    expect(await screen.findByRole("heading", { name: "NFV-STORE-001", level: 1 })).toBeVisible();
    const products = screen.getByRole("region", { name: "Sản phẩm" });
    const source = within(products).getByRole("group", { name: "Trang trại cung cấp" });
    expect(within(source).getByText("Vườn A")).toBeVisible();
    expect(within(source).getByText("29/10/2026 – 01/11/2026")).toBeVisible();
    expect(source).not.toHaveTextContent(/hoàn tồn|hoàn thêm|SL:|Đã phân bổ/iu);
    expect(screen.getByText("Còn hàng có thể hoàn tồn kho")).toBeVisible();
    expect(screen.queryByText("Cần hoàn tiền")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tồn kho" }));
    const dialog = await screen.findByRole("dialog", { name: "Hoàn tồn kho" });
    expect(within(dialog).getByText(/Có thể hoàn thêm 2/)).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: /^Số lượng hoàn/ })).toBeEnabled();
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

  it("keeps the selected farm and refreshes its label without fetching on Select change", async () => {
    const first = detailOrder();
    const [source] = first.source_inventory.lines;
    const refreshed = {
      ...first,
      source_inventory: {
        ...first.source_inventory,
        lines: [
          {
            ...source,
            farms: source.farms.map((farm) =>
              farm.farm_id === farmB ? { ...farm, available_quantity: 5 } : farm,
            ),
          },
        ],
      },
    };
    vi.mocked(api).mockResolvedValueOnce(first).mockResolvedValueOnce(refreshed);
    view();

    const select = await screen.findByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
    expect(select).toHaveValue("Vườn A · Còn 4");
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: /Vườn B.*Còn 6/ }));
    expect(select).toHaveValue("Vườn B · Còn 6");
    expect(api).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(select).toHaveValue("Vườn B · Còn 5"));
    expect(screen.getByRole("combobox", { name: /Trang trại cung cấp Rau muống/ })).toBe(select);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("keeps the snapshot and selected farm on a recoverable refresh error", async () => {
    const first = detailOrder();
    vi.mocked(api)
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(first);
    view();

    const select = await screen.findByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: /Vườn B.*Còn 6/ }));
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Không thể kết nối/);
    expect(alert).toHaveTextContent(/chưa được làm mới/i);
    expect(select).toHaveValue("Vườn B · Còn 6");
    expect(select).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();

    fireEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue("Vườn B · Còn 6");
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeEnabled();
    expect(api).toHaveBeenCalledTimes(3);
  });

  it.each(["removed", "ineligible"])(
    "keeps a %s selection stale after refresh without switching farms",
    async (status) => {
      const first = detailOrder();
      const [source] = first.source_inventory.lines;
      vi.mocked(api)
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce({
          ...first,
          source_inventory: {
            ...first.source_inventory,
            lines: [
              {
                ...source,
                suggested_farm_id: farmB,
                farms:
                  status === "removed"
                    ? source.farms.filter((farm) => farm.farm_id !== farmA)
                    : source.farms.map((farm) =>
                        farm.farm_id === farmA
                          ? { ...farm, available_quantity: 1, eligible: false }
                          : farm,
                      ),
              },
            ],
          },
        });
      view();

      const select = await screen.findByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
      fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
      await waitFor(() => expect(select).toHaveAttribute("aria-invalid", "true"));
      expect(select).toHaveValue(status === "removed" ? "" : "Vườn A · Còn 1");
      expect(select).toHaveAccessibleDescription(
        status === "removed"
          ? "Trang trại đã chọn không còn khả dụng. Vui lòng chọn lại."
          : "Trang trại đã chọn không còn đáp ứng đủ số lượng. Vui lòng chọn lại.",
      );
      expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Hủy đơn" })).toBeEnabled();
    },
  );

  it.each([false, true])(
    "explains a missing selection with eligible options = %s",
    async (eligible) => {
      const first = detailOrder();
      const [source] = first.source_inventory.lines;
      vi.mocked(api).mockResolvedValueOnce({
        ...first,
        source_inventory: {
          ...first.source_inventory,
          lines: [{ ...source, suggested_farm_id: null, farms: eligible ? source.farms : [] }],
        },
      });
      view();
      const select = await screen.findByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
      expect(select).toHaveValue("");
      expect(select).toHaveAccessibleDescription(
        eligible
          ? "Chọn trang trại cung cấp."
          : "Không có trang trại nào đáp ứng đủ số lượng sản phẩm này.",
      );
      expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Hủy đơn" })).toBeEnabled();
    },
  );

  it("clears retired Farm choices when CSA reselection replaces the order line", async () => {
    const first = detailOrder();
    const [line] = first.lines;
    const [source] = first.source_inventory.lines;
    const roundId = "a1123456-0000-4000-8000-000000000000";
    const selectionId = "b1123456-0000-4000-8000-000000000000";
    const membershipId = "c1123456-0000-4000-8000-000000000000";
    const orderWithCSA = {
      ...first,
      expires_at: null,
      csa: {
        round: {
          id: roundId,
          name: "CSA tháng 11",
          status: "closed",
          sequence: 1,
          opens_at: first.server_time,
          closes_at: first.server_time,
          delivery_date: "2026-11-02",
          server_time: first.server_time,
        },
        selection: {
          id: selectionId,
          round_id: roundId,
          order_id: first.id,
          membership_id: membershipId,
          state: "locked",
          revision: 1,
          reopen_until: null,
          server_time: first.server_time,
          lines: [],
        },
      },
    };
    const second = { ...line, id: "d1123456-0000-4000-8000-000000000000", name: "Cà chua" };
    vi.mocked(api)
      .mockResolvedValueOnce(orderWithCSA)
      .mockResolvedValueOnce({
        ...orderWithCSA,
        csa: {
          ...orderWithCSA.csa,
          selection: { ...orderWithCSA.csa.selection, state: "reselecting", revision: 2 },
        },
        source_inventory: {
          ...first.source_inventory,
          lines: [sourceLineFixture(line)],
          candidates: [],
        },
        allocation_suggestion: [],
      })
      .mockResolvedValueOnce({
        ...orderWithCSA,
        csa: {
          ...orderWithCSA.csa,
          selection: { ...orderWithCSA.csa.selection, state: "confirmed", revision: 3 },
        },
        lines: [second],
        source_inventory: {
          ...first.source_inventory,
          lines: [sourceLineFixture(second, source.farms, farmA)],
          candidates: [],
        },
        allocation_suggestion: [],
      });
    view();
    const previous = await screen.findByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
    fireEvent.click(previous);
    fireEvent.click(screen.getByRole("option", { name: /Vườn B.*Còn 6/ }));
    expect(previous).toHaveValue("Vườn B · Còn 6");
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(previous).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Duyệt đơn" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    expect(
      await screen.findByRole("combobox", { name: /Trang trại cung cấp Cà chua/ }),
    ).toHaveValue("Vườn A · Còn 4");
    expect(api).toHaveBeenCalledTimes(3);
  });
});

it.each([
  ["vi", "Đơn hàng", "Chi tiết đơn hàng", "Sản phẩm"],
  ["en", "Orders", "Order details", "Products"],
] as const)(
  "uses the AdminShell %s breadcrumb and one content heading",
  async (locale, parent, detail, products) => {
    const item = detailOrder();
    const dictionary = adminDictionaries[locale];
    const orders = adminNavigation(dictionary)
      .flatMap(({ items }) => items)
      .find(({ href }) => href === "/store-orders");
    expect(resolveAdminBreadcrumbs(`/store-orders/${item.id}`, orders, dictionary)).toEqual([
      { label: parent, href: "/store-orders" },
      { label: detail },
    ]);
    vi.mocked(api).mockResolvedValue(item);
    view(locale);

    expect(
      await screen.findByRole("heading", { level: 1, name: item.reference_code }),
    ).toBeVisible();
    expect(screen.getAllByText(item.reference_code)).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: detail })).toBeNull();
    expect(screen.queryByRole("link", { name: /Danh sách đơn hàng|Store orders/u })).toBeNull();
    const productPanel = screen.getByRole("region", { name: products });
    expect(within(productPanel).getAllByRole("listitem")).toHaveLength(1);
    expect(within(productPanel).queryByRole("table")).toBeNull();
  },
);

it("keeps the farm draft and DOM input while the measured content crosses 880px", async () => {
  const listeners = new Map<Element, (width: number) => void>();
  const Observer = window.ResizeObserver;
  window.ResizeObserver = class extends Observer {
    private element?: Element;
    constructor(private callback: ResizeObserverCallback) {
      super(callback);
    }
    observe(element: Element) {
      this.element = element;
      listeners.set(element, (width) =>
        this.callback([{ target: element, contentRect: { width } } as ResizeObserverEntry], this),
      );
    }
    disconnect() {
      if (this.element) listeners.delete(this.element);
    }
  };
  try {
    vi.mocked(api).mockResolvedValue(detailOrder());
    view();
    const input = await screen.findByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
    const products = screen.getByRole("region", { name: "Sản phẩm" });
    const grid = products.closest(".mantine-Grid-inner")!;
    const content = screen.getByRole("heading", { level: 1 }).closest("header")!.parentElement!;
    const setWidth = listeners.get(content)!;
    const sidebar = screen.getByRole("complementary");
    const timeline = screen.getByRole("region", { name: "Lịch sử xử lý" });
    expect(
      products.compareDocumentPosition(sidebar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sidebar.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(input);
    fireEvent.click(screen.getByRole("option", { name: /Vườn B.*Còn 6/ }));
    act(() => input.focus());
    expect(input).toHaveFocus();

    act(() => setWidth(880));
    await waitFor(() => expect(grid).toHaveClass(layout.desktopGrid));
    act(() => setWidth(879));
    await waitFor(() => expect(grid).not.toHaveClass(layout.desktopGrid));
    expect(screen.getByRole("combobox", { name: /Trang trại cung cấp Rau muống/ })).toBe(input);
    expect(input).toHaveValue("Vườn B · Còn 6");
    expect(input).toHaveFocus();
    expect(api).toHaveBeenCalledTimes(1);
  } finally {
    window.ResizeObserver = Observer;
  }
});
