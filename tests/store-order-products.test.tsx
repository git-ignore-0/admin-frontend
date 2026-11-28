import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { StoreOrderProducts } from "@/components/store-order-products";
import {
  formatStoreMoney,
  inspectStoreFarmDraft,
  reconcileStoreFarmDraft,
} from "@/lib/store-orders";
import type { StoreOrder, StoreSourceCandidate } from "@/lib/types";
import { sourceLineFixture, storeOrderFixture } from "@/tests/store-orders-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

function candidate(line: StoreOrder["lines"][number], batch: string, name: string, available = 3) {
  return {
    line_id: line.id,
    product_id: line.product_id,
    farm_id: `farm-${batch}`,
    farm_name: name,
    batch_id: batch,
    start_date: "2026-10-29",
    end_date: "2026-11-01",
    available_quantity: available,
  } satisfies StoreSourceCandidate;
}

describe("Store order products and sources", () => {
  it("uses the same four-column table for initial loading with a single announcement", () => {
    const { container } = render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderProducts />
      </AdminI18nProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải chi tiết đơn hàng…");
    expect(screen.queryByRole("table")).toBeNull();
    const table = container.querySelector("[data-list-paper] table");
    expect(table?.querySelectorAll("thead th[scope=col]")).toHaveLength(4);
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps product prices, CSA and read-only restock ledger in one English table", () => {
    const order = storeOrderFixture({ status: "cancelled" });
    const [line] = order.lines;
    const quotaLine = {
      ...line,
      unit_price_vnd: "9007199254740993",
      cash_subtotal_vnd: "40000",
      quota_quantity: 2,
      quota_units: 1.5,
      cash_quantity: 1,
    };
    const second = { ...line, id: "second-line", name: "Kale", sku: "K-02" };
    const source = candidate(line, "batch-a", "Farm A");
    render(
      <AdminI18nProvider initialLocale="en">
        <StoreOrderProducts
          order={{
            ...order,
            lines: [quotaLine, second],
            allocations: [
              {
                ...source,
                id: "allocation-a",
                quantity: 3,
                restocked_quantity: 1,
                restock_remaining_quantity: 2,
                restock_eligible: false,
                restock_unavailable_reason: "batch_expired",
              },
            ],
          }}
        />
      </AdminI18nProvider>,
    );

    const table = screen.getByRole("table", { name: "Products" });
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(table.closest("[data-list-paper]")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Products" })).toHaveAttribute("tabindex", "0");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Products", "Quantity", "Unit price", "Line subtotal"]);
    expect(within(table).getByText("Product code: RAU-01")).toBeVisible();
    expect(within(table).getAllByText("Selling unit: 0.5 kg")).toHaveLength(2);
    expect(within(table).getByText(formatStoreMoney("9007199254740993", "en"))).toBeVisible();
    expect(within(table).getByText(formatStoreMoney("40000", "en"))).toBeVisible();
    expect(within(table).getByText("CSA benefits: 2 items · 1.5 units")).toBeVisible();
    expect(within(table).getByText("Cash: 1 items")).toBeVisible();
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Rau muống");
    expect(rows[2]).toHaveTextContent("Farm A");
    expect(rows[2]).toHaveTextContent("Restocked 1");
    expect(rows[2]).not.toHaveTextContent("can still be restocked");
    expect(rows[2]).toHaveTextContent("This source has expired and cannot be restocked.");
    expect(rows[3]).toHaveTextContent("Kale");
    expect(rows[4]).toHaveTextContent("No sources allocated.");
    expect(within(table).queryByRole("textbox")).toBeNull();
    expect(within(table).queryByRole("combobox")).toBeNull();
  });

  it("keeps same-name farms distinct and requests a farm change for the correct product", () => {
    const base = storeOrderFixture();
    const [first] = base.lines;
    const second = { ...first, id: "second-line", name: "Cà chua" };
    const farmA = {
      farm_id: "farm-a",
      farm_name: "Cùng tên",
      available_quantity: 4,
      eligible: true,
    };
    const farmB = { ...farmA, farm_id: "farm-b", available_quantity: 7 };
    const farmC = { ...farmA, farm_id: "farm-c", available_quantity: 2, eligible: false };
    const order = storeOrderFixture({
      lines: [first, second],
      source_inventory: {
        refresh_required_before_approve: true,
        product_reservations: [],
        candidates: [],
        lines: [
          sourceLineFixture(first, [farmA, farmB, farmC], farmA.farm_id),
          sourceLineFixture(second, [farmB], farmB.farm_id),
        ],
      },
    });
    const change = vi.fn();
    render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderProducts
          order={order}
          farms={{
            selections: inspectStoreFarmDraft(order, reconcileStoreFarmDraft(order)).selections,
            onChange: change,
            disabled: false,
          }}
        />
      </AdminI18nProvider>,
    );
    const firstSelect = screen.getByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
    const secondSelect = screen.getByRole("combobox", { name: /Trang trại cung cấp Cà chua/ });
    expect(firstSelect).toHaveValue("Cùng tên · Còn 4");
    expect(secondSelect).toHaveValue("Cùng tên · Còn 7");
    fireEvent.click(firstSelect);
    fireEvent.click(screen.getByRole("option", { name: /Cùng tên.*Còn 2/ }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: /Cùng tên.*Còn 7/ }));
    expect(change).toHaveBeenCalledExactlyOnceWith(first.id, farmB.farm_id);
  });

  it("uses native keyboard selection and skips a disabled farm", () => {
    const base = storeOrderFixture();
    const [line] = base.lines;
    const unavailable = {
      farm_id: "unavailable",
      farm_name: "Vườn thiếu",
      eligible: false,
      available_quantity: 2,
    };
    const available = {
      ...unavailable,
      farm_id: "available",
      farm_name: "Vườn đủ",
      eligible: true,
      available_quantity: 4,
    };
    const order = {
      ...base,
      source_inventory: {
        refresh_required_before_approve: true,
        candidates: [],
        product_reservations: [],
        lines: [sourceLineFixture(line, [unavailable, available])],
      },
    };
    const onChange = vi.fn();
    render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderProducts
          order={order}
          farms={{
            selections: inspectStoreFarmDraft(order, reconcileStoreFarmDraft(order)).selections,
            onChange,
            disabled: false,
          }}
        />
      </AdminI18nProvider>,
    );
    const select = screen.getByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
    fireEvent.keyDown(select, { key: "ArrowDown", code: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeVisible();
    fireEvent.keyDown(select, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.keyDown(select, { key: "Enter", code: "Enter" });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(line.id, available.farm_id);
  });

  it.each(["pending_delivery", "cancelled"] as const)(
    "keeps historical farms and only shows the restock ledger for %s when applicable",
    (status) => {
      const order = storeOrderFixture({ status });
      const [line] = order.lines;
      const allocations = ["batch-a", "batch-b", "batch-c"].map((batch, index) => ({
        ...candidate(line, batch, index < 2 ? "Cross-Farm A" : "Cross-Farm B"),
        id: batch,
        farm_id: index < 2 ? "farm-a" : "farm-b",
        quantity: 1,
        restocked_quantity: index < 2 ? 0 : 1,
        restock_remaining_quantity: index < 2 ? 1 : 0,
        restock_eligible: index === 0,
        restock_unavailable_reason: index === 1 ? "batch_expired" : null,
      }));
      render(
        <AdminI18nProvider initialLocale="en">
          <StoreOrderProducts order={{ ...order, allocations }} />
        </AdminI18nProvider>,
      );
      expect(screen.getByText("Cross-Farm B")).toBeVisible();
      expect(screen.getAllByText("Allocated 1")).toHaveLength(3);
      expect(screen.queryByRole("combobox")).toBeNull();
      if (status === "cancelled") {
        expect(screen.getByText("1 can still be restocked")).toBeVisible();
        expect(screen.getByText("Fully restocked")).toBeVisible();
        expect(screen.getByText("This source has expired and cannot be restocked.")).toBeVisible();
      } else {
        expect(screen.queryByText(/restock/i)).toBeNull();
      }
    },
  );
});
