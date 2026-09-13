import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { MembershipPaymentPlanManager } from "@/components/membership-payment-plan-manager";
import { api } from "@/lib/client-api";
import type { MembershipPackagePriceOption } from "@/lib/types";

vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/membership-packages",
  useSearchParams: () => new URLSearchParams(),
}));

const option: MembershipPackagePriceOption = {
  id: "a0c0313a-85df-4c29-930a-f19a05f3d8c4",
  duration_months: 3,
  monthly_price_vnd: "400000",
  total_price_vnd: "1200000",
  sort_order: 0,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  payment_plans: [],
};
const sixMonthOption: MembershipPackagePriceOption = {
  ...option,
  duration_months: 6,
  monthly_price_vnd: "1000000",
  total_price_vnd: "6000000",
};

function show(
  item: MembershipPackagePriceOption = option,
  locale: "vi" | "en" = "en",
  onReload = vi.fn(async () => undefined),
) {
  render(
    <AdminI18nProvider initialLocale={locale}>
      <MembershipPaymentPlanManager option={item} onReload={onReload} />
    </AdminI18nProvider>,
  );
  return onReload;
}

function backendError(code: string, fields?: unknown) {
  return Object.assign(new Error(code), { payload: { errors: [{ code, fields }] } });
}

function fillValidFullPlan() {
  fireEvent.click(screen.getByRole("button", { name: "Add method" }));
  fireEvent.change(screen.getByRole("textbox", { name: /^Package total value/ }), {
    target: { value: "1200000" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /^Amount per payment/ }), {
    target: { value: "1200000" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /^Months covered/ }), {
    target: { value: "3" },
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("membership payment-plan manager", () => {
  it("uses one mutually exclusive radio group and keeps the existing payment type payload", async () => {
    vi.mocked(api).mockResolvedValue({});
    show(sixMonthOption);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    const group = screen.getByRole("radiogroup", { name: "Payment type" });
    const full = within(group).getByRole("radio", { name: "Pay in full" });
    const installment = within(group).getByRole("radio", { name: "Installments" });
    expect(within(group).queryByRole("combobox")).toBeNull();
    expect(full).toHaveAttribute("aria-checked", "true");
    expect(installment).toHaveAttribute("aria-checked", "false");
    expect(full.closest("label")).toHaveClass("selected");
    fireEvent.click(installment);
    expect(full).not.toBeChecked();
    expect(installment).toBeChecked();
    expect(installment.closest("label")).toHaveClass("selected");
    expect(screen.getAllByRole("textbox", { name: /^Months covered/ })).toHaveLength(2);
    expect(
      screen
        .getAllByRole("textbox", { name: /^Months covered/ })
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["3", "3"]);
    fireEvent.click(full);
    expect(full).toBeChecked();
    expect(installment).not.toBeChecked();
    expect(screen.getAllByRole("textbox", { name: /^Months covered/ })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: /^Months covered/ })).toHaveValue("6");
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body))).toMatchObject({
      payment_type: "full",
      installments: [{ amount: "6000000", cycle_count: 6 }],
    });
  });

  it("keeps the editor compact without repeated context, hints, or an empty state", () => {
    show(sixMonthOption);
    expect(screen.getByText("No payment method is configured yet.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));

    expect(screen.queryByText("No payment method is configured yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Package duration")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Installments: divide the package value across multiple payments."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Payment method information")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Package total value/ })).toBeVisible();
    expect(document.querySelectorAll(".payment-plan-total-row")).toHaveLength(1);

    const scheduleHead = document.querySelector(".payment-plan-schedule-head");
    expect(scheduleHead).toHaveAttribute("aria-hidden", "true");
    const firstRow = document.querySelector(".payment-plan-schedule-row") as HTMLElement;
    expect(firstRow.querySelector(".payment-plan-schedule-field-label")).toBeTruthy();
  });

  it("removes only the divider above the Payment Plan header", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const managerRule = css.match(/\.payment-plan-manager \{([\s\S]*?)\n\}/u)?.[1] ?? "";

    expect(managerRule).not.toContain("border-top");
    expect(css).toMatch(
      /\.payment-plan-schedule-row \{[\s\S]*?border-top: 1px solid var\(--border\);/u,
    );
    expect(css).toMatch(/\.price-option-card \{[\s\S]*?border: 1px solid var\(--border\);/u);
  });

  it("keeps the compact months field and accessible remove icon in each payment row", () => {
    show(sixMonthOption);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    fireEvent.click(screen.getByRole("radio", { name: "Installments" }));
    expect(screen.queryByRole("button", { name: /Remove payment/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add payment" }));
    const remove = screen.getByRole("button", { name: "Remove payment 2" });
    const row = remove.closest(".payment-plan-schedule-row") as HTMLElement;
    expect(row).toBeTruthy();
    expect(within(row).getByText("Payment 2")).toBeVisible();
    expect(within(row).getByRole("textbox", { name: /^Amount per payment/ })).toBeVisible();
    expect(within(row).getByRole("textbox", { name: "Months covered" })).toBeVisible();
    expect(
      within(row).getByRole("textbox", { name: "Months covered" }).closest("label"),
    ).toHaveClass("payment-plan-months-field");
    expect(remove).toHaveClass("icon-only-action", "payment-plan-remove-payment");
    expect(remove.querySelector("svg")).toBeTruthy();
    expect(remove).not.toHaveTextContent("Remove");
    fireEvent.click(remove);
    expect(screen.queryByRole("button", { name: /Remove payment/ })).toBeNull();

    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(
      /\.payment-plan-type-row \{\s*display: grid;\s*grid-template-columns: max-content minmax\(0, 1fr\);/u,
    );
    expect(css).toMatch(/\.payment-plan-type-choices \{\s*display: flex;/u);
    expect(css).toMatch(/\.payment-plan-months-field \.input \{\s*width: min\(96px, 100%\);/u);
    expect(css).toContain('grid-template-areas: "title amount months total remove";');
    expect(css).toContain('"title title remove"');
    expect(css).toContain('"title remove"');
    expect(css).toContain(".payment-plan-type-option:has(input:focus-visible)");
    expect(css).toContain(".payment-plan-type-option:hover");
    expect(css).toContain(".payment-plan-type-option:has(input:disabled)");
  });

  it("labels the remove icon and radio options in Vietnamese", () => {
    show(sixMonthOption, "vi");
    fireEvent.click(screen.getByRole("button", { name: "Thêm phương thức" }));
    expect(screen.getByRole("radiogroup", { name: "Loại thanh toán" })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "Trả góp" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm lần trả" }));
    expect(screen.getByRole("button", { name: "Bỏ lần thanh toán 1" })).toBeVisible();
  });

  it.each([
    [2, ["3", "3"]],
    [3, ["2", "2", "2"]],
    [4, ["1", "1", "1", "3"]],
    [5, ["1", "1", "1", "1", "2"]],
    [6, ["1", "1", "1", "1", "1", "1"]],
  ])("distributes six months across %i installments", (count, expected) => {
    show(sixMonthOption);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    fireEvent.click(screen.getByRole("radio", { name: "Installments" }));
    for (let index = 2; index < count; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add payment" }));
    }
    expect(
      screen
        .getAllByRole("textbox", { name: /^Months covered/ })
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(expected);
    if (count === 6) expect(screen.getByRole("button", { name: "Add payment" })).toBeDisabled();
    else expect(screen.getByRole("button", { name: "Add payment" })).toBeEnabled();
  });

  it("redistributes months after count changes while preserving entered amounts", () => {
    show(sixMonthOption);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    fireEvent.click(screen.getByRole("radio", { name: "Installments" }));
    let months = screen.getAllByRole("textbox", { name: /^Months covered/ });
    const amounts = screen.getAllByRole("textbox", { name: /^Amount per payment/ });
    fireEvent.change(amounts[0], { target: { value: "3000000" } });
    fireEvent.change(amounts[1], { target: { value: "3000000" } });
    fireEvent.change(months[0], { target: { value: "1" } });
    fireEvent.change(months[1], { target: { value: "5" } });
    expect(screen.getByRole("button", { name: "Save method" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Add payment" }));
    months = screen.getAllByRole("textbox", { name: /^Months covered/ });
    expect(months.map((input) => (input as HTMLInputElement).value)).toEqual(["2", "2", "2"]);
    expect(
      screen
        .getAllByRole("textbox", { name: /^Amount per payment/ })
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["3000000", "3000000", ""]);
    expect(screen.getByRole("button", { name: "Save method" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove payment 3" }));
    expect(
      screen
        .getAllByRole("textbox", { name: /^Months covered/ })
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["3", "3"]);
    expect(screen.getByRole("button", { name: "Save method" })).toBeEnabled();
  });

  it("accepts custom positive months that total six and retains cycle_count in the payload", async () => {
    vi.mocked(api).mockResolvedValue({});
    show(sixMonthOption);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    fireEvent.click(screen.getByRole("radio", { name: "Installments" }));
    const amounts = screen.getAllByRole("textbox", { name: /^Amount per payment/ });
    const months = screen.getAllByRole("textbox", { name: /^Months covered/ });
    fireEvent.change(amounts[0], { target: { value: "2000000" } });
    fireEvent.change(amounts[1], { target: { value: "4000000" } });
    fireEvent.change(months[0], { target: { value: "1" } });
    fireEvent.change(months[1], { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body))).toMatchObject({
      installment_count: 2,
      installments: [
        { sequence: 1, amount: "2000000", cycle_count: 1 },
        { sequence: 2, amount: "4000000", cycle_count: 5 },
      ],
    });
  });

  it("rejects zero, negative, and mismatched month allocations inline", () => {
    show(sixMonthOption);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    fireEvent.click(screen.getByRole("radio", { name: "Installments" }));
    const months = screen.getAllByRole("textbox", { name: /^Months covered/ });
    const save = screen.getByRole("button", { name: "Save method" });
    fireEvent.change(months[0], { target: { value: "0" } });
    expect(months[0]).toHaveAttribute("aria-invalid", "true");
    expect(save).toBeDisabled();
    fireEvent.change(months[0], { target: { value: "-1" } });
    expect(months[0]).toHaveValue("");
    expect(save).toBeDisabled();
    fireEvent.change(months[0], { target: { value: "1" } });
    expect(
      screen.getByText("Months covered must add up to the price-option duration.", {
        selector: `#payment-plan-${option.id}-schedule-error`,
      }),
    ).toBeVisible();
    expect(months[0]).toHaveAttribute(
      "aria-describedby",
      `payment-plan-${option.id}-schedule-error`,
    );
    expect(save).toBeDisabled();
  });

  it("submits one full-payment row covering all six months", async () => {
    vi.mocked(api).mockResolvedValue({});
    show(sixMonthOption);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    expect(screen.getAllByRole("textbox", { name: /^Months covered/ })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: /^Months covered/ })).toHaveValue("6");
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body)).installments).toEqual([
      { sequence: 1, amount: "6000000", cycle_count: 6 },
    ]);
  });

  it("uses month terminology in both locales without old cycle labels", () => {
    show(sixMonthOption);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    expect(screen.getByRole("textbox", { name: "Months covered" })).toBeVisible();
    expect(screen.getByText("Total months")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/Cycles per payment|Total cycles/i);
    cleanup();

    show(sixMonthOption, "vi");
    fireEvent.click(screen.getByRole("button", { name: "Thêm phương thức" }));
    expect(screen.getByRole("textbox", { name: "Số tháng áp dụng" })).toBeVisible();
    expect(screen.getByText("Tổng số tháng")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/Số kỳ từng lần|Tổng số kỳ/);
  });

  it("locks a one-month option to one full payment and one cycle", async () => {
    vi.mocked(api).mockResolvedValue({});
    show({ ...option, duration_months: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    expect(screen.getByRole("radiogroup", { name: "Payment type" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Pay in full" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByRole("radio", { name: "Installments" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^Amount per payment/ })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: /^Months covered/ })).toHaveValue("1");
    expect(screen.getByRole("textbox", { name: /^Months covered/ })).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Add payment" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /^Package total value/ }), {
      target: { value: "400000" },
    });
    expect(screen.getByRole("textbox", { name: /^Amount per payment/ })).toHaveValue("400000");
    expect(screen.getByRole("textbox", { name: /^Amount per payment/ })).toHaveAttribute(
      "readonly",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body))).toMatchObject({
      payment_type: "full",
      installment_count: 1,
      installments: [{ sequence: 1, amount: "400000", cycle_count: 1 }],
    });
  });

  it("adds and removes installment rows, renumbering the submitted sequence", async () => {
    vi.mocked(api).mockResolvedValue({});
    show();
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    expect(screen.getByRole("radio", { name: "Installments" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Installments" }));
    expect(screen.getAllByRole("textbox", { name: /^Amount per payment/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Save method" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add payment" }));
    expect(screen.getAllByRole("textbox", { name: /^Amount per payment/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add payment" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove payment 1" }));
    expect(screen.getAllByRole("textbox", { name: /^Amount per payment/ })).toHaveLength(2);
    fireEvent.change(screen.getByRole("textbox", { name: /^Package total value/ }), {
      target: { value: "1200000" },
    });
    const amounts = screen.getAllByRole("textbox", { name: /^Amount per payment/ });
    const cycles = screen.getAllByRole("textbox", { name: /^Months covered/ });
    fireEvent.change(amounts[0], { target: { value: "600000" } });
    fireEvent.change(amounts[1], { target: { value: "600000" } });
    fireEvent.change(cycles[0], { target: { value: "1" } });
    fireEvent.change(cycles[1], { target: { value: "2" } });
    expect(screen.getByRole("button", { name: "Save method" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body)).installments).toEqual([
      { sequence: 1, amount: "600000", cycle_count: 1 },
      { sequence: 2, amount: "600000", cycle_count: 2 },
    ]);
  });

  it("disables saving for wrong totals, zero cycles and a single installment", () => {
    show();
    fillValidFullPlan();
    const save = screen.getByRole("button", { name: "Save method" });
    expect(save).toBeEnabled();
    expect(screen.getByRole("textbox", { name: /^Months covered/ })).toHaveAttribute("readonly");
    fireEvent.change(screen.getByRole("textbox", { name: /^Amount per payment/ }), {
      target: { value: "1000000" },
    });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Installments" }));
    const months = screen.getAllByRole("textbox", { name: /^Months covered/ });
    fireEvent.change(months[0], {
      target: { value: "0" },
    });
    expect(save).toBeDisabled();
    expect(months[0]).toHaveAttribute(
      "aria-describedby",
      `payment-plan-${option.id}-cycle-0-error`,
    );
    expect(months[0]).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(months[0], {
      target: { value: "2" },
    });
    expect(save).toBeDisabled();
    expect(
      screen.getAllByText("Months covered must add up to the price-option duration.")[0],
    ).toBeVisible();
  });

  it("calculates savings from the current option monthly price and duration", () => {
    show();
    fillValidFullPlan();
    fireEvent.change(screen.getByRole("textbox", { name: /^Package total value/ }), {
      target: { value: "1000000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^Amount per payment/ }), {
      target: { value: "1000000" },
    });
    const preview = document.querySelector(".payment-plan-preview") as HTMLElement;
    expect(within(preview).getByText("Valid configuration")).toBeVisible();
    expect(within(preview).getByText("3 / 3")).toBeVisible();
    expect(within(preview).getAllByText("₫1,000,000")).toHaveLength(3);
    expect(screen.getByText(/₫200,000 · 16.67%/)).toBeVisible();
  });

  it("does not invent savings without a valid current option price", () => {
    show({ ...option, monthly_price_vnd: "0" });
    fillValidFullPlan();
    expect(screen.getByText(/No data available/)).toBeVisible();
  });

  it("does not show a zero-percent saving when the plan equals the current option baseline", () => {
    show();
    fillValidFullPlan();
    fireEvent.change(screen.getByRole("textbox", { name: /^Package total value/ }), {
      target: { value: "1200000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^Amount per payment/ }), {
      target: { value: "1200000" },
    });
    expect(screen.getByText(/No data available/)).toBeVisible();
    expect(screen.queryByText(/Save 0\.00%/)).not.toBeInTheDocument();
  });

  it("uses a six-month option's own ₫900,000 monthly price as the saving baseline", () => {
    const sixMonthsAtNineHundredThousand = {
      ...sixMonthOption,
      monthly_price_vnd: "900000",
      total_price_vnd: "5400000",
    };
    show(sixMonthsAtNineHundredThousand);
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    const total = screen.getByRole("textbox", { name: /^Package total value/ });
    const amount = screen.getByRole("textbox", { name: /^Amount per payment/ });
    expect(total).toHaveValue("5400000");
    expect(amount).toHaveValue("5400000");
    expect(screen.getByText("No data available")).toBeVisible();
    expect(screen.queryByText(/Save 0\.00%/)).not.toBeInTheDocument();

    fireEvent.change(total, { target: { value: "5000000" } });
    fireEvent.change(amount, { target: { value: "5000000" } });
    expect(screen.getByText(/₫400,000 · 7\.41%/)).toBeVisible();
  });

  it("rejects editing a legacy installment schedule with only one payment", () => {
    show({
      ...option,
      payment_plans: [
        {
          id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
          price_option_id: option.id,
          name: "Legacy single installment",
          payment_type: "installment",
          total_amount: "1200000",
          installment_count: 1,
          sort_order: 0,
          is_active: false,
          in_use: false,
          initial_payment_amount: "1200000",
          installments: [{ sequence: 1, amount: "1200000", cycle_count: 3 }],
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Save method" })).toBeDisabled();
    expect(screen.getAllByText(/Full payment requires one payment/)[0]).toBeVisible();
  });

  it("warns about legacy one-month installment plans and only allows unused plans to be repaired", () => {
    const legacy = {
      id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
      price_option_id: option.id,
      name: "Legacy",
      payment_type: "installment" as const,
      total_amount: "400000",
      installment_count: 2,
      sort_order: 0,
      is_active: false,
      in_use: false,
      initial_payment_amount: "200000",
      installments: [
        { sequence: 1, amount: "200000", cycle_count: 1 },
        { sequence: 2, amount: "200000", cycle_count: 1 },
      ],
    };
    show({ ...option, duration_months: 1, payment_plans: [legacy] });
    expect(screen.getByText(/legacy installment method is invalid/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("radio", { name: "Pay in full" })).toBeChecked();
    expect(screen.getAllByRole("textbox", { name: /^Amount per payment/ })).toHaveLength(1);
  });

  it("warns about malformed legacy one-month plans even with one installment row", () => {
    show({
      ...option,
      duration_months: 1,
      payment_plans: [
        {
          id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
          price_option_id: option.id,
          name: "Legacy malformed amount",
          payment_type: "full",
          total_amount: "400000",
          installment_count: 1,
          sort_order: 0,
          is_active: false,
          in_use: false,
          initial_payment_amount: "200000",
          installments: [{ sequence: 1, amount: "200000", cycle_count: 1 }],
        },
      ],
    });
    expect(screen.getByText(/legacy installment method is invalid/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
  });

  it("keeps a used legacy one-month installment read-only", () => {
    show({
      ...option,
      duration_months: 1,
      payment_plans: [
        {
          id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
          price_option_id: option.id,
          name: "Used legacy",
          payment_type: "installment",
          total_amount: "400000",
          installment_count: 2,
          sort_order: 0,
          is_active: false,
          in_use: true,
          initial_payment_amount: "200000",
          installments: [
            { sequence: 1, amount: "200000", cycle_count: 1 },
            { sequence: 2, amount: "200000", cycle_count: 1 },
          ],
        },
      ],
    });
    expect(screen.getByText(/legacy installment method is invalid/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
  });

  it("previews and saves only a valid full-payment schedule", async () => {
    vi.mocked(api).mockResolvedValue({});
    const onReload = show();
    expect(screen.getByRole("heading", { name: "Payment methods" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add method" }));
    const save = screen.getByRole("button", { name: "Save method" });
    expect(screen.getByRole("textbox", { name: /^Package total value/ })).toHaveValue("1200000");
    expect(screen.getByRole("textbox", { name: /^Amount per payment/ })).toHaveValue("1200000");
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: /^Package total value/ }), {
      target: { value: "1200000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^Amount per payment/ }), {
      target: { value: "1200000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^Months covered/ }), {
      target: { value: "3" },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    const [path, request] = vi.mocked(api).mock.calls[0];
    expect(path).toBe(`admin/membership-price-options/${option.id}/payment-plans`);
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({
      name: "Full payment",
      payment_type: "full",
      total_amount: "1200000",
      installment_count: 1,
      installments: [{ sequence: 1, amount: "1200000", cycle_count: 3 }],
    });
  });

  it("requires installment totals and prevents editing a used plan", () => {
    show({
      ...option,
      payment_plans: [
        {
          id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
          price_option_id: option.id,
          name: "Sold plan",
          payment_type: "installment",
          total_amount: "1200000",
          installment_count: 2,
          sort_order: 0,
          is_active: false,
          in_use: true,
          initial_payment_amount: "600000",
          installments: [
            { sequence: 1, amount: "600000", cycle_count: 1 },
            { sequence: 2, amount: "600000", cycle_count: 2 },
          ],
        },
      ],
    });
    expect(screen.getByText("Used by a purchase request")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it.each([
    [
      "payment_plan_amount_total_mismatch",
      "Installment amounts must add up to the payment method total.",
      "Package total value",
    ],
    [
      "payment_plan_cycle_total_mismatch",
      "Months covered must add up to the price-option duration.",
      null,
    ],
  ])("places %s next to the affected editor field", async (code, message, field) => {
    vi.mocked(api).mockRejectedValue(backendError(code));
    show();
    fillValidFullPlan();
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    const alert = await screen.findByText(message);
    expect(alert).toBeVisible();
    expect(alert.closest(".payment-plan-editor")).toBeTruthy();
    if (field) {
      expect(screen.getByRole("textbox", { name: new RegExp(`^${field}`) })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByRole("textbox", { name: new RegExp(`^${field}`) })).toHaveAttribute(
        "aria-describedby",
        `payment-plan-${option.id}-total-error`,
      );
    }
    expect(
      screen.queryByText("Payment method could not be saved. Check the details or try again."),
    ).not.toBeInTheDocument();
  });

  it("maps nested serializer fields to the installment input without raw backend text", async () => {
    vi.mocked(api).mockRejectedValue(
      backendError("payment_plan_invalid", { installments: [{ amount: ["Database detail"] }] }),
    );
    show();
    fillValidFullPlan();
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    expect(
      await screen.findByText("Each payment amount must be a valid positive whole-VND amount."),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: /^Amount per payment/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByText("Database detail")).not.toBeInTheDocument();
  });

  it("shows an unrecognized server error inside the editor without exposing its message", async () => {
    vi.mocked(api).mockRejectedValue(backendError("private_database_error"));
    show();
    fillValidFullPlan();
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    expect(
      (
        await screen.findByText(
          "Payment method could not be saved. Check the details or try again.",
        )
      ).closest(".payment-plan-editor"),
    ).toBeTruthy();
    expect(screen.queryByText("private_database_error")).not.toBeInTheDocument();
  });

  it("shows in-use and activation errors safely in both locales", async () => {
    const plan = {
      id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
      price_option_id: option.id,
      name: "Existing",
      payment_type: "full" as const,
      total_amount: "1200000",
      installment_count: 1,
      sort_order: 0,
      is_active: false,
      in_use: false,
      initial_payment_amount: "1200000",
      installments: [{ sequence: 1, amount: "1200000", cycle_count: 3 }],
    };
    vi.mocked(api).mockRejectedValueOnce(backendError("payment_plan_installment_count_mismatch"));
    show({ ...option, payment_plans: [plan] }, "vi");
    fireEvent.click(screen.getByRole("button", { name: "Kích hoạt" }));
    expect(
      await screen.findByText(
        "Trả thẳng cần 1 lần; trả góp cần từ 2 lần đến tối đa số tháng của gói.",
      ),
    ).toBeVisible();
    vi.mocked(api).mockRejectedValueOnce(backendError("payment_plan_in_use"));
    fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu phương thức" }));
    expect(
      (
        await screen.findByText("Phương thức đã được sử dụng; không thể sửa hoặc xóa lịch sử.")
      ).closest(".payment-plan-editor"),
    ).toBeTruthy();
  });

  it("maps an active duplicate plan to its localized activation guidance", async () => {
    const plan = {
      id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
      price_option_id: option.id,
      name: "Existing",
      payment_type: "full" as const,
      total_amount: "1200000",
      installment_count: 1,
      sort_order: 0,
      is_active: false,
      in_use: false,
      initial_payment_amount: "1200000",
      installments: [{ sequence: 1, amount: "1200000", cycle_count: 3 }],
    };
    vi.mocked(api).mockRejectedValueOnce(backendError("payment_plan_active_duplicate"));
    show({ ...option, payment_plans: [plan] }, "vi");

    fireEvent.click(screen.getByRole("button", { name: "Kích hoạt" }));

    expect(
      await screen.findByText(
        "Đã có một phương thức cùng loại đang được bật. Hãy tắt phương thức đó trước.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText("Phương thức đã thay đổi trong lúc xử lý. Hãy tải lại danh sách."),
    ).not.toBeInTheDocument();
  });

  it("reports a failed refresh without repeating a successful mutation", async () => {
    vi.mocked(api).mockResolvedValue({});
    const onReload = vi
      .fn()
      .mockRejectedValueOnce(new Error("reload failed"))
      .mockResolvedValueOnce(undefined);
    show(option, "en", onReload);
    fillValidFullPlan();
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    expect(
      await screen.findByText(/change was saved, but the list could not be refreshed/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save method" })).toBeDisabled();
    expect(api).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Reload payment methods" }));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save method" })).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/change was saved, but the list could not be refreshed/),
    ).not.toBeInTheDocument();
  });
});
