import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { StoreOrderProducts } from "@/components/store-order-products";
import { formatStoreMoney, type StoreOrderAllocationInput } from "@/lib/store-orders";
import type { StoreOrder, StoreSourceCandidate } from "@/lib/types";
import { storeOrderFixture } from "@/tests/store-orders-fixture";

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

function input(source: StoreSourceCandidate, quantity: string): StoreOrderAllocationInput {
  return {
    key: `${source.line_id}:${source.batch_id}`,
    line_id: source.line_id,
    batch_id: source.batch_id,
    quantity,
  };
}

function editable(
  order: StoreOrder,
  initial: StoreOrderAllocationInput[],
  onChange = vi.fn(),
  disabled = false,
) {
  function Editor({ order }: { order: StoreOrder }) {
    const [value, setValue] = useState(initial);
    return (
      <StoreOrderProducts
        order={order}
        allocation={{
          value,
          disabled,
          onChange: (rows) => {
            setValue(rows);
            onChange(rows);
          },
        }}
      />
    );
  }
  const element = (snapshot: StoreOrder) => (
    <AdminI18nProvider initialLocale="vi">
      <Editor order={snapshot} />
    </AdminI18nProvider>
  );
  const view = render(element(order));
  return { updateOrder: (snapshot: StoreOrder) => view.rerender(element(snapshot)), onChange };
}

function paste(input: HTMLInputElement, value: string) {
  return fireEvent.paste(input, { clipboardData: { getData: () => value } });
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

    const table = screen.getByRole("table", { name: "Products & sources" });
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(table.closest("[data-list-paper]")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Products & sources" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Products", "Quantity", "Unit price", "Line subtotal"]);
    expect(within(table).getByText("RAU-01")).toBeVisible();
    expect(within(table).getAllByText("0.5 kg")).toHaveLength(2);
    expect(within(table).getByText(formatStoreMoney("9007199254740993", "en"))).toBeVisible();
    expect(within(table).getByText(formatStoreMoney("40000", "en"))).toBeVisible();
    expect(within(table).getByText("CSA benefits: 2 items · 1.5 units")).toBeVisible();
    expect(within(table).getByText("Cash: 1 items")).toBeVisible();
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Rau muống");
    expect(rows[2]).toHaveTextContent("Farm A");
    expect(rows[2]).toHaveTextContent("Restocked 1 · 2 may still be restocked");
    expect(rows[2]).toHaveTextContent("This source has expired and cannot be restocked.");
    expect(rows[3]).toHaveTextContent("Kale");
    expect(rows[4]).toHaveTextContent("No sources allocated.");
    expect(within(table).queryByRole("textbox")).toBeNull();
    expect(within(table).queryByRole("combobox")).toBeNull();
  });

  it("adds the first unused source with one unit and keeps each draft and focus on its own row", () => {
    const order = storeOrderFixture();
    const [line] = order.lines;
    const first = candidate(line, "batch-a", "Vườn A");
    const second = candidate(line, "batch-b", "Vườn B");
    order.source_inventory!.candidates = [first, second];
    order.source_inventory!.product_reservations = [
      {
        product_id: line.product_id,
        reserved_quantity: 7,
        this_order_quantity: 3,
        other_orders_quantity: 4,
      },
    ];
    const { onChange } = editable(order, [input(first, "2")]);
    const editor = screen.getByRole("region", { name: "Phân bổ nguồn Farm / batch" });
    expect(within(editor).getByText("Đã chọn 2/3 · Còn thiếu 1")).toBeVisible();
    expect(within(editor).getByText(/Đơn này giữ 3 · đơn khác giữ 4/)).toBeVisible();
    fireEvent.click(within(editor).getByRole("button", { name: "Thêm nguồn" }));

    expect(onChange.mock.lastCall?.[0]).toEqual([
      input(first, "2"),
      { ...input(second, "1"), key: expect.any(String) },
    ]);
    const firstInput = within(editor).getByLabelText("Số lượng nguồn 1");
    const secondInput = within(editor).getByLabelText("Số lượng nguồn 2");
    expect(within(editor).getByText("Đủ 3/3")).toBeVisible();
    expect(secondInput).toHaveFocus();
    fireEvent.change(secondInput, { target: { value: "1e3" } });
    expect(secondInput).toHaveAccessibleDescription("Số lượng nguồn phải là số nguyên dương.");

    const firstRemove = within(editor).getAllByRole("button", { name: "Xóa nguồn" })[0];
    act(() => firstInput.focus());
    fireEvent.click(firstRemove);
    expect(firstInput).not.toBeInTheDocument();
    expect(secondInput).toHaveAccessibleName("Số lượng nguồn 1");
    expect(secondInput).toHaveAccessibleDescription("Số lượng nguồn phải là số nguyên dương.");
    expect(secondInput).toHaveFocus();
  });

  it("validates raw replacement and rejects newline paste even when it looks like the old value", () => {
    const order = storeOrderFixture();
    order.lines[0].quantity = 12;
    const source = candidate(order.lines[0], "batch-a", "Vườn A", 999999);
    order.source_inventory!.candidates = [source];
    const { onChange } = editable(order, [input(source, "12")]);
    const quantity = screen.getByRole<HTMLInputElement>("textbox", { name: "Số lượng nguồn 1" });
    expect(quantity).toHaveAttribute("type", "text");
    expect(quantity).toHaveAttribute("inputmode", "numeric");
    expect(quantity).toHaveValue("12");

    quantity.setSelectionRange(0, 2);
    expect(paste(quantity, "1\n2")).toBe(false);
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(onChange.mock.lastCall?.[0]).toEqual([input(source, "1\n2")]);
    quantity.setSelectionRange(0, 2);
    expect(paste(quantity, "12")).toBe(false);
    expect(quantity).not.toHaveAttribute("aria-invalid", "true");
    expect(onChange.mock.lastCall?.[0]).toEqual([input(source, "12")]);

    quantity.setSelectionRange(1, 1);
    expect(paste(quantity, "0\n")).toBe(false);
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(onChange.mock.lastCall?.[0]).toEqual([input(source, "10\n2")]);
    fireEvent.change(quantity, { target: { value: "1000000" } });
    expect(quantity).toHaveAccessibleDescription("Số lượng nguồn phải từ 1 đến 999999.");
    fireEvent.change(quantity, { target: { value: "" } });
    expect(quantity).toHaveAccessibleDescription("Số lượng nguồn phải là số nguyên dương.");
    fireEvent.change(quantity, { target: { value: "12" } });
    expect(quantity).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Đủ 12/12")).toBeVisible();

    fireEvent.input(quantity, { inputType: "insertCompositionText", data: "1\n2" });
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(onChange.mock.lastCall?.[0]).toEqual([input(source, "1\n2")]);
    fireEvent.input(quantity, { inputType: "insertCompositionText", data: "12" });
    expect(quantity).not.toHaveAttribute("aria-invalid", "true");
    expect(onChange.mock.lastCall?.[0]).toEqual([input(source, "12")]);

    quantity.setSelectionRange(0, 2);
    const overlong = "0".repeat(600) + "12";
    expect(paste(quantity, overlong)).toBe(false);
    expect(quantity).toHaveAccessibleDescription("Số lượng nguồn phải từ 1 đến 999999.");
    fireEvent.blur(quantity);
    expect(onChange.mock.lastCall?.[0]).toEqual([input(source, overlong)]);

    fireEvent.change(quantity, { target: { value: "13" } });
    expect(screen.getByText("Đã chọn 13/12 · Vượt 1")).toBeVisible();
    expect(quantity).not.toHaveAttribute("aria-invalid", "true");
  });

  it("shows shared batch usage on both products and preserves rows when a candidate becomes stale", () => {
    const order = storeOrderFixture();
    const [firstLine] = order.lines;
    const secondLine = { ...firstLine, id: "second-line", name: "Cải xanh", quantity: 1 };
    order.lines = [firstLine, secondLine];
    const first = candidate(firstLine, "shared", "Vườn chung");
    const second = candidate(secondLine, "shared", "Vườn chung");
    order.source_inventory!.candidates = [first, second];
    const { updateOrder } = editable(order, [input(first, "3"), input(second, "1")]);

    const sources = screen.getAllByRole("combobox");
    const firstProduct = screen.getByText(firstLine.name).closest("tr");
    const secondProduct = screen.getByText(secondLine.name).closest("tr");
    expect(firstProduct?.nextElementSibling).toContainElement(sources[0]);
    expect(secondProduct?.nextElementSibling).toContainElement(sources[1]);
    for (const source of sources) {
      expect(source).toHaveAccessibleDescription("Nguồn chỉ còn 3, thấp hơn số lượng đã chọn.");
    }
    updateOrder({
      ...order,
      source_inventory: { ...order.source_inventory!, candidates: [second] },
    });
    expect(sources[0]).toHaveValue("Nguồn không còn khả dụng");
    expect(sources[0]).toHaveAccessibleDescription("Nguồn đã chọn không còn khả dụng.");
    expect(screen.getAllByRole("textbox", { name: "Số lượng nguồn 1" })[0]).toHaveValue("3");
  });

  it("filters source options by product and keeps the draft row when choosing another batch", () => {
    const order = storeOrderFixture();
    const [line] = order.lines;
    const other = { ...line, id: "other-line", name: "Rau ngót" };
    order.lines.push(other);
    const first = candidate(line, "batch-a", "Vườn A");
    const second = candidate(line, "batch-b", "Vườn B");
    const third = candidate(line, "batch-c", "Vườn C");
    const unrelated = candidate(other, "batch-d", "Vườn D");
    order.source_inventory!.candidates = [first, second, third, unrelated];
    const { onChange } = editable(order, [input(first, "1"), input(second, "2")]);
    const product = screen.getByRole("region", { name: line.name });
    const source = within(product).getAllByRole("combobox")[0];
    const quantity = within(product).getByRole("textbox", { name: "Số lượng nguồn 1" });
    fireEvent.click(source);

    expect(screen.queryByRole("option", { name: /^Vườn D/u })).toBeNull();
    expect(screen.getByRole("option", { name: /^Vườn B/u })).toHaveAttribute(
      "data-combobox-disabled",
    );
    fireEvent.click(screen.getByRole("option", { name: /^Vườn C/u }));
    expect(onChange.mock.lastCall?.[0]).toEqual([
      { ...input(first, "1"), batch_id: third.batch_id },
      input(second, "2"),
    ]);
    expect(within(product).getByRole("textbox", { name: "Số lượng nguồn 1" })).toBe(quantity);
    expect(quantity).toHaveValue("1");
  });
});
