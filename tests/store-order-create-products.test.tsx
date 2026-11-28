import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import {
  StoreOrderAmounts,
  StoreOrderCreatePricing,
  StoreOrderCreateProducts,
  StoreOrderProspectiveStatus,
} from "@/components/store-order-create-products";
import type { StoreOrderKind } from "@/lib/admin-store-order-api";
import {
  blankStoreOrderDraft,
  validateStoreOrderDraft,
  type StoreOrderDraft,
} from "@/lib/store-order-draft";
import { formatStoreMoney } from "@/lib/store-orders";
import type { StoreProduct } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const product: StoreProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  category_id: "33333333-3333-4333-8333-333333333333",
  category_slug: "vegetables",
  sku: "TOMATO",
  slug: "tomato",
  unit_size: "1.500",
  unit_label_vi: "kg",
  unit_label_en: "kg",
  retail_price_vnd: "45000",
  csa_quota_group_id: null,
  csa_quota_group: null,
  csa_quota_cost: 0,
  primary_image_id: null,
  primary_image: null,
  status: "active",
  translations: [{ locale: "en", name: "Tomato", description: "", short_description: "" }],
  created_at: "2026-10-31T10:00:00Z",
  updated_at: "2026-10-31T10:00:00Z",
};

function EditableOrder({
  kind,
  productsError,
  lineErrors,
  shippingError,
}: {
  kind: StoreOrderKind;
  productsError?: string;
  lineErrors?: Parameters<typeof StoreOrderCreateProducts>[0]["lineErrors"];
  shippingError?: string;
}) {
  const [draft, setDraft] = useState<StoreOrderDraft<StoreProduct>>({
    ...blankStoreOrderDraft<StoreProduct>(),
    kind,
    shippingFee: "10",
    lines: [{ product, quantity: "12", unitPrice: "50" }],
  });
  const preview = validateStoreOrderDraft(draft, "en");
  return (
    <AdminI18nProvider initialLocale="en">
      <StoreOrderCreateProducts
        kind={kind}
        lines={draft.lines}
        preview={preview}
        disabled={false}
        showErrors={false}
        productsError={productsError}
        lineErrors={lineErrors}
        onPicker={() => {}}
        onEdit={(id, values) =>
          setDraft((current) => ({
            ...current,
            lines: current.lines.map((line) =>
              line.product.id === id ? { ...line, ...values } : line,
            ),
          }))
        }
        onRemove={(id) =>
          setDraft((current) => ({
            ...current,
            lines: current.lines.filter((line) => line.product.id !== id),
          }))
        }
      />
      <StoreOrderCreatePricing
        kind={kind}
        rawShipping={draft.shippingFee}
        shippingFeeRejected={draft.shippingFeeRejected}
        preview={preview}
        disabled={false}
        showErrors={false}
        shippingError={shippingError}
        onShippingChange={(shippingFee, shippingFeeRejected) =>
          setDraft((current) => ({ ...current, shippingFee, shippingFeeRejected }))
        }
      />
    </AdminI18nProvider>
  );
}

function paste(input: HTMLInputElement, value: string) {
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? input.value.length;
  if (!fireEvent.paste(input, { clipboardData: { getData: () => value } })) return;
  const candidate = input.value.slice(0, start) + value + input.value.slice(end);
  const caret = start + value.length;
  fireEvent.input(input, {
    target: { value: candidate, selectionStart: caret, selectionEnd: caret },
    data: value,
    inputType: "insertFromPaste",
  });
}

it("rejects invalid keyboard, clipboard, and input operations while replacing selections with valid integers", () => {
  render(<EditableOrder kind="historical" />);
  const quantity = screen.getByRole<HTMLInputElement>("textbox", { name: "Quantity · Tomato" });
  quantity.setSelectionRange(0, 1);
  for (const invalid of ["e", "E", "-", ".", "x"]) {
    expect(fireEvent.keyDown(quantity, { key: invalid })).toBe(false);
    paste(quantity, `1${invalid}2`);
    expect(quantity).toHaveValue("12");
    expect(quantity.selectionStart).toBe(0);
    expect(quantity.selectionEnd).toBe(1);
  }
  paste(quantity, "3\n4");
  expect(quantity).toHaveValue("12");
  paste(quantity, "3");
  expect(quantity).toHaveValue("32");
  expect(quantity.selectionStart).toBe(1);

  fireEvent.input(quantity, { target: { value: "3.2" }, data: "." });
  expect(quantity).toHaveValue("32");
  quantity.setSelectionRange(0, 2);
  paste(quantity, "1000");
  expect(quantity).toHaveValue("32");
  expect(quantity.selectionEnd).toBe(2);
  fireEvent.change(quantity, { target: { value: "0" } });
  expect(quantity).toHaveValue("32");
  fireEvent.change(quantity, { target: { value: "1000" } });
  expect(quantity).toHaveValue("32");
  fireEvent.change(quantity, { target: { value: "" } });
  expect(quantity).toHaveValue("");
  fireEvent.change(quantity, { target: { value: "999" } });
  expect(quantity).toHaveValue("999");

  const unitPrice = screen.getByRole("textbox", { name: "Unit price (VND) · Tomato" });
  const fee = screen.getByRole("textbox", { name: "Delivery fee (VND)" });
  for (const input of [unitPrice, fee]) {
    fireEvent.change(input, { target: { value: "9007199254740991" } });
    expect(input).toHaveValue("9007199254740991");
    fireEvent.change(input, { target: { value: "9007199254740992" } });
    expect(input).toHaveValue("9007199254740991");
    fireEvent.change(input, { target: { value: "0" } });
    expect(input).toHaveValue("0");
  }
});

it("commits a composition only when the full replacement is valid", () => {
  render(<EditableOrder kind="historical" />);
  const quantity = screen.getByRole<HTMLInputElement>("textbox", { name: "Quantity · Tomato" });
  quantity.setSelectionRange(0, 1);
  fireEvent.compositionStart(quantity);
  fireEvent.input(quantity, { target: { value: "32" }, isComposing: true, data: "3" });
  fireEvent.input(quantity, { target: { value: "3e2" }, isComposing: true, data: "3e" });
  fireEvent.compositionEnd(quantity, { data: "3e" });
  expect(quantity).toHaveValue("12");
  expect(quantity).toHaveAccessibleDescription("Enter a whole number from 1 to 999.");
  expect(quantity.selectionStart).toBe(0);
  expect(quantity.selectionEnd).toBe(1);

  fireEvent.compositionStart(quantity);
  fireEvent.input(quantity, { target: { value: "42" }, isComposing: true, data: "4" });
  fireEvent.compositionEnd(quantity, { data: "4" });
  expect(quantity).toHaveValue("42");
  expect(quantity).not.toHaveAttribute("aria-invalid", "true");
});

it("announces rejected replacements at the control and preserves keyboard shortcuts", () => {
  render(<EditableOrder kind="historical" />);
  const quantity = screen.getByRole<HTMLInputElement>("textbox", { name: "Quantity · Tomato" });
  for (const operation of [
    { key: "ArrowLeft" },
    { key: "a", ctrlKey: true },
    { key: "z", metaKey: true },
    { key: "Backspace" },
  ]) {
    expect(fireEvent.keyDown(quantity, operation)).toBe(true);
  }
  expect(quantity).not.toHaveAttribute("aria-invalid", "true");

  quantity.select();
  paste(quantity, "1.5");
  expect(quantity).toHaveValue("12");
  expect(quantity).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a whole number from 1 to 999.");
  paste(quantity, "12");
  expect(quantity).not.toHaveAttribute("aria-invalid", "true");

  const fee = screen.getByRole<HTMLInputElement>("textbox", { name: /Delivery fee/ });
  fee.select();
  paste(fee, "-100");
  expect(fee).toHaveValue("10");
  expect(fee).toHaveAccessibleDescription(/enter a whole VND amount/i);
  paste(fee, "000100");
  expect(fee).toHaveValue("000100");
  expect(fee).not.toHaveAttribute("aria-invalid", "true");
});

it("presents catalog amounts as estimates and historical payment as received or unnecessary", () => {
  const view = render(<EditableOrder key="new" kind="new" />);
  const row = screen.getByRole("listitem", { name: "Tomato" });
  expect(within(row).getByText("TOMATO · 1.5 kg")).toBeVisible();
  expect(within(row).getByText("Estimated line total")).toBeVisible();
  expect(within(row).getByText(formatStoreMoney("540000", "en"))).toBeVisible();
  const payment = screen.getByRole("region", { name: "Payment" });
  expect(within(payment).getByText("Estimated subtotal")).toBeVisible();
  expect(within(payment).getByText("Payment not confirmed")).toBeVisible();
  expect(within(payment).getAllByText("Calculated at confirmation")).toHaveLength(2);

  view.rerender(<EditableOrder key="historical" kind="historical" />);
  const historical = screen.getByRole("region", { name: "Payment" });
  expect(within(historical).getByText("Total to record")).toBeVisible();
  expect(within(historical).queryByText("Amount due")).not.toBeInTheDocument();
  expect(within(historical).getByText("Delivered")).toBeVisible();
  expect(within(historical).getByText("Payment received")).toBeVisible();
  expect(within(historical).getByText(formatStoreMoney("610", "en"))).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Unit price (VND) · Tomato" }), {
    target: { value: "0" },
  });
  fireEvent.change(within(historical).getByRole("textbox", { name: "Delivery fee (VND)" }), {
    target: { value: "0" },
  });
  expect(within(historical).getByText("No bank transfer required")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Remove Tomato" }));
  expect(screen.queryByRole("listitem", { name: "Tomato" })).not.toBeInTheDocument();
});

it("explains when valid individual amounts produce a historical total above the order limit", () => {
  render(<EditableOrder kind="historical" />);
  fireEvent.change(screen.getByRole("textbox", { name: "Unit price (VND) · Tomato" }), {
    target: { value: "9007199254740991" },
  });
  const historical = screen.getByRole("region", { name: "Payment" });
  expect(within(historical).getByRole("alert")).toHaveTextContent(
    "The total is above the Store order limit.",
  );
  expect(within(historical).queryByText("Payment received")).not.toBeInTheDocument();
});

it("associates backend errors with the affected controls and product row", () => {
  render(
    <EditableOrder
      kind="historical"
      productsError="Review the product list."
      lineErrors={{
        [product.id]: {
          product: "This product is no longer available.",
          quantity: "Change this quantity.",
          unitPrice: "Review this unit price.",
        },
      }}
      shippingError="Review the delivery fee."
    />,
  );
  const add = screen.getByRole("button", { name: "Add products" });
  expect(add).toHaveAttribute("aria-invalid", "true");
  expect(add).toHaveAccessibleDescription("Review the product list.");
  const row = within(screen.getByRole("listitem", { name: "Tomato" }));
  expect(row.getByRole("alert")).toHaveTextContent("This product is no longer available.");
  expect(row.getByRole("alert")).toHaveAttribute("tabindex", "-1");
  for (const [name, error] of [
    ["Quantity · Tomato", "Change this quantity."],
    ["Unit price (VND) · Tomato", "Review this unit price."],
    ["Delivery fee (VND)", "Review the delivery fee."],
  ]) {
    const input = screen.getByRole("textbox", { name });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(error);
  }
});

it("shows confirmed amounts with the free-delivery reason and the quoted payment outcome", () => {
  render(
    <AdminI18nProvider initialLocale="en">
      <StoreOrderAmounts
        kind="new"
        subtotal="0"
        shipping="0"
        total="0"
        authoritative
        shippingDiscountReason="csa_companion_delivery"
      />
      <StoreOrderProspectiveStatus kind="new" total="0" />
    </AdminI18nProvider>,
  );
  expect(screen.getByText("Listed product value")).toBeVisible();
  expect(screen.getByText("Free-delivery reason")).toBeVisible();
  expect(screen.getByText("No bank transfer required")).toBeVisible();
  expect(screen.queryByText("Calculated at confirmation")).not.toBeInTheDocument();
});
