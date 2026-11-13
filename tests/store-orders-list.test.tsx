import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { StoreOrderList } from "@/components/store-order-list";
import { apiEnvelope } from "@/lib/client-api";
import { storeOrderFixture } from "@/tests/store-orders-fixture";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ apiEnvelope: vi.fn(), api: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/store-orders",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function view() {
  return render(
    <AdminI18nProvider initialLocale="vi">
      <StoreOrderList />
    </AdminI18nProvider>,
  );
}

describe("Store order list", () => {
  it("keeps payment pending visible as a filter and as the order badge", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [storeOrderFixture({ status: "payment_pending" })],
      meta: { page: 1, page_size: 20, total: 21 },
    });
    view();
    const statuses = screen.getByRole("group", { name: "Trạng thái" });
    const pending = within(statuses).getByRole("button", { name: "Chờ thanh toán" });
    expect(pending).toBeVisible();
    expect(
      await screen.findByText("Chờ thanh toán", { selector: ".store-order-status" }),
    ).toBeVisible();
    expect(screen.queryByText("Chờ khách báo chuyển tiền")).not.toBeInTheDocument();
    fireEvent.click(pending);
    await waitFor(() => {
      expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("status=payment_pending");
    });
    expect(pending).toHaveAttribute("aria-pressed", "true");
  });

  it("filters a complete all-orders snapshot locally without another loading state", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        storeOrderFixture(),
        storeOrderFixture({ id: "other", reference_code: "PAID-ORDER", status: "delivered" }),
      ],
      meta: { page: 1, page_size: 20, total: 2 },
    });
    view();
    await screen.findByText("PAID-ORDER");
    const tabs = within(screen.getByRole("group", { name: "Trạng thái" }));
    fireEvent.click(tabs.getByRole("button", { name: "Chờ duyệt" }));
    expect(screen.getByText("NFV-STORE-001")).toBeVisible();
    expect(screen.queryByText("PAID-ORDER")).not.toBeInTheDocument();
    expect(screen.queryByText("Đang tải đơn hàng…")).not.toBeInTheDocument();
    fireEvent.click(tabs.getByRole("button", { name: "Tất cả" }));
    expect(screen.getByText("PAID-ORDER")).toBeVisible();
    expect(apiEnvelope).toHaveBeenCalledTimes(1);
  });

  it("caches server-filtered pages when all-orders is only a partial page", async () => {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [storeOrderFixture()],
        meta: { page: 1, page_size: 20, total: 21 },
      })
      .mockResolvedValueOnce({
        data: [storeOrderFixture({ reference_code: "DELIVERED", status: "delivered" })],
        meta: { page: 1, page_size: 20, total: 1 },
      });
    view();
    await screen.findByText("NFV-STORE-001");
    const tabs = within(screen.getByRole("group", { name: "Trạng thái" }));
    fireEvent.click(tabs.getByRole("button", { name: "Đã giao" }));
    await screen.findByText("DELIVERED");
    fireEvent.click(tabs.getByRole("button", { name: "Tất cả" }));
    expect(screen.getByText("NFV-STORE-001")).toBeVisible();
    fireEvent.click(tabs.getByRole("button", { name: "Đã giao" }));
    expect(screen.getByText("DELIVERED")).toBeVisible();
    expect(screen.queryByText("Đang tải đơn hàng…")).not.toBeInTheDocument();
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
  });

  it("keeps refund filters distinct while cancelled includes all cancelled orders", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        storeOrderFixture({
          reference_code: "NEEDS-REFUND",
          status: "cancelled",
          payment_status: "refund_required",
        }),
        storeOrderFixture({
          id: "other",
          reference_code: "REFUNDED",
          status: "cancelled",
          payment_status: "refunded",
        }),
      ],
      meta: { page: 1, page_size: 20, total: 2 },
    });
    view();
    await screen.findByText("REFUNDED");
    const tabs = within(screen.getByRole("group", { name: "Trạng thái" }));
    fireEvent.click(tabs.getByRole("button", { name: "Chờ hoàn tiền" }));
    expect(screen.getByText("NEEDS-REFUND")).toBeVisible();
    expect(screen.queryByText("REFUNDED")).not.toBeInTheDocument();
    fireEvent.click(tabs.getByRole("button", { name: "Đã hoàn tiền" }));
    expect(screen.getByText("REFUNDED")).toBeVisible();
    expect(screen.queryByText("NEEDS-REFUND")).not.toBeInTheDocument();
    fireEvent.click(tabs.getByRole("button", { name: "Đã hủy" }));
    expect(screen.getByText("REFUNDED")).toBeVisible();
    expect(screen.getByText("NEEDS-REFUND")).toBeVisible();
    expect(apiEnvelope).toHaveBeenCalledTimes(1);
  });

  it("invalidates every cached tab with the dedicated refresh button", async () => {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [storeOrderFixture()],
        meta: { page: 1, page_size: 20, total: 1 },
      })
      .mockResolvedValueOnce({
        data: [storeOrderFixture({ status: "delivered" })],
        meta: { page: 1, page_size: 20, total: 1 },
      });
    view();
    await screen.findByText("NFV-STORE-001");
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await screen.findByText("Đã giao", { selector: ".status" });
    const tabs = within(screen.getByRole("group", { name: "Trạng thái" }));
    fireEvent.click(tabs.getByRole("button", { name: "Chờ duyệt" }));
    expect(screen.getByText("Không có đơn hàng phù hợp.")).toBeVisible();
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
  });

  it.each([20, 0])(
    "recovers page two after refreshing a filtered list whose total drops to %i",
    async (total) => {
      vi.mocked(apiEnvelope)
        .mockResolvedValueOnce({
          data: [storeOrderFixture({ reference_code: "ALL" })],
          meta: { page: 1, page_size: 20, total: 21 },
        })
        .mockResolvedValueOnce({
          data: [storeOrderFixture({ reference_code: "PENDING-1" })],
          meta: { page: 1, page_size: 20, total: 21 },
        })
        .mockResolvedValueOnce({
          data: [storeOrderFixture({ reference_code: "PENDING-2" })],
          meta: { page: 2, page_size: 20, total: 21 },
        })
        .mockResolvedValueOnce({ data: [], meta: { page: 2, page_size: 20, total } })
        .mockResolvedValueOnce({
          data: total ? [storeOrderFixture({ reference_code: "REMAINING" })] : [],
          meta: { page: 1, page_size: 20, total },
        });
      view();
      await screen.findByText("ALL");
      const pending = within(screen.getByRole("group", { name: "Trạng thái" })).getByRole(
        "button",
        { name: "Chờ duyệt" },
      );
      fireEvent.click(pending);
      await screen.findByText("PENDING-1");
      fireEvent.click(screen.getByRole("button", { name: "Sau" }));
      await screen.findByText("PENDING-2");
      fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
      if (total) expect(await screen.findByText("REMAINING")).toBeVisible();
      else await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(5));
      await waitFor(() => expect(screen.queryByText("Đang tải đơn hàng…")).not.toBeInTheDocument());
      if (total) expect(screen.queryByText("Không có đơn hàng phù hợp.")).not.toBeInTheDocument();
      else expect(screen.getByText("Không có đơn hàng phù hợp.")).toBeVisible();
      expect(pending).toHaveAttribute("aria-pressed", "true");
      const path = vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0] as string;
      expect(path).toContain("page=1&");
      expect(path).toContain("status=pending_review");
      expect(apiEnvelope).toHaveBeenCalledTimes(5);
    },
  );

  it("keeps the current page when refreshing still leaves it in range", async () => {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [storeOrderFixture({ reference_code: "FIRST" })],
        meta: { page: 1, page_size: 20, total: 21 },
      })
      .mockResolvedValueOnce({
        data: [storeOrderFixture({ reference_code: "SECOND" })],
        meta: { page: 2, page_size: 20, total: 21 },
      })
      .mockResolvedValueOnce({
        data: [storeOrderFixture({ reference_code: "UPDATED" })],
        meta: { page: 2, page_size: 20, total: 22 },
      });
    view();
    await screen.findByText("FIRST");
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await screen.findByText("SECOND");
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    expect(await screen.findByText("UPDATED")).toBeVisible();
    expect(screen.getByRole("button", { name: "Trước" })).toBeEnabled();
    expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("page=2&");
    expect(apiEnvelope).toHaveBeenCalledTimes(3);
  });

  it("renders paid and CSA-benefit orders with separate order/payment states", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        storeOrderFixture(),
        storeOrderFixture({
          id: "99999999-9999-4999-8999-999999999999",
          reference_code: "NFV-STORE-002",
          status: "pending_review",
          payment_status: "not_required",
          subtotal_vnd: "0",
          shipping_fee_vnd: "0",
          total_vnd: "0",
          payment: null,
        }),
      ],
      meta: { page: 1, page_size: 20, total: 2 },
    });
    view();

    expect(await screen.findByText("NFV-STORE-001")).toBeVisible();
    expect(
      within(screen.getByRole("group", { name: "Trạng thái" })).getByRole("button", {
        name: "Chờ thanh toán",
      }),
    ).toBeVisible();
    expect(screen.getAllByText("Chờ duyệt", { selector: ".store-order-status" })).toHaveLength(2);
    expect(screen.queryByText("Chưa xác nhận tiền")).not.toBeInTheDocument();
    expect(screen.queryByText("Dùng điểm CSA")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Trạng thái tiền")).not.toBeInTheDocument();
    const zeroOrder = screen.getByRole("link", { name: /NFV-STORE-002/u });
    expect(zeroOrder.tagName).toBe("A");
    expect(zeroOrder).toHaveAttribute("href", "/store-orders/99999999-9999-4999-8999-999999999999");
    expect(zeroOrder.closest("tr")).not.toHaveAttribute("role", "link");
    expect(within(zeroOrder.closest("tr")!).getAllByRole("cell")[2]).toHaveTextContent(/^0\s*₫$/u);
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    const paidOrder = screen.getByRole("link", { name: /NFV-STORE-001/u });
    const cells = within(paidOrder.closest("tr")!).getAllByRole("cell");
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent("Tạo lúc:");
    expect(cells[0].querySelector("time")).toHaveAttribute(
      "dateTime",
      storeOrderFixture().created_at,
    );
    expect(cells[3]).toHaveTextContent("Hạn xử lý:");
    expect(cells[3].querySelector("time")).toHaveAttribute(
      "dateTime",
      storeOrderFixture().expires_at,
    );
    expect(screen.getByText(/105\.000/)).toBeVisible();
    expect(screen.getByRole("searchbox")).toHaveClass("nfv-control");
    for (const select of screen.getAllByRole("combobox")) {
      expect(select).toHaveClass("nfv-control");
    }
    expect(screen.getByRole("button", { name: "Tìm kiếm" })).toHaveClass("nfv-button");
    expect(screen.getAllByText("Chờ duyệt", { selector: ".store-order-status" })[0]).toHaveClass(
      "status",
    );
  });

  it("shows one refund status without presenting the old checkout deadline as a refund deadline", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        storeOrderFixture({ status: "cancelled", payment_status: "refund_required" }),
        storeOrderFixture({
          id: "99999999-9999-4999-8999-999999999999",
          reference_code: "REFUNDED-ORDER",
          status: "cancelled",
          payment_status: "refunded",
        }),
      ],
      meta: { page: 1, page_size: 20, total: 2 },
    });
    view();
    const awaiting = await screen.findByRole("link", { name: /NFV-STORE-001/u });
    const refunded = screen.getByRole("link", { name: /REFUNDED-ORDER/u });
    expect(
      within(awaiting.closest("tr")!).getByText("Chờ hoàn tiền", { selector: ".status" }),
    ).toBeVisible();
    expect(
      within(refunded.closest("tr")!).getByText("Đã hoàn tiền", { selector: ".status" }),
    ).toBeVisible();
    for (const row of [awaiting.closest("tr")!, refunded.closest("tr")!]) {
      expect(row.querySelectorAll(".status")).toHaveLength(1);
      expect(within(row).queryByText(/Hạn xử lý:/u)).not.toBeInTheDocument();
    }
  });

  it("sends the unified refund filter, search, sort and page to the server", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [storeOrderFixture()],
      meta: { page: 1, page_size: 20, total: 21 },
    });
    view();
    await screen.findByText("NFV-STORE-001");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  Nguyễn An  " } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Trạng thái" })).getByRole("button", {
        name: "Chờ hoàn tiền",
      }),
    );
    fireEvent.change(screen.getByLabelText("Sắp xếp"), { target: { value: "total_desc" } });

    await waitFor(() => {
      const path = vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0] as string;
      expect(path).toContain("page=1&page_size=20&search=Nguy%E1%BB%85n+An");
      expect(path).toContain("status=cancelled");
      expect(path).toContain("payment_status=refund_required");
      expect(path).toContain("sort=total_desc");
    });

    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() => expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("page=2"));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Trạng thái" })).getByRole("button", {
        name: "Đã hủy",
      }),
    );
    await waitFor(() => {
      const path = vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0] as string;
      expect(path).toContain("page=1");
      expect(path).not.toContain("payment_status=");
    });
  });

  it("shows error/retry and empty matching states without stale rows", async () => {
    vi.mocked(apiEnvelope)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({ data: [], meta: { page: 1, page_size: 20, total: 0 } });
    view();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Không kết nối được/)).toBeVisible();
    fireEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không có đơn hàng phù hợp.")).toBeVisible();
    expect(screen.queryByText("NFV-STORE-001")).not.toBeInTheDocument();
  });

  it("uses the shared localized permission error convention", async () => {
    vi.mocked(apiEnvelope).mockRejectedValueOnce(new Error("forbidden"));
    view();

    expect(
      await screen.findByText("Tài khoản không có quyền thực hiện thao tác này."),
    ).toBeVisible();
  });

  it("ignores an older response after filters trigger a newer request", async () => {
    let resolveOld!: (value: unknown) => void;
    vi.mocked(apiEnvelope)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)) as never)
      .mockResolvedValueOnce({
        data: [storeOrderFixture({ reference_code: "LATEST" })],
        meta: { page: 1, page_size: 20, total: 1 },
      });
    view();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Trạng thái" })).getByRole("button", {
        name: "Chờ duyệt",
      }),
    );
    expect(await screen.findByText("LATEST")).toBeVisible();
    resolveOld({
      data: [storeOrderFixture({ reference_code: "STALE" })],
      meta: { page: 1, page_size: 20, total: 1 },
    });
    await waitFor(() => expect(screen.queryByText("STALE")).not.toBeInTheDocument());
  });
});

it("shows saved retail delivery dates and a blank legacy date in secondary text", async () => {
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [
      storeOrderFixture({ delivery_date: "2026-11-20" }),
      storeOrderFixture({ id: "legacy", reference_code: "LEGACY", delivery_date: null }),
    ],
    meta: { page: 1, page_size: 20, total: 2 },
  });
  view();
  expect(await screen.findByText("Ngày giao: 20/11/2026")).toHaveClass("table-secondary");
  expect(screen.getByText("Ngày giao: —")).toBeVisible();
});
