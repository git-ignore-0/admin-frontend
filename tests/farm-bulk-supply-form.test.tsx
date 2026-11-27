import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

function trackContainerSizes() {
  const observers = new Map<Element, (width: number) => void>();
  const OriginalObserver = window.ResizeObserver;
  window.ResizeObserver = class extends OriginalObserver {
    private elements = new Set<Element>();
    constructor(private callback: ResizeObserverCallback) {
      super(callback);
    }
    observe(element: Element) {
      this.elements.add(element);
      observers.set(element, (width) =>
        this.callback([{ target: element, contentRect: { width } } as ResizeObserverEntry], this),
      );
    }
    disconnect() {
      for (const element of this.elements) observers.delete(element);
      this.elements.clear();
    }
  };
  return {
    parentOf(element: Element) {
      return Array.from(observers.keys()).find(
        (target) => target !== element && target.contains(element),
      );
    },
    resize(element: Element, width: number) {
      const update = observers.get(element);
      expect(update).toBeDefined();
      act(() => update?.(width));
    },
    restore: () => {
      window.ResizeObserver = OriginalObserver;
    },
  };
}

it("preserves focused draft when Form and Data List change widths independently", async () => {
  const row = { ...product(1), available_quantity: 30 };
  const sizes = trackContainerSizes();
  function TestForm() {
    const [currentDraft, setDraft] = useState(draft);
    return (
      <FarmSupplyForm
        locale="en"
        draft={currentDraft}
        onDraftChange={setDraft}
        products={[row]}
        remaining={(source) => source.available_quantity}
        search=""
        onSearch={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    );
  }
  try {
    render(<TestForm />);
    const dataList = screen.getByRole("region", { name: "Farm products" });
    const formLayout = sizes.parentOf(dataList)!;
    const inputLabel = "Additional quantity — Product 1";
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: inputLabel });
    fireEvent.change(input, { target: { value: "100" } });
    input.focus();
    input.setSelectionRange(1, 2);

    // The sidebar can change available form width without dimension changes in the viewport.
    sizes.resize(formLayout, 912);
    sizes.resize(dataList, 620);
    const table = await screen.findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Product", "Remaining", "Additional quantity", "Converted quantity"]);
    expect(within(table).getByRole("cell", { name: "30" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Remove Product 1" })).toBeVisible();
    const summaryRegion = screen.getByRole("region", { name: "Supply summary" });
    const period = within(summaryRegion).getByText("Supply period");
    const selectedProduct = within(summaryRegion).getByRole("listitem");
    const count = within(summaryRegion).getByText("1 product");
    const total = within(summaryRegion).getByText("Total: 50 kg");
    const save = within(summaryRegion).getByRole("button", { name: "Submit" });
    for (const [before, after] of [
      [period, selectedProduct],
      [selectedProduct, count],
      [count, total],
      [total, save],
    ]) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const wideInput = screen.getByRole<HTMLInputElement>("textbox", { name: inputLabel });
    expect(wideInput).toHaveFocus();
    expect(wideInput.selectionStart).toBe(1);
    expect(wideInput.selectionEnd).toBe(2);

    // The data list can become compact while the overall form still has two columns.
    sizes.resize(dataList, 530);
    const compactRow = await within(dataList).findByRole("listitem");
    expect(within(dataList).queryByRole("table")).not.toBeInTheDocument();
    expect(within(dataList).queryByRole("columnheader")).not.toBeInTheDocument();
    expect(compactRow.children).toHaveLength(2);
    expect(compactRow.children[0]).toHaveTextContent("Remaining: 30");
    expect(compactRow.children[1]).toContainElement(within(compactRow).getByText("50 kg"));
    const compactInput = within(compactRow).getByRole("textbox", { name: inputLabel });
    expect(compactInput.nextElementSibling).toBeNull();
    expect(compactInput).toHaveFocus();
    expect(compactInput).toHaveValue("100");
    expect(screen.getAllByRole("textbox", { name: inputLabel })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove Product 1" })).toBeVisible();

    sizes.resize(formLayout, 732);
    await screen.findByRole("button", { name: "View details" });
    expect(screen.queryByRole("button", { name: "Remove Product 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: inputLabel })).toBe(compactInput);
    expect(compactInput).toHaveValue("100");
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByRole("button", { name: "Hide details" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Remove Product 1" })).toBeVisible();
  } finally {
    sizes.restore();
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
  const products = screen.getByRole("list", { name: "Farm products" });
  const next = screen.getByRole("button", { name: "Next" });
  expect(dates).toContainElement(screen.getByLabelText("Start date"));
  expect(dates).not.toContainElement(search);
  expect(list).not.toContainElement(search);
  expect(list).toContainElement(products);
  expect(list).toContainElement(next);
  expect(next.closest("footer")).not.toBeNull();
  expect(list.querySelector("[role=separator]")).not.toBeNull();
});

it("rejects the entire invalid edit without adding a warning or changing the accepted value", () => {
  const onSubmit = vi.fn();
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
        onSubmit={onSubmit}
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
  for (const key of ["a", "e", "E", ".", ",", "-", "+", " ", "@", "３"]) {
    expect(fireEvent.keyDown(input, { key })).toBe(false);
  }
  input.setSelectionRange(0, 1);
  for (const invalid of ["1e3", "1.5", "-12", "+12", "11E2", "abc123", "2,3", "2 3"]) {
    expect(fireEvent.paste(input, { clipboardData: { getData: () => invalid } })).toBe(false);
    fireEvent.change(input, { target: { value: invalid } });
    fireEvent.blur(input);
    expect(input).toHaveValue("12");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeEnabled();
  }
  expect(fireEvent.paste(input, { clipboardData: { getData: () => "2\n3" } })).toBe(false);
  // The browser can normalize a single-line input's DOM value before the callback.
  fireEvent.input(input, { target: { value: "23" }, data: "2\n3", inputType: "insertText" });
  expect(input).toHaveValue("12");
  expect(input).not.toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByText(/Use digits 0–9 only/)).not.toBeInTheDocument();

  input.setSelectionRange(0, 1);
  expect(fireEvent.paste(input, { clipboardData: { getData: () => "4" } })).toBe(true);
  // jsdom does not perform the default clipboard edit.
  fireEvent.input(input, { target: { value: "42" } });
  expect(input).toHaveValue("42");
  expect(input).not.toHaveAttribute("aria-invalid", "true");
  expect(submit).toBeEnabled();
  for (const invalid of ["0", "2147483648"]) {
    fireEvent.change(input, { target: { value: invalid } });
    fireEvent.blur(input);
    expect(input).toHaveValue(invalid);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
  }
  fireEvent.change(input, { target: { value: "2147483647" } });
  expect(input).toHaveValue("2147483647");
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  expect(onSubmit.mock.calls[0][0].items[0].quantity_units).toBe(2147483647);
  fireEvent.change(input, { target: { value: "" } });
  expect(input).not.toHaveAttribute("aria-invalid", "true");
  expect(submit).toBeDisabled();
});

it("preserves the accepted quantity across pagination and form remount after a blocked paste", () => {
  const onSubmit = vi.fn();
  function TestForm() {
    const [currentDraft, setDraft] = useState(draft);
    const [page, setPage] = useState(1);
    const [formVersion, setFormVersion] = useState(0);
    return (
      <>
        <button onClick={() => setFormVersion((version) => version + 1)}>Remount the form</button>
        <FarmSupplyForm
          key={formVersion}
          locale="en"
          submitLabel="Save supply"
          draft={currentDraft}
          onDraftChange={setDraft}
          products={[product(page)]}
          search=""
          onSearch={() => {}}
          pagination={{ page, pageSize: 1, total: 2, onChange: setPage }}
          onSubmit={onSubmit}
        />
      </>
    );
  }

  render(<TestForm />);
  const firstInput = screen.getByRole("textbox", { name: "Additional quantity — Product 1" });
  fireEvent.change(firstInput, { target: { value: "100" } });
  fireEvent.paste(firstInput, { clipboardData: { getData: () => "1e3" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const secondInput = screen.getByRole("textbox", { name: "Additional quantity — Product 2" });
  fireEvent.change(secondInput, { target: { value: "20" } });
  expect(screen.getByRole("button", { name: "Save supply" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Remount the form" }));
  const save = screen.getByRole("button", { name: "Save supply" });
  expect(save).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  const summary = screen.getByRole("region", { name: "Supply summary" });
  expect(within(summary).getByRole("heading", { level: 2 })).toHaveTextContent("Supply summary");
  expect(within(summary).getByText("2 products entered")).toBeVisible();
  const compactTotal = within(summary).getByText("60 kg");
  expect(compactTotal.parentElement).toContainElement(
    within(summary).getByRole("button", { name: "Hide details" }),
  );
  const firstItem = within(summary).getAllByRole("listitem")[0];
  const remove = within(firstItem).getByRole("button", { name: "Remove Product 1" });
  const name = within(firstItem).getByText("Product 1");
  const quantity = within(firstItem).getByText("100 × 0.5 kg");
  const converted = within(firstItem).getByText("50 kg");
  expect(remove.parentElement).toBe(name.parentElement);
  expect(converted.parentElement).toBe(quantity.parentElement);
  expect(name.parentElement?.nextElementSibling).toBe(quantity.parentElement);
  expect(within(summary).queryByText(/Use digits 0–9 only/)).not.toBeInTheDocument();
  fireEvent.click(save);
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      items: [
        { product: product(1), quantity_units: 100 },
        { product: product(2), quantity_units: 20 },
      ],
    }),
  );
});

it("renders a Farmer projection without stock at either width and keeps the original identity", async () => {
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

  const sizes = trackContainerSizes();
  try {
    render(<TestFarmer />);
    expect(screen.queryByText(/Remaining/)).not.toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Supply quantity — Leafy greens" });
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.change(input, { target: { value: "1e3" } });
    expect(input).toHaveValue("100");
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Change listing" }));
    fireEvent.change(input, { target: { value: "120" } });
    expect(screen.getAllByText("60 kg").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(onSubmit).toHaveBeenCalledWith({
      start_date: "2099-11-30",
      end_date: "2099-12-06",
      items: [{ product: first, quantity_units: 120 }],
    });
    const dataList = screen.getByRole("region", { name: "Farm products" });
    sizes.resize(dataList, 620);
    const table = await within(dataList).findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Product", "Supply quantity", "Converted quantity"]);
    expect(within(table).queryByText(/Remaining/)).not.toBeInTheDocument();
  } finally {
    sizes.restore();
  }
});
