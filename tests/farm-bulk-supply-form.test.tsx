import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { FarmSupplyForm } from "@/components/farm-bulk-supply-form";
import { summarizeFarmBulkSupplyDraft, type FarmBulkSupplyDraft } from "@/lib/farm-bulk-draft";
import type { FarmProduct } from "@/lib/types";

function product(n: number, unit = "kg", size = "0.500", name = `Product ${n}`): FarmProduct {
  return {
    id: `source-${n}`,
    product_id: `product-${n}`,
    farm_id: "farm",
    sku: `SKU-${n}`,
    name_vi: name,
    name_en: name,
    unit_size: size,
    unit_label_en: unit,
    unit_label_vi: unit,
    version: 3,
    supply_generation: 1,
    is_active: true,
    product_status: "active",
    supply_status: "supplying",
    available_quantity: 0,
    initial_quantity: 0,
    net_sold_quantity: 0,
    batch_count: 0,
    active_batch_count: 0,
    has_supply_history: false,
    removed_at: null,
    next_expiry_date: null,
  };
}

const dates = { start_date: "30/11/2099", end_date: "06/12/2099" };
const today = "2099-11-30";
const draft: FarmBulkSupplyDraft = { ...dates, items: {} };

afterEach(cleanup);

it.each([
  ["0", "positive_integer"],
  ["-1", "positive_integer"],
  ["1.5", "positive_integer"],
  ["1e2", "positive_integer"],
  ["2147483648", "integer_range"],
])("rejects the entered quantity %s", (quantity, error) => {
  const row = product(1);
  const result = summarizeFarmBulkSupplyDraft(
    { ...draft, items: { [row.product_id]: { product: row, quantity } } },
    "en",
    today,
  );
  expect(result.input).toBeNull();
  expect(result.items[0].quantityError).toBe(error);
});

it("uses JSON integers at the backend limit and skips blank inputs", () => {
  const first = product(1);
  const second = product(2);
  const { input } = summarizeFarmBulkSupplyDraft(
    {
      ...draft,
      items: {
        [first.product_id]: { product: first, quantity: "2147483647" },
        [second.product_id]: { product: second, quantity: "" },
      },
    },
    "en",
    today,
  );
  expect(input).toEqual({
    start_date: "2099-11-30",
    end_date: "2099-12-06",
    items: [
      {
        product_id: first.product_id,
        expected_link_id: first.id,
        expected_version: 3,
        quantity_units: 2147483647,
      },
    ],
  });
});

it("sums compatible units exactly and keeps free-text units separate", () => {
  const rows = [
    [product(1), "2147483647"],
    [product(2, "g", "0.001"), "1"],
    [product(3, "kg", "9999999.999"), "2147483647"],
    [product(4, "chai", "1"), "12"],
    [product(5, "quả", "1"), "30"],
    [product(6, "gói 500g", "2"), "3"],
  ] as const;
  const result = summarizeFarmBulkSupplyDraft(
    {
      ...draft,
      items: Object.fromEntries(
        rows.map(([product, quantity]) => [product.product_id, { product, quantity }]),
      ),
    },
    "vi",
    today,
  );
  expect(result.items.map(({ total }) => total)).toEqual([
    "1073741823.5 kg",
    "0.000001 kg",
    "21474836467852516.353 kg",
    "12 chai",
    "30 quả",
    "6 gói 500g",
  ]);
  expect(result.totals).toEqual(["21474837541594339.853001 kg", "12 chai", "30 quả", "6 gói 500g"]);
});

it("permits an earlier start, rejects expired and reversed periods, and enforces 50 items", () => {
  const rows = Array.from({ length: 51 }, (_, index) => product(index));
  const items = Object.fromEntries(
    rows.map((product) => [product.product_id, { product, quantity: "1" }]),
  );
  expect(summarizeFarmBulkSupplyDraft({ ...draft, items }, "en", today).input).toBeNull();
  delete items[rows.at(-1)!.product_id];
  expect(summarizeFarmBulkSupplyDraft({ ...draft, items }, "en", today).input?.items).toHaveLength(
    50,
  );
  expect(
    summarizeFarmBulkSupplyDraft({ ...draft, items, start_date: "29/11/2099" }, "en", today).input,
  ).not.toBeNull();
  expect(
    summarizeFarmBulkSupplyDraft({ ...draft, items, end_date: "29/11/2099" }, "en", today)
      .dateErrors.end_date,
  ).toBe("date_order");
  expect(
    summarizeFarmBulkSupplyDraft({ ...draft, items }, "en", "2099-12-07").dateErrors.end_date,
  ).toBe("expired");
  expect(
    summarizeFarmBulkSupplyDraft({ ...draft, items, start_date: "not a date" }, "en", today)
      .dateErrors.start_date,
  ).toBe("invalid_date");
});

it("keeps an entered item through search and page changes, including its original source version", () => {
  const first = product(1);
  const second = product(2, "g", "500");
  const onSubmit = vi.fn();
  function TestForm() {
    const [currentDraft, setDraft] = useState(draft);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const products = search ? [{ ...first, version: 4 }, second] : page === 1 ? [first] : [second];
    return (
      <FarmSupplyForm
        locale="en"
        draft={currentDraft}
        onDraftChange={setDraft}
        products={products}
        search={search}
        onSearch={setSearch}
        pagination={{ page, pageSize: 20, total: 80, onChange: setPage }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );
  }

  render(<TestForm />);
  const save = screen.getByRole("button", { name: "Save supply" });
  const firstInput = screen.getByRole("textbox", { name: "Additional quantity — Product 1" });
  expect(firstInput).toHaveValue("");
  expect(save).toBeDisabled();
  fireEvent.change(firstInput, { target: { value: "100" } });
  expect(screen.getAllByText("50 kg").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const secondInput = screen.getByRole("textbox", { name: "Additional quantity — Product 2" });
  fireEvent.change(secondInput, { target: { value: "20" } });
  const searchInput = screen.getByRole("searchbox", { name: "Search products" });
  fireEvent.change(searchInput, { target: { value: "Product 2" } });
  fireEvent.submit(searchInput.closest("form")!);
  fireEvent.change(screen.getByRole("textbox", { name: "Additional quantity — Product 1" }), {
    target: { value: "101" },
  });
  fireEvent.click(save);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(onSubmit).toHaveBeenCalledWith({
    start_date: "2099-11-30",
    end_date: "2099-12-06",
    items: [
      {
        product_id: first.product_id,
        expected_link_id: first.id,
        expected_version: 3,
        quantity_units: 101,
      },
      {
        product_id: second.product_id,
        expected_link_id: second.id,
        expected_version: 3,
        quantity_units: 20,
      },
    ],
  });
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Product 2" }));
  expect(secondInput).toHaveValue("");
});

it("shows a keyed error for a product outside the active page and locks the supplied draft", () => {
  const first = product(1);
  const second = product(2);
  const onDraftChange = vi.fn();
  render(
    <FarmSupplyForm
      locale="en"
      draft={{ ...draft, items: { [first.product_id]: { product: first, quantity: "100" } } }}
      onDraftChange={onDraftChange}
      products={[second]}
      search=""
      onSearch={() => {}}
      locked
      cancelDisabled
      errors={{ items: { [first.product_id]: "The source changed." } }}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByRole("textbox", { name: "Additional quantity — Product 2" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save supply" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "View details" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  expect(screen.getByText("The source changed.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Remove Product 1" })).toBeDisabled();
  expect(onDraftChange).not.toHaveBeenCalled();
});

it("preserves the same quantity field and draft on desktop and mobile", () => {
  const row = product(1);
  let handleBreakpoint: EventListener | null = null;
  const matchMedia = vi.mocked(window.matchMedia);
  const original = matchMedia.getMockImplementation()!;
  matchMedia.mockImplementation((query) => {
    if (!query.startsWith("(min-width:")) return original(query);
    return {
      ...original(query),
      matches: true,
      addEventListener: (_: string, callback: EventListenerOrEventListenerObject | null) => {
        handleBreakpoint = callback as EventListener;
      },
    };
  });
  function TestForm() {
    const [currentDraft, setDraft] = useState(draft);
    return (
      <FarmSupplyForm
        locale="vi"
        draft={currentDraft}
        onDraftChange={setDraft}
        products={[row]}
        search=""
        onSearch={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    );
  }
  try {
    render(<TestForm />);
    const input = screen.getByRole("textbox", { name: "Số lượng bổ sung — Product 1" });
    fireEvent.change(input, { target: { value: "100" } });
    expect(screen.getByRole("button", { name: "Bỏ Product 1" })).toBeVisible();
    act(() => {
      handleBreakpoint?.(Object.assign(new Event("change"), { matches: false }));
    });
    expect(screen.queryByRole("button", { name: "Bỏ Product 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Số lượng bổ sung — Product 1" })).toBe(input);
    expect(input).toHaveValue("100");
  } finally {
    matchMedia.mockImplementation(original);
  }
});
