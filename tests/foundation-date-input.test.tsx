import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { AdminDateInput } from "@/components/admin-date-input";
import { FormField } from "@/components/nfv-controls";

afterEach(cleanup);
function DateField({ disabled, readOnly }: { disabled?: boolean; readOnly?: boolean }) {
  const [value, setValue] = useState("29/11/2099");
  return (
    <>
      <label htmlFor="date-field">Start date</label>
      <AdminDateInput
        id="date-field"
        pickerLabel="Choose start date"
        pickerMin="2099-11-28"
        value={value}
        onValueChange={setValue}
        disabled={disabled}
        readOnly={readOnly}
      />
      <output>{value}</output>
    </>
  );
}
it("preserves invalid and partial date drafts while providing an official calendar", () => {
  render(<DateField />);
  const input = screen.getByLabelText("Start date");
  fireEvent.change(input, { target: { value: "30112099" } });
  expect(input).toHaveValue("30/11/2099");
  fireEvent.change(input, { target: { value: "31022099" } });
  expect(input).toHaveValue("31/02/2099");
  fireEvent.blur(input);
  expect(input).toHaveValue("31/02/2099");
  fireEvent.change(input, { target: { value: "2" } });
  expect(input).toHaveValue("2");
  fireEvent.change(input, { target: { value: "29112099" } });
  const trigger = screen.getByRole("button", { name: "Choose start date" });
  fireEvent.click(trigger);
  const calendar = screen.getByRole("dialog", { name: "Choose start date" });
  expect(trigger).toHaveAttribute("aria-controls", calendar.id);
  expect(screen.getByRole("button", { name: "30 November 2099" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "27 November 2099" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "30 November 2099" }));
  expect(input).toHaveValue("30/11/2099");
});

it("keeps a read-only date readable and prevents typing or opening its calendar", () => {
  render(<DateField readOnly />);
  const input = screen.getByRole("textbox", { name: "Start date" });
  const trigger = screen.getByRole("button", { name: "Choose start date" });
  expect(input).toHaveAttribute("readonly");
  expect(input).toBeEnabled();
  expect(trigger).toBeDisabled();
  fireEvent.change(input, { target: { value: "30112099" } });
  fireEvent.click(trigger);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(input).toHaveValue("29/11/2099");
});

it("does not open or mutate a disabled date field", () => {
  const changed = vi.fn();
  render(
    <AdminDateInput
      id="date-field"
      pickerLabel="Choose start date"
      value="29/11/2099"
      onValueChange={changed}
      disabled
    />,
  );
  expect(screen.getByRole("button", { name: "Choose start date" })).toBeDisabled();
  const input = screen.getByRole("textbox");
  expect(input).toBeDisabled();
  fireEvent.change(input, { target: { value: "30112099" } });
  fireEvent.click(screen.getByRole("button", { name: "Choose start date" }));
  expect(screen.queryByRole("button", { name: "30 November 2099" })).toBeNull();
  expect(input).toHaveValue("29/11/2099");
  expect(changed).not.toHaveBeenCalled();
});

it.each(["disabled", "readOnly"] as const)(
  "closes the calendar when the field becomes %s and leaves it closed after unlocking",
  (restriction) => {
    const view = render(<DateField />);
    const trigger = screen.getByRole("button", { name: "Choose start date" });
    fireEvent.click(trigger);
    const day = screen.getByRole("button", { name: "30 November 2099" });
    expect(day).toBeVisible();
    view.rerender(<DateField {...{ [restriction]: true }} />);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(day);
    expect(screen.getByRole("textbox", { name: "Start date" })).toHaveValue("29/11/2099");
    view.rerender(<DateField />);
    expect(trigger).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
);

it("associates FormField feedback with a specialized control's explicit ID", () => {
  render(
    <FormField label="Start date" error="Choose a valid date" hint="Day/month/year">
      <AdminDateInput
        id="start-date"
        pickerLabel="Choose start date"
        value="31/02/2099"
        onValueChange={vi.fn()}
      />
    </FormField>,
  );
  const input = screen.getByRole("textbox", { name: "Start date" });
  expect(input).toHaveAttribute("id", "start-date");
  expect(input).toBeInvalid();
  expect(input).toHaveAccessibleDescription("Choose a valid date Day/month/year");
});

it("keeps the consuming workflow's validation message associated with its date input", () => {
  render(
    <>
      <AdminDateInput
        id="date-field"
        pickerLabel="Choose start date"
        value="31/02/2099"
        onValueChange={() => {}}
        aria-invalid
        aria-describedby="date-error"
      />
      <p id="date-error">Choose a valid calendar date</p>
    </>,
  );
  expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Choose a valid calendar date");
});
