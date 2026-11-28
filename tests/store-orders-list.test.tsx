import { selectOption } from "@/tests/select-option";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "@/tests/deferred";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { StoreOrderList } from "@/components/store-order-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { adminNavigation, resolveAdminBreadcrumbs } from "@/lib/admin-navigation";
import { apiEnvelope } from "@/lib/client-api";
import { storeOrderFixture } from "@/tests/store-orders-fixture";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
let contentWidth = 1024;

vi.mock("@/lib/client-api", () => ({ apiEnvelope: vi.fn(), api: vi.fn() }));
vi.mock("@mantine/hooks", async (original) => ({
  ...(await original<typeof import("@mantine/hooks")>()),
  useElementSize: () => ({ ref: { current: null }, width: contentWidth, height: 0 }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/store-orders",
}));

afterEach(() => {
  cleanup();
  contentWidth = 1024;
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
  it.each([
    ["vi", "Đơn hàng", "Tạo đơn hàng"],
    ["en", "Orders", "Create order"],
  ] as const)(
    "opens the create order route with a localized %s breadcrumb",
    async (locale, list, create) => {
      vi.mocked(apiEnvelope).mockResolvedValue({
        data: [],
        meta: { page: 1, page_size: 20, total: 0 },
      });
      render(
        <AdminI18nProvider initialLocale={locale}>
          <StoreOrderList />
        </AdminI18nProvider>,
      );

      await screen.findByText(
        locale === "vi" ? "Không có đơn hàng phù hợp." : "No matching Store orders.",
      );
      const href = screen.getByRole("link", { name: create }).getAttribute("href");
      expect(href).toBe("/store-orders/new");
      const dictionary = adminDictionaries[locale];
      const orders = adminNavigation(dictionary)
        .flatMap(({ items }) => items)
        .find(({ href }) => href === "/store-orders");
      expect(resolveAdminBreadcrumbs(href!, orders, dictionary)).toEqual([
        { label: list, href: "/store-orders" },
        { label: create },
      ]);
    },
  );

  it("moves the status filter into the toolbar at narrow widths and preserves the selection", async () => {
    contentWidth = 360;
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [storeOrderFixture()],
      meta: { page: 1, page_size: 20, total: 21 },
    });
    const { rerender } = view();
    await screen.findByText("NFV-STORE-001");
    expect(screen.queryByRole("radiogroup", { name: "Trạng thái" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    selectOption(screen.getByRole("combobox", { name: "Trạng thái" }), "cancelled");
    await waitFor(() =>
      expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain(
        "page=1&page_size=20&status=cancelled",
      ),
    );
    expect(screen.getByRole("button", { name: "Bộ lọc (1)" })).toBeVisible();

    contentWidth = 1024;
    rerender(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderList />
      </AdminI18nProvider>,
    );
    const statuses = screen.getByRole("radiogroup", { name: "Trạng thái" });
    expect(within(statuses).getByRole("radio", { name: "Đã hủy" })).toBeChecked();
    expect(screen.queryByRole("combobox", { name: "Trạng thái" })).not.toBeInTheDocument();
  });

  it.each([
    { data: [] },
    { data: {}, meta: { page: 1, page_size: 20, total: 0 } },
    { data: [null], meta: { page: 1, page_size: 20, total: 1 } },
  ])("does not cache a malformed server page %j", async (payload) => {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce(payload as never)
      .mockResolvedValueOnce({
        data: [storeOrderFixture()],
        meta: { page: 1, page_size: 20, total: 1 },
      });
    view();
    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button"));
    expect(await screen.findByText("NFV-STORE-001")).toBeVisible();
    expect(screen.getByText("0901234567")).toBeVisible();
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
  });

  it("keeps payment pending visible as a filter and as the order badge", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [storeOrderFixture({ status: "payment_pending" })],
      meta: { page: 1, page_size: 20, total: 21 },
    });
    view();
    const statuses = screen.getByRole("radiogroup", { name: "Trạng thái" });
    const pending = within(statuses).getByRole("radio", { name: "Chờ thanh toán" });
    expect(pending).toBeVisible();
    expect(
      await screen.findByText("Chờ thanh toán", {
        selector: ".store-order-status .mantine-Badge-label",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Chờ khách báo chuyển tiền")).not.toBeInTheDocument();
    fireEvent.click(pending);
    await waitFor(() => {
      expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("status=payment_pending");
    });
    expect(pending).toBeChecked();
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
    const tabs = within(screen.getByRole("radiogroup", { name: "Trạng thái" }));
    fireEvent.click(tabs.getByRole("radio", { name: "Chờ xác nhận đơn" }));
    expect(screen.getByText("NFV-STORE-001")).toBeVisible();
    expect(screen.queryByText("PAID-ORDER")).not.toBeInTheDocument();
    expect(screen.queryByText("Đang tải đơn hàng…")).not.toBeInTheDocument();
    fireEvent.click(tabs.getByRole("radio", { name: "Tất cả" }));
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
    const tabs = within(screen.getByRole("radiogroup", { name: "Trạng thái" }));
    fireEvent.click(tabs.getByRole("radio", { name: "Đã giao" }));
    await screen.findByText("DELIVERED");
    fireEvent.click(tabs.getByRole("radio", { name: "Tất cả" }));
    expect(screen.getByText("NFV-STORE-001")).toBeVisible();
    fireEvent.click(tabs.getByRole("radio", { name: "Đã giao" }));
    expect(screen.getByText("DELIVERED")).toBeVisible();
    expect(screen.queryByText("Đang tải đơn hàng…")).not.toBeInTheDocument();
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
  });

  it("never restores a previously cached tab after a later tab denies access", async () => {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [storeOrderFixture({ reference_code: "PRIVATE-ORDER" })],
        meta: { page: 1, page_size: 20, total: 21 },
      })
      .mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    view();
    expect(await screen.findByText("PRIVATE-ORDER")).toBeVisible();
    const tabs = within(screen.getByRole("radiogroup", { name: "Trạng thái" }));
    fireEvent.click(tabs.getByRole("radio", { name: "Đã giao" }));
    await screen.findByRole("alert");
    fireEvent.click(tabs.getByRole("radio", { name: "Tất cả" }));
    expect(screen.queryByText("PRIVATE-ORDER")).not.toBeInTheDocument();
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
  });

  it("keeps payment-status filters distinct while cancelled includes every refund claim", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        storeOrderFixture({
          reference_code: "NEEDS-REFUND",
          status: "cancelled",
          payment_status: "refund_required",
          refund_status: "pending",
        }),
        storeOrderFixture({
          id: "other",
          reference_code: "REFUNDED",
          status: "cancelled",
          payment_status: "refunded",
          refund_status: "refunded",
        }),
        storeOrderFixture({
          id: "claim",
          reference_code: "UNVERIFIED-CLAIM",
          status: "cancelled",
          refund_status: "pending",
        }),
      ],
      meta: { page: 1, page_size: 20, total: 3 },
    });
    view();
    await screen.findByText("REFUNDED");
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    const money = screen.getByRole("combobox", { name: "Trạng thái tiền" });
    fireEvent.click(money);
    expect(screen.getByRole("option", { name: "Đã nhận tiền, cần hoàn" })).toBeVisible();
    fireEvent.keyDown(money, { key: "Escape" });
    selectOption(money, "refund_required");
    expect(screen.getByText("NEEDS-REFUND")).toBeVisible();
    expect(screen.queryByText("REFUNDED")).not.toBeInTheDocument();
    expect(screen.queryByText("UNVERIFIED-CLAIM")).not.toBeInTheDocument();
    selectOption(money, "refunded");
    expect(screen.getByText("REFUNDED")).toBeVisible();
    expect(screen.queryByText("NEEDS-REFUND")).not.toBeInTheDocument();
    selectOption(money, "");
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Đã hủy",
      }),
    );
    expect(screen.getByText("REFUNDED")).toBeVisible();
    expect(screen.getByText("NEEDS-REFUND")).toBeVisible();
    expect(screen.getByText("UNVERIFIED-CLAIM")).toBeVisible();
    expect(apiEnvelope).toHaveBeenCalledTimes(1);
  });

  it("keeps the same order rows and footer while only the refresh button shows loading", async () => {
    let resolve!: (value: {
      data: ReturnType<typeof storeOrderFixture>[];
      meta: { page: number; page_size: number; total: number };
    }) => void;
    const reply = new Promise<Parameters<typeof resolve>[0]>((done) => {
      resolve = done;
    });
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [storeOrderFixture()],
        meta: { page: 1, page_size: 20, total: 21 },
      })
      .mockReturnValue(reply);
    view();
    const announcement = screen.getByRole("status");
    const loadingList = announcement.closest("[data-list-paper]")!;
    const loadingScroll = loadingList.querySelector<HTMLElement>(
      '[role="region"][aria-hidden="true"]',
    );
    expect(loadingScroll).not.toHaveAttribute("tabindex");
    const loadingWidth = loadingScroll?.style.getPropertyValue("--table-min-width");
    expect(loadingWidth).toBe("calc(45rem * var(--mantine-scale))");
    expect(loadingScroll?.querySelectorAll("th")).toHaveLength(4);
    expect(loadingScroll?.querySelector("tbody tr")?.children).toHaveLength(4);
    expect(loadingScroll?.querySelector("tbody tr > :nth-child(3)")).toHaveStyle({
      textAlign: "right",
    });
    expect(loadingScroll?.querySelector("a, button, input, [tabindex]")).toBeNull();
    expect(loadingList.querySelectorAll("table")).toHaveLength(1);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await screen.findByText("NFV-STORE-001");

    const scroll = screen.getByRole("region", { name: "Đơn hàng Store" });
    const paper = scroll.closest("[data-list-paper]")!;
    expect(paper).toBe(loadingList);
    expect(scroll.style.getPropertyValue("--table-min-width")).toBe(loadingWidth);
    expect(paper.querySelectorAll("table")).toHaveLength(1);
    expect(scroll).toHaveAttribute("tabindex", "0");
    expect(within(scroll).getAllByRole("columnheader")).toHaveLength(4);
    const next = within(paper as HTMLElement).getByRole("button", { name: "Sau" });
    expect(next.closest("footer")).not.toBeNull();
    expect(scroll).not.toContainElement(next);

    const refresh = screen.getByRole("button", { name: "Làm mới" });
    fireEvent.click(refresh);
    expect(refresh).toHaveAttribute("aria-busy", "true");
    expect(next).toBeDisabled();
    expect(within(scroll).getByText("NFV-STORE-001")).toBeVisible();
    expect(within(paper as HTMLElement).queryByRole("status")).not.toBeInTheDocument();
    expect(paper.querySelectorAll("table")).toHaveLength(1);
    await act(async () =>
      resolve({
        data: [storeOrderFixture({ reference_code: "REFRESHED" })],
        meta: { page: 1, page_size: 20, total: 21 },
      }),
    );
    expect(await screen.findByText("REFRESHED")).toBeVisible();
    expect(screen.getByRole("region", { name: "Đơn hàng Store" })).toBe(scroll);
    expect(next).toBeEnabled();
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
  });

  it("keeps an empty result and its footer visible while refreshing", async () => {
    const empty = { data: [], meta: { page: 1, page_size: 20, total: 0 } };
    const pending = deferred<typeof empty>();
    vi.mocked(apiEnvelope).mockResolvedValueOnce(empty).mockReturnValueOnce(pending.promise);
    view();
    const message = await screen.findByText("Không có đơn hàng phù hợp.");
    const count = screen.getByText("0 kết quả");
    const refresh = screen.getByRole("button", { name: "Làm mới" });
    fireEvent.click(refresh);
    expect(message).toBeVisible();
    expect(count).toBeVisible();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    await act(async () => pending.resolve(empty));
    expect(refresh).toBeEnabled();
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
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
    await screen.findByText("Đã giao", { selector: ".mantine-Badge-label" });
    const tabs = within(screen.getByRole("radiogroup", { name: "Trạng thái" }));
    fireEvent.click(tabs.getByRole("radio", { name: "Chờ xác nhận đơn" }));
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
      const pending = within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole(
        "radio",
        { name: "Chờ xác nhận đơn" },
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
      expect(pending).toBeChecked();
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
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Chờ thanh toán",
      }),
    ).toBeVisible();
    expect(
      screen.getAllByText("Chờ duyệt", { selector: ".store-order-status .mantine-Badge-label" }),
    ).toHaveLength(2);
    expect(
      screen.queryByText("Chưa xác nhận tiền", {
        selector: ".store-order-status .mantine-Badge-label",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Dùng điểm CSA")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    expect(screen.getByRole("combobox", { name: "Trạng thái tiền" })).toBeVisible();
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
    expect(screen.getByRole("searchbox")).toHaveClass("mantine-TextInput-input");
    for (const select of screen.getAllByRole("combobox")) {
      expect(select).toHaveClass("mantine-Select-input");
    }
    expect(screen.getByRole("button", { name: "Tìm kiếm" })).toHaveClass("mantine-ActionIcon-root");
    expect(
      screen.getAllByText("Chờ duyệt", { selector: ".store-order-status .mantine-Badge-label" })[0],
    ).toBeVisible();
  });

  it("shows cancelled plus a refund status without presenting the old checkout deadline as a refund deadline", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        storeOrderFixture({
          status: "cancelled",
          payment_status: "refund_required",
          refund_status: "pending",
        }),
        storeOrderFixture({
          id: "99999999-9999-4999-8999-999999999999",
          reference_code: "REFUNDED-ORDER",
          status: "cancelled",
          payment_status: "refunded",
          refund_status: "refunded",
        }),
      ],
      meta: { page: 1, page_size: 20, total: 2 },
    });
    view();
    const awaiting = await screen.findByRole("link", { name: /NFV-STORE-001/u });
    const refunded = screen.getByRole("link", { name: /REFUNDED-ORDER/u });
    expect(
      within(awaiting.closest("tr")!).getByText("Chờ hoàn", { selector: ".mantine-Badge-label" }),
    ).toBeVisible();
    expect(
      within(refunded.closest("tr")!).getByText("Đã hoàn", { selector: ".mantine-Badge-label" }),
    ).toBeVisible();
    for (const row of [awaiting.closest("tr")!, refunded.closest("tr")!]) {
      expect(row.querySelectorAll(".mantine-Badge-root")).toHaveLength(2);
      expect(within(row).getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
      expect(within(row).queryByText(/Hạn xử lý:/u)).not.toBeInTheDocument();
    }
  });

  it.each(["0901234567", "090", "4567"])("sends phone search %s unchanged", async (search) => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [storeOrderFixture()],
      meta: { page: 1, page_size: 20, total: 21 },
    });
    view();
    await screen.findByText("NFV-STORE-001");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: search } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    await waitFor(() => {
      const path = String(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]);
      expect(new URLSearchParams(path.split("?")[1]).get("search")).toBe(search);
    });
  });

  it("sends explicit payment filtering, search, sort and page to the server", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [storeOrderFixture()],
      meta: { page: 1, page_size: 20, total: 21 },
    });
    view();
    await screen.findByText("NFV-STORE-001");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  Nguyễn An  " } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Đã hủy",
      }),
    );
    const filters = screen.getByRole("button", { name: "Bộ lọc" });
    await waitFor(() => expect(filters).toBeEnabled());
    fireEvent.click(filters);
    expect(screen.getByRole("combobox", { name: "Trạng thái tiền" })).toBeEnabled();
    selectOption(screen.getByRole("combobox", { name: "Trạng thái tiền" }), "refund_required");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Sắp xếp" })).toBeEnabled());
    selectOption(screen.getByRole("combobox", { name: "Sắp xếp" }), "total_desc");

    await waitFor(() => {
      const path = vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0] as string;
      expect(path).toContain("page=1&page_size=20&search=Nguy%E1%BB%85n+An");
      expect(path).toContain("status=cancelled");
      expect(path).toContain("payment_status=refund_required");
      expect(path).toContain("sort=total_desc");
    });

    const nextPage = await screen.findByRole("button", { name: "Sau" });
    await waitFor(() => expect(nextPage).toBeEnabled());
    fireEvent.click(nextPage);
    await waitFor(() => expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("page=2"));
    const paymentStatus = screen.getByRole("combobox", { name: "Trạng thái tiền" });
    await waitFor(() => expect(paymentStatus).toBeEnabled());
    selectOption(paymentStatus, "");
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
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
    expect(within(alert).getByText(/Không thể kết nối/)).toBeVisible();
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
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Chờ xác nhận đơn",
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
  expect(await screen.findByText("Ngày giao: 20/11/2026")).toHaveClass("mantine-Text-root");
  expect(screen.getByText("Ngày giao: —")).toBeVisible();
});

it("keeps six order states and shows an unverified refund claim alongside cancelled", async () => {
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [
      storeOrderFixture({
        workflow_version: 2,
        status: "cancelled",
        payment_status: "unconfirmed",
        refund_status: "pending",
      }),
    ],
    meta: { page: 1, page_size: 20, total: 21 },
  });
  view();
  const link = await screen.findByRole("link", { name: /NFV-STORE-001/u });
  const row = within(link.closest("tr")!);
  expect(row.getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
  expect(row.getByText("Chờ đối soát", { selector: ".mantine-Badge-label" })).toBeVisible();
  const tabs = within(screen.getByRole("radiogroup", { name: "Trạng thái" }));
  expect(tabs.getAllByRole("radio")).toHaveLength(7);
  fireEvent.click(tabs.getByRole("radio", { name: "Chờ xác nhận thanh toán" }));
  await waitFor(() =>
    expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("status=payment_review"),
  );
  expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).not.toContain("refund_status");
});

it("reconciles a mounted page at the backend deadline without inventing a local cancelled state", async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [
          storeOrderFixture({
            workflow_version: 2,
            status: "payment_review",
            server_time: "2026-11-20T09:00:00Z",
            expires_at: "2026-11-20T09:00:01Z",
          }),
        ],
        meta: { page: 1, page_size: 20, total: 1 },
      })
      .mockResolvedValueOnce({
        data: [
          storeOrderFixture({ workflow_version: 2, status: "cancelled", refund_status: "pending" }),
        ],
        meta: { page: 1, page_size: 20, total: 1 },
      });
    view();
    await act(async () => {});
    expect(
      screen.getByText("Chờ xác nhận thanh toán", { selector: ".mantine-Badge-label" }),
    ).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(screen.getByText("Chờ đối soát", { selector: ".mantine-Badge-label" })).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

it("refreshes filtered counts when a known cached pending order expires off the visible tab", async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [
          storeOrderFixture({
            workflow_version: 2,
            status: "payment_pending",
            server_time: "2026-11-20T09:00:00Z",
            expires_at: "2026-11-20T09:00:01Z",
          }),
        ],
        meta: { page: 1, page_size: 20, total: 1 },
      })
      .mockResolvedValueOnce({
        data: [
          storeOrderFixture({
            workflow_version: 2,
            status: "cancelled",
            expires_at: "2026-11-20T09:00:01Z",
          }),
        ],
        meta: { page: 1, page_size: 20, total: 1 },
      });
    view();
    await act(async () => {});
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Trạng thái" })).getByRole("radio", {
        name: "Đã hủy",
      }),
    );
    expect(screen.getByText("Không có đơn hàng phù hợp.")).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("status=cancelled");
    expect(screen.getByText("Đã hủy", { selector: ".mantine-Badge-label" })).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});
