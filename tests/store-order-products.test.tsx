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
  it("loads in the products panel with grouped placeholders and a single announcement", () => {
    render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderProducts />
      </AdminI18nProvider>,
    );
    const panel = screen.getByRole("region", { name: "Sản phẩm" });
    expect(within(panel).getAllByRole("heading", { name: "Sản phẩm", level: 2 })).toHaveLength(1);
    expect(within(panel).getAllByRole("status")).toHaveLength(1);
    expect(within(panel).getByRole("status")).toHaveTextContent("Đang tải chi tiết đơn hàng…");
    expect(panel.querySelector("table")).toBeNull();
    expect(panel.querySelectorAll('ul[aria-hidden="true"] > li')).toHaveLength(3);
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("shows snapshot prices and CSA amounts in the correct product item", () => {
    const order = storeOrderFixture({ status: "cancelled" });
    const [line] = order.lines;
    const quotaLine = {
      ...line,
      name: "Rau muống with a long product name ".repeat(8).trim(),
      sku: "RAU-01".repeat(10),
      unit_price_vnd: "9007199254740993",
      cash_subtotal_vnd: "90071992547409930",
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

    const panel = screen.getByRole("region", { name: "Products" });
    expect(panel).toHaveAttribute("data-list-paper");
    expect(panel.querySelectorAll("[data-list-paper]")).toHaveLength(0);
    expect(
      panel.querySelector("table, .mantine-ScrollArea-root, .mantine-Table-scrollContainer"),
    ).toBeNull();
    const list = within(panel).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const [firstItem, secondItem] = within(list).getAllByRole("listitem");
    const product = within(firstItem);
    expect(product.getByText(quotaLine.name)).toBeVisible();
    expect(product.getByText(quotaLine.sku).parentElement).toHaveTextContent(
      `${quotaLine.sku} · 0.5 kg`,
    );
    expect(
      product.getByText(`3 × ${formatStoreMoney(quotaLine.unit_price_vnd, "en")}`),
    ).toBeVisible();
    expect(product.getByText(formatStoreMoney(quotaLine.cash_subtotal_vnd, "en"))).toBeVisible();
    expect(product.getByText("Cash subtotal")).toBeVisible();
    expect(product.getByText("CSA benefits: 2 items · 1.5 units")).toBeVisible();
    expect(product.getByText("Cash: 1 items")).toBeVisible();
    const farm = product.getByRole("group", { name: "Supplying farm" });
    expect(within(farm).getByText("Supplying farm")).not.toBeVisible();
    expect(within(farm).getByText("Farm A")).toBeVisible();
    expect(within(farm).getByText("29/10/2026 – 01/11/2026")).toBeVisible();
    expect(farm).not.toHaveTextContent(/quantity|allocated|restock/iu);
    expect(within(secondItem).getByText("Kale")).toBeVisible();
    expect(within(secondItem).queryByRole("group", { name: "Supplying farm" })).toBeNull();
    expect(within(panel).queryByRole("combobox")).toBeNull();
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
    const [firstItem, secondItem] = screen.getAllByRole("listitem");
    expect(within(firstItem).getAllByRole("combobox")).toEqual([firstSelect]);
    expect(within(secondItem).getAllByRole("combobox")).toEqual([secondSelect]);
    expect(firstSelect).toHaveAccessibleName("Trang trại cung cấp Rau muống RAU-01");
    expect(within(firstItem).getByText("Trang trại cung cấp")).not.toBeVisible();
    expect(firstSelect).toHaveValue("Cùng tên · Còn 4");
    expect(secondSelect).toHaveValue("Cùng tên · Còn 7");
    fireEvent.click(firstSelect);
    fireEvent.click(screen.getByRole("option", { name: /Cùng tên.*Còn 2/ }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: /Cùng tên.*Còn 7/ }));
    expect(change).toHaveBeenCalledExactlyOnceWith(first.id, farmB.farm_id);
  });

  it("shows an inline validation error and preserves the complete selected Farm name", () => {
    const [line] = storeOrderFixture().lines;
    const farm = {
      farm_id: "farm-a",
      farm_name: "Trang trại ".repeat(25).trim(),
      eligible: false,
      available_quantity: 2,
    };
    const order = storeOrderFixture({
      source_inventory: {
        refresh_required_before_approve: true,
        candidates: [],
        product_reservations: [],
        lines: [sourceLineFixture(line, [farm])],
      },
    });
    render(
      <AdminI18nProvider initialLocale="vi">
        <StoreOrderProducts
          order={order}
          farms={{
            selections: inspectStoreFarmDraft(order, new Map([[line.id, farm.farm_id]])).selections,
            onChange: vi.fn(),
            disabled: false,
          }}
        />
      </AdminI18nProvider>,
    );
    const select = screen.getByRole("combobox", { name: /Trang trại cung cấp Rau muống/ });
    expect(select).toHaveValue(`${farm.farm_name} · Còn 2`);
    expect(select).toHaveAttribute("title", `${farm.farm_name} · Còn 2`);
    expect(select).toHaveAccessibleDescription(/không còn đáp ứng đủ số lượng/i);
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

  it.each([
    "pending_review",
    "payment_pending",
    "payment_review",
    "pending_delivery",
    "delivered",
    "cancelled",
  ] as const)(
    "groups historical batches by Farm ID and omits restock presentation for %s",
    (status) => {
      const order = storeOrderFixture({ status });
      const [line] = order.lines;
      const allocations = ["batch-a", "batch-b", "batch-c"].map((batch, index) => ({
        ...candidate(line, batch, "Same Farm name"),
        id: batch,
        farm_id: index < 2 ? "farm-a" : "farm-b",
        end_date: `2026-11-0${index + 1}`,
        quantity: index + 1,
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
      const farmSection = within(screen.getByRole("listitem")).getByRole("group", {
        name: "Supplying farm",
      });
      const section = within(farmSection);
      expect(section.getAllByText("Same Farm name")).toHaveLength(2);
      for (let index = 1; index <= 3; index++) {
        expect(section.getByText(`29/10/2026 – 0${index}/11/2026`)).toBeVisible();
        expect(section.getByText(`Qty: ${index}`)).toBeVisible();
      }
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(farmSection).not.toHaveTextContent(/restock/iu);
    },
  );
});
