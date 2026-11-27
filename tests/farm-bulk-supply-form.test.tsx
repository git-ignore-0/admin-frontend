import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { FarmSupplyForm } from "@/components/farm-bulk-supply-form";
import { farmBulkSupplyInput, type FarmBulkSupplyDraft } from "@/lib/farm-bulk-draft";
import {
  summarizeFarmSupplyDraft,
  type FarmSupplyDraft,
  type FarmSupplyProduct,
} from "@/lib/farm-supply-form";
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
  const result = summarizeFarmSupplyDraft(
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
  const { input } = summarizeFarmSupplyDraft(
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
  expect(input && farmBulkSupplyInput(input)).toEqual({
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
  const result = summarizeFarmSupplyDraft(
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
  expect(summarizeFarmSupplyDraft({ ...draft, items }, "en", today).input).toBeNull();
  delete items[rows.at(-1)!.product_id];
  expect(summarizeFarmSupplyDraft({ ...draft, items }, "en", today).input?.items).toHaveLength(50);
  expect(
    summarizeFarmSupplyDraft({ ...draft, items, start_date: "29/11/2099" }, "en", today).input,
  ).not.toBeNull();
  expect(
    summarizeFarmSupplyDraft({ ...draft, items, end_date: "29/11/2099" }, "en", today).dateErrors
      .end_date,
  ).toBe("date_order");
  expect(
    summarizeFarmSupplyDraft({ ...draft, items }, "en", "2099-12-07").dateErrors.end_date,
  ).toBe("expired");
  expect(
    summarizeFarmSupplyDraft({ ...draft, items, start_date: "not a date" }, "en", today).dateErrors
      .start_date,
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
        submitLabel="Save supply"
        draft={currentDraft}
        onDraftChange={setDraft}
        products={products}
        search={search}
        onSearch={setSearch}
        pagination={{ page, pageSize: 20, total: 80, onChange: setPage }}
        onSubmit={(input) => onSubmit(farmBulkSupplyInput(input))}
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
      submitLabel="Save supply"
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

it("preserves draft when content shrinks from collapsed to expanded sidebar width", async () => {
  const row = product(1);
  const OriginalObserver = window.ResizeObserver;
  let changeWidth!: (width: number) => void;
  window.ResizeObserver = class extends OriginalObserver {
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      changeWidth = (width) => callback([{ contentRect: { width } } as ResizeObserverEntry], this);
    }
  };
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
    // 1024px viewport, 48px total content padding, sidebar 64px or 244px.
    act(() => changeWidth(912));
    expect(await screen.findByRole("button", { name: "Bỏ Product 1" })).toBeVisible();
    act(() => changeWidth(732));
    await screen.findByRole("button", { name: "Xem chi tiết" });
    expect(screen.queryByRole("button", { name: "Bỏ Product 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Số lượng bổ sung — Product 1" })).toBe(input);
    expect(input).toHaveValue("100");
  } finally {
    window.ResizeObserver = OriginalObserver;
  }
});

it("places the supply dates, search toolbar and Data List in separate Foundation groups", () => {
  render(
    <FarmSupplyForm
      locale="en"
      submitLabel="Save supply"
      draft={draft}
      onDraftChange={() => {}}
      products={[product(1)]}
      search=""
      onSearch={() => {}}
      pagination={{ page: 1, pageSize: 20, total: 80, onChange: () => {} }}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  const dates = screen.getByRole("region", { name: "Supply period" });
  const list = screen.getByRole("region", { name: "Farm products" });
  const search = screen.getByRole("searchbox", { name: "Search products" });
  const table = screen.getByRole("table");
  const next = screen.getByRole("button", { name: "Next" });
  expect(dates).toContainElement(screen.getByLabelText("Start date"));
  expect(dates).not.toContainElement(search);
  expect(list).not.toContainElement(search);
  expect(list).toContainElement(table);
  expect(list).toContainElement(next);
  expect(next.closest("footer")).not.toBeNull();
  expect(list.querySelector("[role=separator]")).not.toBeNull();
});

it("rejects invalid clipboard text before the input can silently strip it", () => {
  function TestForm() {
    const [currentDraft, setDraft] = useState(draft);
    return (
      <FarmSupplyForm
        locale="en"
        submitLabel="Save supply"
        draft={currentDraft}
        onDraftChange={setDraft}
        products={[product(1)]}
        search=""
        onSearch={() => {}}
        onSubmit={() => {}}
      />
    );
  }

  render(<TestForm />);
  const input = screen.getByRole<HTMLInputElement>("textbox", {
    name: "Additional quantity — Product 1",
  });
  const submit = screen.getByRole("button", { name: "Save supply" });
  expect(input).toHaveAttribute("inputmode", "numeric");
  expect(input).toHaveValue("");
  fireEvent.change(input, { target: { value: "12" } });
  expect(submit).toBeEnabled();
  input.select();
  expect(fireEvent.paste(input, { clipboardData: { getData: () => "1e3" } })).toBe(false);
  expect(input).toHaveValue("1e3");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(submit).toBeDisabled();
  for (const invalid of ["1.5", "-12", "+12", "11E2", "abc123", "0", "2147483648"]) {
    fireEvent.change(input, { target: { value: invalid } });
    fireEvent.blur(input);
    expect(input).toHaveValue(invalid);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
  }
  fireEvent.change(input, { target: { value: "2147483647" } });
  expect(submit).toBeEnabled();
  fireEvent.change(input, { target: { value: "" } });
  expect(input).not.toHaveAttribute("aria-invalid", "true");
  expect(submit).toBeDisabled();
});

it("renders a Farmer projection without stock and submits the product identity from first entry", () => {
  const first = {
    product_id: "product-1",
    sku: "GREEN-MIX",
    name_vi: "Rau xanh",
    name_en: "Leafy greens",
    unit_size: "0.500",
    unit_label_en: "kg",
    unit_label_vi: "kg",
    product_identity: "a".repeat(64),
  } satisfies FarmSupplyProduct & { product_identity: string };
  const onSubmit = vi.fn();
  function TestFarmer() {
    const [currentDraft, setDraft] = useState<FarmSupplyDraft<typeof first>>({
      ...dates,
      items: {},
    });
    const [refreshed, setRefreshed] = useState(false);
    return (
      <>
        <button onClick={() => setRefreshed(true)}>Change listing</button>
        <FarmSupplyForm
          locale="en"
          draft={currentDraft}
          onDraftChange={setDraft}
          products={[
            refreshed ? { ...first, unit_size: "1.000", product_identity: "b".repeat(64) } : first,
          ]}
          search=""
          onSearch={() => {}}
          submitLabel="Send request"
          quantityLabel="Supply quantity"
          onSubmit={onSubmit}
        />
      </>
    );
  }

  render(<TestFarmer />);
  expect(screen.queryByText(/Remaining/)).not.toBeInTheDocument();
  const input = screen.getByRole("textbox", { name: "Supply quantity — Leafy greens" });
  fireEvent.change(input, { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Change listing" }));
  fireEvent.change(input, { target: { value: "120" } });
  expect(screen.getAllByText("60 kg").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  expect(onSubmit).toHaveBeenCalledWith({
    start_date: "2099-11-30",
    end_date: "2099-12-06",
    items: [{ product: first, quantity_units: 120 }],
  });
});
